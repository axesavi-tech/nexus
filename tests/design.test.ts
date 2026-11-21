import { describe, it, expect } from "vitest";
import { runOp } from "@/lib/ai/gateway";
import { classifyLine, splitDump } from "@/lib/ai/dev";
import { dotBudget, isDuplicate, mergeHmws, quadrant, rankAssumptions, riskScore, testProgress, topSparks, TECHNIQUES_INFO } from "@/lib/design";
import {
  ClusterSchema, EmpathySchema, IdeasSchema, NodePatchSchema, SparksSchema, TestPlanSchema, TECHNIQUES,
  type Empathy, type Spark, type TestPlan, type TestRecord,
} from "@/lib/schemas";

const spark = (id: string, votes: number, source: Spark["source"] = "ai", createdAt = "2026-01-01"): Spark =>
  ({ id, hmwId: null, title: id, description: "", technique: "brainstorm", source, votes, createdAt });

describe("design-thinking helpers", () => {
  it("dot budget scales with sparks within 3..10", () => {
    expect(dotBudget(0)).toBe(3);
    expect(dotBudget(12)).toBe(4);
    expect(dotBudget(100)).toBe(10);
  });

  it("converges on voted sparks, ties favour the user's own ideas", () => {
    const top = topSparks([spark("a", 1), spark("b", 3), spark("c", 0), spark("d", 1, "user")]);
    expect(top.map((s) => s.id)).toEqual(["b", "d", "a"]);
  });

  it("detects near-duplicate sparks but not distinct ones", () => {
    expect(isDuplicate("One tap start for new users", [{ title: "One-tap start for new users!" }])).toBe(true);
    expect(isDuplicate("Buddy system for newcomers", [{ title: "One-tap start for new users" }])).toBe(false);
  });

  it("keeps the user's and starred HMWs when the AI regenerates", () => {
    const merged = mergeHmws(
      [{ id: "u", question: "How might we keep it fun?", source: "user" }, { id: "x", question: "Old AI one", source: "ai" }, { id: "s", question: "Starred AI one", source: "ai", starred: true }],
      [{ id: "H1", question: "How might we keep it fun?", povId: "POV1", angle: "amplify_good" }, { id: "H2", question: "How might we remove waiting?", povId: "POV1", angle: "remove_bad" }],
      "ai",
    );
    expect(merged.map((h) => h.question)).toEqual(["How might we keep it fun?", "Starred AI one", "How might we remove waiting?"]);
  });

  it("assumption mapping: riskiest = important with weak evidence", () => {
    const plan = { assumptions: [
      { id: "A1", statement: "x", lens: "desirability", importance: 5, evidence: 1 },
      { id: "A2", statement: "y", lens: "feasibility", importance: 5, evidence: 5 },
      { id: "A3", statement: "z", lens: "viability", importance: 1, evidence: 1 },
    ], tests: [], storyboard: [] } as unknown as TestPlan;
    expect(riskScore(plan.assumptions[0])).toBe(25);
    expect(quadrant(plan.assumptions[0])).toBe("test_first");
    expect(quadrant(plan.assumptions[1])).toBe("safe_bet");
    expect(quadrant(plan.assumptions[2])).toBe("monitor");
    expect(rankAssumptions(plan)[0].id).toBe("A1");
    const rec: TestRecord = { ...plan, ideaId: "I1", createdAt: "", results: { A1: { status: "invalidated", learning: "" }, A2: { status: "running", learning: "" } } };
    expect(testProgress(rec)).toEqual({ total: 3, done: 1, invalidated: 1, riskiestOpen: 0 });
  });

  it("brain dump: splits lines and classifies by honest type", () => {
    const lines = splitDump("- customers keep complaining delivery is too slow\n- what if we partnered with local tailors\n- budget is only 2L\nWhy do repeat buyers drop off?");
    expect(lines).toHaveLength(4);
    expect(lines.map((l) => classifyLine(l).type)).toEqual(["insight", "idea", "constraint", "question"]);
  });
});

describe("design-thinking AI operations (dev templates, validated by the same schemas as live AI)", () => {
  const thought = "How can I help schoolchildren enjoy mathematics?";

  it("empathize → personas, journeys, POVs and HMWs", async () => {
    const r = await runOp("empathize", { thought, notes: "", stakeholders: [{ title: "Pupils aged 8–11" }, { title: "Teachers" }] });
    const e = EmpathySchema.parse(r.data) as Empathy;
    expect(e.personas[0].basis).toBe("proto_persona");
    expect(e.personas[0].journey.length).toBeGreaterThanOrEqual(3);
    expect(e.hmws.every((h) => /^how might we/i.test(h.question))).toBe(true);
    const grounded = EmpathySchema.parse((await runOp("empathize", { thought, notes: "Interview: kids said fractions feel scary" })).data);
    expect(grounded.personas[0].basis).toBe("user_research");
  });

  it("every technique sparks valid ideas", async () => {
    for (const technique of TECHNIQUES) {
      const r = await runOp("spark", { thought, hmw: "How might we make fractions feel like a game?", technique, count: TECHNIQUES_INFO.find((t) => t.id === technique)!.count, wildness: 60, existing: [], seed: technique === "build" ? { title: "Fraction pizza party", description: "x" } : undefined });
      expect(SparksSchema.parse(r.data).sparks.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("cluster assigns every spark exactly once", async () => {
    const sparks = ["Buddy system", "One-tap start", "Progress bar", "Subscription box", "Weird thing"].map((t, i) => ({ id: `s${i}`, title: t, description: "" }));
    const c = ClusterSchema.parse((await runOp("cluster", { sparks })).data);
    const ids = c.clusters.flatMap((x) => x.sparkIds);
    expect(ids.sort()).toEqual(sparks.map((s) => s.id).sort());
  });

  it("voted sparks converge into concepts; concepts get a test plan", async () => {
    const r = await runOp("ideate", { thought, interpretation: null, focus: [], sliders: { creativity: 50 }, sparks: [{ title: "Maths escape room", description: "Solve puzzles to unlock the door", votes: 3 }, { title: "Pocket-money budgeting", description: "Real money maths", votes: 2 }] });
    const ideas = IdeasSchema.parse(r.data).ideas;
    expect(ideas[0].title).toBe("Maths escape room");
    const plan = TestPlanSchema.parse((await runOp("testplan", { thought, idea: ideas[0] })).data);
    expect(plan.tests.every((t) => plan.assumptions.some((a) => a.id === t.assumptionId))).toBe(true);
  });

  it("brain dump becomes a reviewable graph patch", async () => {
    const r = await runOp("node", { action: "structure", instruction: "kids think maths is boring\nwhat if lessons were games?\nonly 40 minutes per lesson", thought, context: { focus: { id: "root", type: "thought", title: thought, description: "" }, ancestry: [], siblings: [], children: [], others: [] } });
    const patch = NodePatchSchema.parse(r.data);
    expect(patch.addNodes.map((n) => n.type)).toEqual(["insight", "idea", "constraint"]);
    expect(patch.addNodes.every((n) => n.parentRef === "root")).toBe(true);
  });
});
