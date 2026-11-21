/**
 * Evidence engine (deterministic). Confidence reflects evidence QUALITY and independence, never AI self-confidence.
 *
 *   item weight  w = typeWeight × reliability × verification
 *   support      S = 1 − Π(1 − 0.5·w)   over independent supporting items  (diminishing returns)
 *   contradiction C = 1 − Π(1 − 0.5·w)  over contradicting items
 *   confidence   = clamp(100 × (S − 0.75·C), 0, 100)
 *
 * AI hypotheses carry zero weight: an idea the AI likes is not evidence.
 */
import type { EvidenceItem, EvidenceTargetKind, EvidenceType, OSState, ProjectState, TestRecord } from "./schemas";

export const TYPE_WEIGHT: Record<EvidenceType, number> = {
  experiment_result: 1, analytics: 0.9, customer_interview: 0.8, survey: 0.7, market_report: 0.6,
  internal_document: 0.6, competitor: 0.5, expert_judgement: 0.4, user_provided: 0.3, ai_hypothesis: 0,
};
export const TYPE_LABEL: Record<EvidenceType, string> = {
  experiment_result: "Experiment result", analytics: "Analytics / data", customer_interview: "Customer interview", survey: "Survey",
  market_report: "Market / industry report", internal_document: "Internal document", competitor: "Competitor observation",
  expert_judgement: "Expert judgement", user_provided: "Founder / user belief", ai_hypothesis: "AI hypothesis (not evidence)",
};
const REL = { high: 1, medium: 0.7, low: 0.4 } as const;
const VER = { verified: 1, unverified: 0.7, disputed: 0.3 } as const;

export function itemWeight(e: Pick<EvidenceItem, "type" | "reliability" | "verification">): number {
  return TYPE_WEIGHT[e.type] * REL[e.reliability] * VER[e.verification];
}

export interface Confidence { score: number; label: "none" | "weak" | "moderate" | "strong"; supporting: number; contradicting: number; independentOrigins: number; aiOnly: boolean }

export function confidenceFrom(items: { w: number; stance: "supports" | "contradicts"; origin: string }[]): Confidence {
  // Same origin counts once (the strongest item) — five quotes from one interview are one source.
  const best = new Map<string, { w: number; stance: "supports" | "contradicts" }>();
  for (const it of items) {
    const k = `${it.stance}|${it.origin.trim().toLowerCase()}`;
    if (!best.has(k) || best.get(k)!.w < it.w) best.set(k, { w: it.w, stance: it.stance });
  }
  const sup = [...best.values()].filter((x) => x.stance === "supports");
  const con = [...best.values()].filter((x) => x.stance === "contradicts");
  const agg = (xs: { w: number }[]) => 1 - xs.reduce((p, x) => p * (1 - 0.5 * x.w), 1);
  const raw = 100 * (agg(sup) - 0.75 * agg(con));
  const score = Math.round(Math.max(0, Math.min(100, raw)));
  const label = score === 0 ? "none" : score < 30 ? "weak" : score < 60 ? "moderate" : "strong";
  return {
    score, label, supporting: sup.length, contradicting: con.length,
    independentOrigins: new Set(items.filter((i) => i.w > 0).map((i) => i.origin.trim().toLowerCase())).size,
    aiOnly: items.length > 0 && items.every((i) => i.w === 0),
  };
}

export function evidenceFor(os: OSState | null | undefined, kind: EvidenceTargetKind, id: string) {
  return (os?.evidence ?? []).flatMap((e) => e.links.filter((l) => l.targetKind === kind && l.targetId === id).map((l) => ({ e, stance: l.stance })));
}

/** Design-studio test results are first-class evidence for the concept they test. */
function testEvidence(tests: TestRecord[] | undefined, ideaId: string) {
  const rec = tests?.find((t) => t.ideaId === ideaId);
  if (!rec) return [];
  return rec.assumptions.flatMap((a) => {
    const r = rec.results[a.id];
    if (!r || (r.status !== "validated" && r.status !== "invalidated")) return [];
    // An invalidated MAJOR assumption is a strong contradiction of the concept.
    const w = TYPE_WEIGHT.experiment_result * (a.importance >= 4 ? 1 : 0.6);
    return [{ w, stance: (r.status === "validated" ? "supports" : "contradicts") as "supports" | "contradicts", origin: `test:${ideaId}:${a.id}` }];
  });
}

/** Concept evidence confidence: direct evidence + evidence on its tracked assumptions + its test results. */
export function conceptConfidence(p: ProjectState, ideaId: string): Confidence {
  const os = p.os;
  const ideaNode = p.nodes.find((n) => n.tags.includes(`idea:${ideaId}`));
  const assumptionNodeIds = ideaNode ? p.nodes.filter((n) => n.type === "assumption" && n.parentId === ideaNode.id).map((n) => n.id) : [];
  const direct = evidenceFor(os, "concept", ideaId);
  const viaAssumptions = assumptionNodeIds.flatMap((id) => [...evidenceFor(os, "assumption", id), ...evidenceFor(os, "node", id)]);
  const items = [...direct, ...viaAssumptions].map(({ e, stance }) => ({ w: itemWeight(e), stance, origin: e.origin || e.id }));
  return confidenceFrom([...items, ...testEvidence(p.design?.tests, ideaId)]);
}

/** Problem Confidence Indicator: evidence that the problem is real and matters. */
export function problemConfidence(p: ProjectState): Confidence {
  const problemNodeIds = p.nodes.filter((n) => n.type === "problem").map((n) => n.id);
  const items = [...evidenceFor(p.os, "problem", "root"), ...problemNodeIds.flatMap((id) => evidenceFor(p.os, "node", id))]
    .map(({ e, stance }) => ({ w: itemWeight(e), stance, origin: e.origin || e.id }));
  return confidenceFrom(items);
}

/** Duplicate-source detection: same URL, or same origin with near-identical excerpt. */
export function duplicateOf(item: Pick<EvidenceItem, "url" | "origin" | "excerpt">, all: EvidenceItem[]): EvidenceItem | undefined {
  const norm = (s?: string) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return all.find((x) =>
    (item.url && x.url && norm(item.url) === norm(x.url)) ||
    (norm(item.origin) === norm(x.origin) && norm(item.excerpt).slice(0, 120) === norm(x.excerpt).slice(0, 120) && norm(item.excerpt).length > 0));
}

/** Freshness: evidence older than 18 months (by publication or retrieval) is flagged stale. */
export function freshness(e: Pick<EvidenceItem, "publishedAt" | "retrievedAt">, nowISO = new Date().toISOString()): "fresh" | "ageing" | "stale" | "undated" {
  const d = e.publishedAt || e.retrievedAt;
  if (!d) return "undated";
  const months = (Date.parse(nowISO) - Date.parse(d)) / (30.44 * 86400000);
  if (!Number.isFinite(months)) return "undated";
  return months > 18 ? "stale" : months > 9 ? "ageing" : "fresh";
}

/** Contradiction detection: targets with both supporting and contradicting evidence. */
export function contested(os: OSState | null | undefined): { targetKind: EvidenceTargetKind; targetId: string; supports: number; contradicts: number }[] {
  const m = new Map<string, { targetKind: EvidenceTargetKind; targetId: string; supports: number; contradicts: number }>();
  for (const e of os?.evidence ?? []) for (const l of e.links) {
    const k = `${l.targetKind}:${l.targetId}`;
    const cur = m.get(k) ?? { targetKind: l.targetKind, targetId: l.targetId, supports: 0, contradicts: 0 };
    cur[l.stance === "supports" ? "supports" : "contradicts"]++;
    m.set(k, cur);
  }
  return [...m.values()].filter((x) => x.supports > 0 && x.contradicts > 0);
}

export function emptyOS(): OSState {
  return { evidence: [], research: [], gates: {}, approvals: [], businessCases: [], reports: [] };
}
