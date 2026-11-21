import { describe, it, expect } from "vitest";
import { cashflows, irr, metrics, npvAt, tornado, validateInputs, DEFAULT_INPUTS, SCENARIO_DEFAULTS } from "@/lib/finance";
import { confidenceFrom, duplicateOf, freshness, contested, emptyOS } from "@/lib/evidence";
import { recommendAll, fingerprint, impactAnalysis, checkCitations, gateSummary } from "@/lib/decision";
import { blankProject } from "@/lib/repo";
import { makeNode } from "@/lib/graph";
import { GATES, type EvidenceItem, type EvaluationResult, type FinInputs, type GateAssessment, type Idea, type ProjectState } from "@/lib/schemas";

// ---------------------------------------------------------------- finance
describe("financial engine", () => {
  it("NPV and IRR match textbook values", () => {
    const flows = [-1000, 300, 400, 500];
    expect(npvAt(flows, 10)).toBeCloseTo(-21.04, 1);
    expect(irr(flows)).toBeCloseTo(8.9, 0);
    expect(irr([100, 200])).toBeNull(); // never negative → no IRR
  });

  const inp: FinInputs = { ...DEFAULT_INPUTS, horizonYears: 3, discountRate: 10, volumeY1: 1000, volumeGrowth: 50, price: 2000, variableCostPct: 40, fixedOpex: 600000, capex: 1000000 };

  it("builds year rows from explicit formulas", () => {
    const r = cashflows(inp);
    expect(r[0].cash).toBe(-1000000);
    expect(r[1].revenue).toBe(2_000_000);
    expect(r[1].ebitda).toBe(2_000_000 * 0.6 - 600000);
    expect(r[2].volume).toBe(1500);
  });

  it("payback interpolates within the year; ROI and cost of delay are consistent", () => {
    const m = metrics(inp);
    // cumulative: -1,000,000 → -400,000 → +800,000 ⇒ payback = 1 + 400k/1.2M
    expect(m.paybackYears).toBeCloseTo(1 + 400000 / 1_200_000, 6);
    expect(m.roi).toBeCloseTo((600000 + 1_200_000 + 2_100_000 - 1_000_000) / 1_000_000, 6);
    expect(m.costOfDelay).toBeGreaterThan(0);
    expect(m.npv).toBeCloseTo(npvAt(cashflows(inp).map((x) => x.cash), 10), 6);
  });

  it("scenarios move NPV in the expected direction", () => {
    const c = metrics(inp, SCENARIO_DEFAULTS.conservative).npv, b = metrics(inp).npv, o = metrics(inp, SCENARIO_DEFAULTS.optimistic).npv;
    expect(c).toBeLessThan(b);
    expect(o).toBeGreaterThan(b);
  });

  it("tornado ranks the most sensitive driver first", () => {
    const t = tornado(inp);
    expect(t[0].swing).toBeGreaterThanOrEqual(t[t.length - 1].swing);
  });

  it("rejects invalid financial inputs instead of calculating nonsense", () => {
    expect(validateInputs({ ...inp, price: -5 })).toContain("Price per unit must be between 0 and 1000000000000");
    expect(validateInputs({ ...inp, variableCostPct: 140 }).length).toBe(1);
    expect(validateInputs({ ...inp, horizonYears: 2.5 }).length).toBe(1);
    expect(validateInputs({ ...inp, volumeY1: Number.NaN }).length).toBeGreaterThan(0);
    expect(validateInputs(inp)).toEqual([]);
  });
});

// ---------------------------------------------------------------- evidence
const ev = (over: Partial<EvidenceItem>): EvidenceItem => ({
  id: over.id ?? Math.random().toString(36).slice(2), title: "t", origin: "o", excerpt: "x", type: "customer_interview",
  retrievedAt: "2026-11-01", reliability: "high", verification: "verified", links: [], addedBy: "user", createdAt: "2026-11-01", ...over,
});

describe("evidence confidence", () => {
  it("AI hypotheses carry no evidential weight", () => {
    const c = confidenceFrom([{ w: 0, stance: "supports", origin: "ai" }, { w: 0, stance: "supports", origin: "ai2" }]);
    expect(c.score).toBe(0);
    expect(c.aiOnly).toBe(true);
  });
  it("independent sources beat repeated quotes from one source", () => {
    const one = confidenceFrom([0.8, 0.8, 0.8].map((w) => ({ w, stance: "supports" as const, origin: "Interview 1" })));
    const three = confidenceFrom([0.8, 0.8, 0.8].map((w, i) => ({ w, stance: "supports" as const, origin: `Interview ${i}` })));
    expect(three.score).toBeGreaterThan(one.score);
    expect(one.supporting).toBe(1);
  });
  it("contradicting evidence lowers confidence", () => {
    const s = confidenceFrom([{ w: 0.8, stance: "supports", origin: "a" }, { w: 0.8, stance: "supports", origin: "b" }]);
    const sc = confidenceFrom([{ w: 0.8, stance: "supports", origin: "a" }, { w: 0.8, stance: "supports", origin: "b" }, { w: 1, stance: "contradicts", origin: "c" }]);
    expect(sc.score).toBeLessThan(s.score);
  });
  it("detects duplicates, staleness and contested claims", () => {
    const a = ev({ url: "https://x.com/r", origin: "Report" });
    expect(duplicateOf({ url: "https://X.com/r ", origin: "other", excerpt: "" }, [a])).toBe(a);
    expect(freshness({ publishedAt: "2024-01-01", retrievedAt: "2026-11-01" }, "2026-11-21")).toBe("stale");
    expect(freshness({ retrievedAt: "2026-11-01" }, "2026-11-21")).toBe("fresh");
    const os = { ...emptyOS(), evidence: [ev({ links: [{ targetKind: "concept", targetId: "I1", stance: "supports" }] }), ev({ links: [{ targetKind: "concept", targetId: "I1", stance: "contradicts" }] })] };
    expect(contested(os)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- decision intelligence
const idea = (id: string, title: string): Idea => ({ id, tier: "practical", title, summary: "s", targetUsers: "u", valueProposition: "value proposition text", howItWorks: "h", differentiator: "d", keyAssumptions: ["a"], risks: [], originNodeIds: [] });
const allScores = (score: number) => ["desirability", "fit", "feasibility", "viability", "differentiation", "timeToValue", "scalability", "risk"].map((dimension) => ({ dimension, score, rationale: "", evidence: "supported" as const, confidence: "medium" as const, assumptions: [], downside: "" }));
function fixture(): ProjectState {
  const p = blankProject("p1", "I want to improve the experience of purchasing premium handloom sarees online.", "guided");
  const ideas = [idea("I1", "Video-call styling"), idea("I2", "Weave provenance passport"), idea("I3", "Generic discount")];
  const evaluation: EvaluationResult = { caveats: "", evaluations: [
    { ideaId: "I1", impact: 4, riskLevel: 2, costLevel: 2, scores: allScores(80) },
    { ideaId: "I2", impact: 4, riskLevel: 2, costLevel: 2, scores: allScores(75) },
    { ideaId: "I3", impact: 1, riskLevel: 1, costLevel: 1, scores: allScores(30) },
  ] };
  const nodes = ideas.map((i) => makeNode({ type: "idea", title: i.title, tags: [`idea:${i.id}`] }, { source: "user", at: "" }));
  return { ...p, ideas: { ideas, notes: "" }, evaluation, nodes, os: emptyOS() };
}
const passAll = (): Partial<Record<(typeof GATES)[number], GateAssessment>> => Object.fromEntries(GATES.map((g) => [g, { status: "pass", note: "", by: "user", confirmed: true, at: "" }]));
const strong = (ideaId: string) => [1, 2, 3].map((i) => ev({ origin: `Interview ${i}`, links: [{ targetKind: "concept", targetId: ideaId, stance: "supports" }] }));

describe("decision intelligence", () => {
  it("separates attractiveness from evidence: a high score with no evidence must be validated, not approved", () => {
    const r = recommendAll(fixture()).find((x) => x.ideaId === "I1")!;
    expect(r.attractiveness).toBe(80);
    expect(["VALIDATE", "INVESTIGATE_FURTHER"]).toContain(r.status);
    expect(r.canApprove).toBe(false);
  });

  it("a failed mandatory gate blocks approval regardless of score and evidence", () => {
    const p = fixture();
    p.os!.evidence = strong("I1");
    p.os!.gates.I1 = { ...passAll(), regulatory: { status: "fail", note: "Silk Mark claims unverified", by: "user", confirmed: true, at: "" } };
    p.os!.businessCases = [{ ideaId: "I1", inputs: { ...DEFAULT_INPUTS, volumeY1: 5000, price: 9000, variableCostPct: 50, fixedOpex: 1e6, capex: 2e6 }, sources: {}, scenarios: SCENARIO_DEFAULTS, updatedAt: "" }];
    const r = recommendAll(p).find((x) => x.ideaId === "I1")!;
    expect(r.status).toBe("REWORK");
    expect(r.canApprove).toBe(false);
    expect(r.blockers[0]).toMatch(/Regulatory/);
  });

  it("walks the full ladder: evidence + gates → business case → approve for delivery", () => {
    const p = fixture();
    p.os!.evidence = strong("I1");
    let r = recommendAll(p).find((x) => x.ideaId === "I1")!;
    expect(r.status).toBe("VALIDATE"); // gates not assessed
    p.os!.gates.I1 = passAll();
    r = recommendAll(p).find((x) => x.ideaId === "I1")!;
    expect(r.status).toBe("PROCEED_TO_BUSINESS_CASE");
    p.os!.businessCases = [{ ideaId: "I1", inputs: { ...DEFAULT_INPUTS, volumeY1: 5000, price: 9000, variableCostPct: 50, fixedOpex: 1e6, capex: 2e6 }, sources: {}, scenarios: SCENARIO_DEFAULTS, updatedAt: "" }];
    r = recommendAll(p).find((x) => x.ideaId === "I1")!;
    expect(r.status).toBe("APPROVE_FOR_DELIVERY");
    // AI placeholder assumptions must be replaced before an investment decision
    p.os!.businessCases[0].sources = { price: { by: "ai", rationale: "placeholder" } };
    r = recommendAll(p).find((x) => x.ideaId === "I1")!;
    expect(r.status).toBe("PROCEED_TO_BUSINESS_CASE");
    expect(r.canApprove).toBe(false);
    p.os!.businessCases[0].sources = { price: { by: "user", rationale: "Shopify AOV" } };
    r = recommendAll(p).find((x) => x.ideaId === "I1")!;
    expect(r.canApprove).toBe(true);
  });

  it("unconfirmed AI gate assessments do not count as cleared", () => {
    const p = fixture();
    p.os!.evidence = strong("I1");
    p.os!.gates.I1 = Object.fromEntries(GATES.map((g) => [g, { status: "pass", note: "", by: "ai", confirmed: false, at: "" }]));
    expect(gateSummary(p.os!.gates.I1).unconfirmed).toHaveLength(GATES.length);
    expect(recommendAll(p).find((x) => x.ideaId === "I1")!.status).toBe("VALIDATE");
  });

  it("weak ideas backed by evidence are rejected; weak ideas without evidence are held", () => {
    const p = fixture();
    expect(recommendAll(p).find((x) => x.ideaId === "I3")!.status).toBe("HOLD");
    p.os!.evidence = strong("I3");
    expect(recommendAll(p).find((x) => x.ideaId === "I3")!.status).toBe("REJECT");
  });

  it("an assumption change after approval makes the approval stale (impact analysis)", () => {
    const p = fixture();
    const ideaNode = p.nodes[0];
    const a = makeNode({ type: "assumption", title: "Buyers trust video consultations", parentId: ideaNode.id }, { source: "user", at: "" });
    p.nodes = [...p.nodes, a];
    p.os!.approvals = [{ id: "x", ideaId: "I1", action: "approve", by: "Abhijit", note: "", at: "2026-11-21T00:00:00Z", recommended: "APPROVE_FOR_DELIVERY", fingerprint: fingerprint(p, "I1") }];
    expect(impactAnalysis(p)).toHaveLength(0);
    p.nodes = p.nodes.map((n) => (n.id === a.id ? { ...n, status: "invalidated" } : n));
    const imp = impactAnalysis(p);
    expect(imp.some((i) => i.kind === "approval" && i.ideaId === "I1")).toBe(true);
  });

  it("strips AI citations that are not in the evidence register", () => {
    const { answers, unsupported } = checkCitations([{ q: "Why?", a: "x", evidenceIds: ["E1", "FAKE-9"] }], new Set(["E1"]));
    expect(answers[0].evidenceIds).toEqual(["E1"]);
    expect(unsupported).toEqual(["FAKE-9"]);
  });
});

// ---------------------------------------------------------------- AI ops (dev templates, schema-validated)
import { runOp } from "@/lib/ai/gateway";
import { GatesSchema, DecisionReportSchema, ResearchGapsSchema, FinAssumptionsSchema } from "@/lib/schemas";
import { REPORT_QUESTIONS } from "@/lib/decision";
describe("OS AI operations", () => {
  const thought = "Our customer onboarding process takes 12 days. How can we reduce it to 3?";
  it("risk gates, report, research gaps and financial suggestions validate", async () => {
    expect(GatesSchema.parse((await runOp("gates", { thought, ideas: [{ id: "I1", title: "Digital KYC" }] })).data).assessments).toHaveLength(6);
    const rep = DecisionReportSchema.parse((await runOp("decision_report", { thought, idea: { title: "Digital KYC" }, recommendation: { status: "VALIDATE" }, alternatives: [], evidence: [], assumptions: [], questions: REPORT_QUESTIONS })).data);
    expect(rep.answers.map((a) => a.q)).toEqual(REPORT_QUESTIONS);
    expect(ResearchGapsSchema.parse((await runOp("research_gaps", { thought, targets: [{ kind: "problem", id: "root", statement: "Onboarding takes 12 days", confidence: 0 }] })).data).tasks.length).toBeGreaterThan(0);
    expect(FinAssumptionsSchema.parse((await runOp("fin_assumptions", { thought, idea: { title: "Digital KYC" }, currency: "GBP" })).data).drivers.length).toBe(9);
  });
  it("rejects malformed requests before any model call", async () => {
    await expect(runOp("decision_report", { thought, idea: {}, recommendation: {}, alternatives: [], evidence: [], assumptions: [], questions: ["only one"] })).rejects.toThrow();
  });
});
