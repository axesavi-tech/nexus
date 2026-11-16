import { describe, it, expect, beforeAll } from "vitest";
import { normalizeWeights, scoreIdeas, qualityCheck, paretoFrontier, weightSensitivity, DEFAULT_WEIGHTS } from "@/lib/scoring";
import { applyPatch, makeNode, radialLayout, topoOrder, sanitizeRoadmap, schedule, descendants, affectedByInvalidated } from "@/lib/graph";
import { recommendFrameworks, FRAMEWORKS } from "@/lib/frameworks";
import { runOp } from "@/lib/ai/gateway";
import { SAMPLES } from "@/lib/samples";
import {
  InterpretationSchema, NodePatchSchema, IdeasSchema, EvaluationSchema, BlueprintSchema, RoadmapSchema,
  DEFAULT_SLIDERS, type Idea, type EvaluationResult, type Roadmap, type NNode, type NEdge, type Interpretation, type IdeasResult, type Blueprint,
} from "@/lib/schemas";

const prov = { source: "user" as const, at: new Date().toISOString() };
const idea = (id: string, tier: Idea["tier"], title: string, summary = "summary text here"): Idea => ({
  id, tier, title, summary, targetUsers: "teachers", valueProposition: "Saves them a lot of preparation time", howItWorks: "x", differentiator: "y", keyAssumptions: ["a"], risks: [], originNodeIds: [],
});

describe("scoring engine", () => {
  const ideas = [idea("I1", "conservative", "A"), idea("I2", "moonshot", "B")];
  const ev: EvaluationResult = {
    caveats: "",
    evaluations: [
      { ideaId: "I1", impact: 2, riskLevel: 1, costLevel: 1, scores: [
        { dimension: "desirability", score: 80, rationale: "", evidence: "user_provided", confidence: "high", assumptions: [], downside: "" },
        { dimension: "feasibility", score: 40, rationale: "", evidence: "supported", confidence: "medium", assumptions: [], downside: "" },
      ] },
      { ideaId: "I2", impact: 5, riskLevel: 5, costLevel: 5, scores: [
        { dimension: "desirability", score: 60, rationale: "", evidence: "missing", confidence: "low", assumptions: [], downside: "" },
        { dimension: "feasibility", score: null, rationale: "", evidence: "missing", confidence: "low", assumptions: [], downside: "" },
      ] },
    ],
  };

  it("normalizes weights to sum to 1 and ignores zero/negative", () => {
    const n = normalizeWeights({ a: 20, b: 20, c: 0, d: -5 });
    expect(n).toEqual({ a: 0.5, b: 0.5 });
    const all = normalizeWeights(DEFAULT_WEIGHTS);
    expect(Object.values(all).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
  });

  it("computes weighted score over scored dimensions only, and marks gaps provisional", () => {
    const rows = scoreIdeas(ideas, ev, { desirability: 50, feasibility: 50 });
    const a = rows.find((r) => r.ideaId === "I1")!;
    const b = rows.find((r) => r.ideaId === "I2")!;
    expect(a.weighted).toBe(60); // (80*.5 + 40*.5)
    expect(a.coverage).toBe(1);
    expect(a.provisional).toBe(false);
    expect(b.weighted).toBe(60); // only desirability scored → 60, never fabricates feasibility
    expect(b.coverage).toBe(0.5);
    expect(b.provisional).toBe(true);
  });

  it("re-ranks when weights change and reports sensitivity", () => {
    const rows = scoreIdeas(ideas, ev, { desirability: 90, feasibility: 10 });
    expect(rows[0].ideaId).toBe("I1");
    const s = weightSensitivity(ideas, ev, { desirability: 50, feasibility: 50 });
    expect(s).toHaveLength(2);
  });

  it("finds the Pareto frontier on impact / risk / cost", () => {
    const rows = scoreIdeas(ideas, ev, DEFAULT_WEIGHTS);
    expect(paretoFrontier(rows).sort()).toEqual(["I1", "I2"]); // neither dominates the other
  });

  it("flags near-duplicates, missing users, constraint conflicts and low diversity", () => {
    const dup = [
      idea("I1", "practical", "Gamified maths app for children", "A gamified maths app with rewards for children"),
      idea("I2", "practical", "Gamified maths app for kids", "A gamified maths app with rewards for children and kids"),
      { ...idea("I3", "practical", "Paid tutoring", "tutoring with screens"), targetUsers: "" },
    ];
    const f = qualityCheck(dup, ["no screens"]);
    expect(f.some((x) => x.ideaId === "I2" && x.issue.startsWith("Near-duplicate"))).toBe(true);
    expect(f.some((x) => x.ideaId === "I3" && x.issue.includes("No intended users"))).toBe(true);
    expect(f.some((x) => x.ideaId === "I3" && x.issue.includes("constraint"))).toBe(true);
    expect(f.some((x) => x.ideaId === "*")).toBe(true);
  });
});

describe("graph operations", () => {
  const root = makeNode({ id: "r", type: "thought", title: "Root" }, prov);
  const a = makeNode({ id: "a", type: "problem", title: "A", parentId: "r", x: 300 }, prov);
  const nodes: NNode[] = [root, a];
  const edges: NEdge[] = [{ id: "e1", source: "r", target: "a", kind: "child" }];

  it("applies a patch locally: adds children, resolves refs, rejects unknown references, never deletes", () => {
    const res = applyPatch(nodes, edges, {
      summary: "s",
      addNodes: [
        { ref: "n1", type: "idea", title: "X", description: "", parentRef: "a", relation: "child", claim: "ai_inference" },
        { ref: "n2", type: "risk", title: "Y", description: "", parentRef: "n1", relation: "child", claim: "ai_inference" },
      ],
      updateNodes: [{ id: "a", description: "updated" }, { id: "ghost", description: "x" }],
      links: [{ sourceRef: "n2", targetRef: "r", kind: "crosslink" }, { sourceRef: "n1", targetRef: "nope", kind: "supports" }],
    }, { source: "ai", at: "t" }, "a");
    expect(res.nodes).toHaveLength(4);
    expect(res.nodes.find((n) => n.id === "a")!.description).toBe("updated");
    const n2 = res.nodes.find((n) => n.title === "Y")!;
    expect(res.nodes.find((n) => n.id === n2.parentId)!.title).toBe("X");
    expect(res.rejected.length).toBe(2);
    expect(res.nodes.find((n) => n.id === "r")!.x).toBe(root.x); // existing layout untouched
  });

  it("lays out radially with root at origin and computes descendants", () => {
    const laid = radialLayout(nodes);
    expect(laid.find((n) => n.id === "r")).toMatchObject({ x: 0, y: 0 });
    expect(descendants(nodes, "r")).toEqual(new Set(["a"]));
  });

  it("detects dependency cycles and sanitizes AI roadmaps", () => {
    expect(topoOrder([{ id: "1", dependsOn: ["2"] }, { id: "2", dependsOn: ["1"] }])).toBeNull();
    const r: Roadmap = {
      approach: "hybrid", planningAssumptions: ["x"], mvpDefinition: "m",
      phases: [{ id: "P1", name: "p", goal: "g", milestones: [{ id: "M1", title: "m", exitCriteria: "e" }] }],
      tasks: [
        { id: "T1", title: "a", description: "", milestoneId: "M1", dependsOn: ["T3", "T9"], priority: "high", acceptanceCriteria: [], role: "r", estimateDays: 2 },
        { id: "T2", title: "b", description: "", milestoneId: "MX", dependsOn: ["T1"], priority: "high", acceptanceCriteria: [], role: "r", estimateDays: 3 },
        { id: "T3", title: "c", description: "", milestoneId: "M1", dependsOn: ["T2"], priority: "high", acceptanceCriteria: [], role: "r", estimateDays: 1 },
      ],
      raci: [], risks: [], kpis: [], goLiveCriteria: [],
    };
    const { roadmap, fixes } = sanitizeRoadmap(r);
    expect(topoOrder(roadmap.tasks)).not.toBeNull();
    expect(roadmap.tasks[1].milestoneId).toBe("M1");
    expect(fixes.length).toBeGreaterThan(0);
    const sch = schedule(roadmap, "2026-01-01");
    expect(sch.cyclic).toBe(false);
    expect(sch.totalDays).toBe(6);
  });

  it("propagates an invalidated assumption to downstream nodes", () => {
    const idn = makeNode({ id: "i", type: "idea", title: "Idea", parentId: "r" }, prov);
    const asn = { ...makeNode({ id: "as", type: "assumption", title: "People want it", parentId: "i" }, prov), status: "invalidated" };
    const sol = makeNode({ id: "s", type: "solution", title: "Sol", parentId: "i" }, prov);
    const ms = makeNode({ id: "m", type: "milestone", title: "M", parentId: "s" }, prov);
    const aff = affectedByInvalidated([root, idn, asn, sol, ms], [{ id: "x", source: "i", target: "s", kind: "implements" }]);
    expect(aff.has("i") && aff.has("s") && aff.has("m")).toBe(true);
    expect(aff.has("as")).toBe(false);
  });
});

describe("framework engine", () => {
  it("has complete machine-readable metadata", () => {
    for (const f of FRAMEWORKS) {
      expect(f.inputs.length && f.outputs.length && f.categories.length && f.maturity.length).toBeTruthy();
      expect(f.avoidWhen && f.limitations && f.strengths && f.prompt).toBeTruthy();
    }
  });
  it("recommends at most three complementary frameworks with reasons", () => {
    const ops = recommendFrameworks({ text: "Our customer onboarding process takes 12 days. How can we reduce it to 3?", category: "operational", maturity: "defined", mode: "strategic" });
    expect(ops.length).toBeGreaterThan(0);
    expect(ops.length).toBeLessThanOrEqual(3);
    expect(new Set(ops.map((o) => FRAMEWORKS.find((f) => f.id === o.id)!.family)).size).toBe(ops.length);
    expect(ops.every((o) => o.reason.length > 10)).toBe(true);
    expect(ops.some((o) => ["sipoc", "five_whys", "vsm", "fishbone", "toc", "dmaic", "mece"].includes(o.id))).toBe(true);
    const tech = recommendFrameworks({ text: "What if we could create a new kind of low-power computing chip?", category: "physical", maturity: "raw", mode: "strategic" });
    expect(tech.some((o) => o.id === "first_principles")).toBe(true);
  });
});

describe("AI gateway — end-to-end workflow for every demonstration scenario (dev provider)", () => {
  beforeAll(() => { delete process.env.ANTHROPIC_API_KEY; });
  for (const s of SAMPLES) {
    it(`Scenario ${s.id}: ${s.label} — thought → map → options → evaluation → blueprint → roadmap`, async () => {
      const a = await runOp("analyze", { thought: s.thought, mode: s.mode });
      expect(a.mode).toBe("dev");
      const I = InterpretationSchema.parse(a.data) as Interpretation;
      expect(I.alternativeInterpretations.length).toBeGreaterThan(0);
      expect(I.clarifyingQuestions.length).toBeLessThanOrEqual(3);

      const node = await runOp("node", { action: "challenge", thought: s.thought, context: { focus: { id: "root", type: "thought", title: I.title, description: s.thought }, ancestry: [], siblings: [], children: [], others: [] } });
      expect(NodePatchSchema.parse(node.data).addNodes.length).toBeGreaterThan(0);

      const ideas = IdeasSchema.parse((await runOp("ideate", { thought: s.thought, interpretation: I, focus: [{ id: "root", type: "thought", title: I.title }], sliders: DEFAULT_SLIDERS })).data) as IdeasResult;
      expect(new Set(ideas.ideas.map((i) => i.tier)).size).toBe(4);

      const ev = EvaluationSchema.parse((await runOp("evaluate", { thought: s.thought, ideas: ideas.ideas })).data) as EvaluationResult;
      const ranked = scoreIdeas(ideas.ideas, ev, DEFAULT_WEIGHTS);
      expect(ranked[0].weighted).not.toBeNull();
      expect(ranked.every((r) => r.provisional)).toBe(true); // dev heuristics carry no evidence

      const bp = BlueprintSchema.parse((await runOp("blueprint", { thought: s.thought, interpretation: I, idea: ideas.ideas[1] })).data) as Blueprint;
      expect(bp.ideaId).toBe(ideas.ideas[1].id);

      const rm = RoadmapSchema.parse((await runOp("roadmap", { thought: s.thought, blueprint: bp, approach: s.id === "D" ? "personal" : "hybrid" })).data) as Roadmap;
      const { roadmap } = sanitizeRoadmap(rm);
      expect(topoOrder(roadmap.tasks)).not.toBeNull();
      expect(schedule(roadmap, "2026-12-01").totalDays).toBeGreaterThan(0);
    });
  }

  it("rejects malformed requests before calling any model", async () => {
    await expect(runOp("analyze", { thought: "", mode: "free" })).rejects.toThrow();
    await expect(runOp("roadmap", { thought: "x", blueprint: {}, approach: "chaotic" })).rejects.toThrow();
  });
});
