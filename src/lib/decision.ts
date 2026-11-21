/**
 * Decision intelligence (deterministic). Attractiveness (weighted score) and evidence confidence are kept on
 * separate axes; mandatory risk & policy gates can block a concept regardless of its score; only a human can
 * approve. Every rule that fires is returned as a reason so the recommendation is auditable.
 */
import { scoreIdeas, type RankedIdea } from "./scoring";
import { conceptConfidence, problemConfidence, type Confidence } from "./evidence";
import { metrics } from "./finance";
import type { ApprovalRecord, DecisionStatus, GateAssessment, GateKey, ProjectState } from "./schemas";
import { GATES } from "./schemas";

export const STATUS_LABEL: Record<DecisionStatus, string> = {
  INVESTIGATE_FURTHER: "Investigate further", VALIDATE: "Validate", PROCEED_TO_BUSINESS_CASE: "Proceed to business case",
  APPROVE_FOR_DELIVERY: "Approve for delivery", REWORK: "Rework", HOLD: "Hold", REJECT: "Reject",
};
export const STATUS_TONE: Record<DecisionStatus, string> = {
  INVESTIGATE_FURTHER: "var(--t-question)", VALIDATE: "var(--warn)", PROCEED_TO_BUSINESS_CASE: "var(--t-opportunity)",
  APPROVE_FOR_DELIVERY: "var(--ok)", REWORK: "var(--t-assumption)", HOLD: "var(--ink-3)", REJECT: "var(--danger)",
};
export const GATE_LABEL: Record<GateKey, string> = {
  legal: "Legal & IP", regulatory: "Regulatory", security: "Security", privacy: "Data privacy", safety: "Safety", ethical: "Ethics & reputation",
};

/** Thresholds — explicit and documented so users can audit (and later configure) them. */
export const THRESHOLDS = { attractive: 60, marginal: 45, reject: 35, evidenceValidated: 50, evidenceSome: 25 };

export interface GateSummary { passed: number; conditional: number; failed: GateKey[]; unassessed: GateKey[]; unconfirmed: GateKey[] }
export function gateSummary(gates: Partial<Record<GateKey, GateAssessment>> | undefined): GateSummary {
  const s: GateSummary = { passed: 0, conditional: 0, failed: [], unassessed: [], unconfirmed: [] };
  for (const g of GATES) {
    const a = gates?.[g];
    if (!a || a.status === "unassessed") { s.unassessed.push(g); continue; }
    if (!a.confirmed) s.unconfirmed.push(g);
    if (a.status === "fail") s.failed.push(g);
    else if (a.status === "conditional") s.conditional++;
    else s.passed++;
  }
  return s;
}

export interface Recommendation {
  ideaId: string; title: string; status: DecisionStatus; reasons: string[]; blockers: string[]; nextAction: string;
  attractiveness: number | null; provisional: boolean; evidence: Confidence; gates: GateSummary; npv: number | null;
  canApprove: boolean; rank: number;
}

export function recommend(p: ProjectState, row: RankedIdea): Recommendation {
  const ev = conceptConfidence(p, row.ideaId);
  const gates = gateSummary(p.os?.gates?.[row.ideaId]);
  const bc = p.os?.businessCases.find((b) => b.ideaId === row.ideaId);
  const npv = bc && bc.inputs.price + bc.inputs.savingsPerYear > 0 ? metrics(bc.inputs, bc.scenarios.base).npv : null;
  const conservativeNpv = bc && npv !== null ? metrics(bc.inputs, bc.scenarios.conservative).npv : null;
  const reasons: string[] = [], blockers: string[] = [];
  const a = row.weighted;
  let status: DecisionStatus;

  if (gates.failed.length) {
    status = "REWORK";
    blockers.push(`Failed mandatory gate: ${gates.failed.map((g) => GATE_LABEL[g]).join(", ")} — a high score cannot offset this.`);
  } else if (a === null) {
    status = "INVESTIGATE_FURTHER";
    reasons.push("Not yet scored on the decision criteria.");
  } else if (a < THRESHOLDS.reject && ev.score >= THRESHOLDS.evidenceSome) {
    status = "REJECT";
    reasons.push(`Attractiveness ${a} is below ${THRESHOLDS.reject} and that view is backed by evidence (${ev.score}).`);
  } else if (a < THRESHOLDS.marginal) {
    status = "HOLD";
    reasons.push(`Attractiveness ${a} is below ${THRESHOLDS.marginal}; keep it in reserve unless new evidence changes the picture.`);
  } else if (ev.score < THRESHOLDS.evidenceSome) {
    status = ev.supporting + ev.contradicting === 0 && problemConfidence(p).score < THRESHOLDS.evidenceSome ? "INVESTIGATE_FURTHER" : "VALIDATE";
    reasons.push(`Attractive on paper (${a}) but evidence confidence is ${ev.label} (${ev.score}/100).`);
    if (status === "INVESTIGATE_FURTHER") reasons.push("The underlying problem itself has little evidence yet.");
  } else if (ev.score < THRESHOLDS.evidenceValidated || a < THRESHOLDS.attractive) {
    status = "VALIDATE";
    reasons.push(a < THRESHOLDS.attractive ? `Attractiveness ${a} is marginal (${THRESHOLDS.marginal}–${THRESHOLDS.attractive}).` : `Evidence is ${ev.label} (${ev.score}); test the riskiest assumptions before investing.`);
  } else if (gates.unassessed.length || gates.unconfirmed.length) {
    status = "VALIDATE";
    blockers.push(`Risk & policy gates not complete: ${[...gates.unassessed, ...gates.unconfirmed].map((g) => GATE_LABEL[g]).join(", ")} (each needs a human-confirmed assessment).`);
  } else if (npv !== null && bc && Object.values(bc.sources).some((x) => x && x.by !== "user")) {
    status = "PROCEED_TO_BUSINESS_CASE";
    blockers.push(`The business case still uses ${Object.values(bc.sources).filter((x) => x && x.by !== "user").length} AI/placeholder assumption(s). Replace them with your own figures before an investment decision.`);
  } else if (npv === null) {
    status = "PROCEED_TO_BUSINESS_CASE";
    reasons.push(`Attractive (${a}) with ${ev.label} evidence (${ev.score}) and gates cleared — quantify the investment next.`);
  } else if (npv <= 0) {
    status = "REWORK";
    reasons.push(`Base-case NPV is not positive (${Math.round(npv).toLocaleString()}); rework the model or the economics.`);
  } else {
    status = "APPROVE_FOR_DELIVERY";
    reasons.push(`Attractive (${a}), ${ev.label} evidence (${ev.score}), all gates cleared, positive base-case NPV.`);
    if (conservativeNpv !== null && conservativeNpv < 0) reasons.push("Note: the conservative scenario is NPV-negative — approve with stage-gated funding.");
  }
  if (row.provisional && a !== null) reasons.push("Score is provisional — some criteria are unscored or rest on low-confidence judgement.");
  if (ev.aiOnly) reasons.push("All linked items are AI hypotheses, which carry no evidential weight.");
  if (ev.contradicting > 0) reasons.push(`${ev.contradicting} independent source(s) contradict this concept.`);
  if (gates.conditional) reasons.push(`${gates.conditional} gate(s) passed with conditions — carry them into the solution design.`);

  const next: Record<DecisionStatus, string> = {
    INVESTIGATE_FURTHER: "Gather evidence that the problem is real: talk to 5 affected people and log what you learn in the Evidence Lab.",
    VALIDATE: blockers.length ? "Complete and confirm the risk & policy gates." : "Run the cheapest test of the riskiest assumption (Validation Lab) and log the result.",
    PROCEED_TO_BUSINESS_CASE: blockers.length ? "Replace every placeholder driver in the business case with a figure you can defend." : "Build the business case: set the drivers, check the conservative scenario.",
    APPROVE_FOR_DELIVERY: "A decision-maker reviews the report and approves (or not).",
    REWORK: gates.failed.length ? "Redesign the concept to remove the failed gate exposure, then reassess." : "Revisit the economics or the concept, then re-score.",
    HOLD: "Park it. Revisit if evidence changes or a stronger option fails validation.",
    REJECT: "Record the rejection and the reason, so the learning is reusable.",
  };
  return {
    ideaId: row.ideaId, title: row.title, status, reasons, blockers, nextAction: next[status],
    attractiveness: a, provisional: row.provisional, evidence: ev, gates, npv, rank: row.rank,
    canApprove: status === "APPROVE_FOR_DELIVERY" && blockers.length === 0,
  };
}

export function recommendAll(p: ProjectState): Recommendation[] {
  if (!p.ideas) return [];
  const rows = p.evaluation ? scoreIdeas(p.ideas.ideas, p.evaluation, p.weights)
    : p.ideas.ideas.map((i, k) => ({ ideaId: i.id, title: i.title, weighted: null, coverage: 0, provisional: true, lowConfidenceShare: 1, impact: 0, riskLevel: 0, costLevel: 0, rank: k + 1 }));
  return rows.map((r) => recommend(p, r));
}

/**
 * Fingerprint of every input a decision depends on. If it changes after approval, the approval is stale.
 * (Cheap, stable string hash — not cryptographic.)
 */
export function fingerprint(p: ProjectState, ideaId: string): string {
  const idea = p.ideas?.ideas.find((i) => i.id === ideaId);
  const ev = p.evaluation?.evaluations.find((e) => e.ideaId === ideaId);
  const ideaNode = p.nodes.find((n) => n.tags.includes(`idea:${ideaId}`));
  const aNodes = ideaNode ? p.nodes.filter((n) => n.type === "assumption" && n.parentId === ideaNode.id) : [];
  const aIds = new Set(aNodes.map((n) => n.id));
  const assumptions = aNodes.map((n) => `${n.id}:${n.status}`);
  const evidence = (p.os?.evidence ?? []).filter((e) => e.links.some((l) => (l.targetKind === "concept" && l.targetId === ideaId) || aIds.has(l.targetId))).map((e) => `${e.id}:${e.verification}:${e.reliability}:${e.links.map((l) => l.stance).join("")}`);
  const tests = p.design?.tests.find((t) => t.ideaId === ideaId);
  const data = JSON.stringify([idea?.title, idea?.keyAssumptions, p.weights, ev?.scores.map((s) => [s.dimension, s.score]), assumptions, evidence.sort(), p.os?.gates?.[ideaId], p.os?.businessCases.find((b) => b.ideaId === ideaId)?.inputs, tests ? Object.entries(tests.results).map(([k, v]) => `${k}:${v.status}`) : null]);
  let h = 5381;
  for (let i = 0; i < data.length; i++) h = ((h << 5) + h + data.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function latestApproval(p: ProjectState, ideaId: string): ApprovalRecord | undefined {
  return [...(p.os?.approvals ?? [])].reverse().find((a) => a.ideaId === ideaId);
}

/** Impact analysis: which decisions, cases and plans are now potentially outdated. */
export interface Impact { kind: "approval" | "report" | "blueprint" | "roadmap"; ideaId: string; message: string }
export function impactAnalysis(p: ProjectState): Impact[] {
  const out: Impact[] = [];
  for (const idea of p.ideas?.ideas ?? []) {
    const fp = fingerprint(p, idea.id);
    const ap = latestApproval(p, idea.id);
    if (ap && ap.action === "approve" && ap.fingerprint !== fp) out.push({ kind: "approval", ideaId: idea.id, message: `“${idea.title}” was approved on ${ap.at.slice(0, 10)}, but its scores, evidence, gates, assumptions or business case have changed since.` });
    const rep = p.os?.reports.find((r) => r.ideaId === idea.id);
    if (rep && rep.fingerprint !== fp) out.push({ kind: "report", ideaId: idea.id, message: `The decision report for “${idea.title}” was generated on older inputs.` });
  }
  if (p.selectedIdeaId) {
    const sel = p.ideas?.ideas.find((i) => i.id === p.selectedIdeaId);
    const ap = latestApproval(p, p.selectedIdeaId);
    const stale = out.some((o) => o.kind === "approval" && o.ideaId === p.selectedIdeaId);
    if (sel && (stale || (ap && ap.action !== "approve"))) {
      if (p.blueprint) out.push({ kind: "blueprint", ideaId: sel.id, message: "The solution blueprint is built on a decision that needs review." });
      if (p.roadmap) out.push({ kind: "roadmap", ideaId: sel.id, message: "The delivery plan is built on a decision that needs review." });
    }
  }
  return out;
}

/** Citation integrity: keep only evidence ids that exist in the register; report the rest. */
export function checkCitations<T extends { evidenceIds: string[] }>(answers: T[], known: Set<string>): { answers: T[]; unsupported: string[] } {
  const bad = new Set<string>();
  const clean = answers.map((a) => ({ ...a, evidenceIds: a.evidenceIds.filter((id) => { const ok = known.has(id); if (!ok) bad.add(id); return ok; }) }));
  return { answers: clean, unsupported: [...bad] };
}

export const REPORT_QUESTIONS = [
  "Why this idea?", "Why now?", "Why over the alternatives?", "What assumptions drive the recommendation?",
  "What evidence supports it?", "What could invalidate it?", "What would change the decision?", "What next action creates the greatest learning or value?",
];
