/**
 * Deterministic evaluation engine. AI supplies per-dimension judgements; all arithmetic happens here.
 * Weighted score = Σ(score × normalized weight) over SCORED dimensions only.
 * Unscored (null) dimensions never get fabricated values — they lower coverage and mark the result provisional.
 */
import { DIMENSIONS, type EvaluationResult, type Idea } from "./schemas";

export const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d.weight]));

export function normalizeWeights(weights: Record<string, number>): Record<string, number> {
  const entries = Object.entries(weights).filter(([, w]) => Number.isFinite(w) && w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total === 0) return {};
  return Object.fromEntries(entries.map(([k, w]) => [k, w / total]));
}

export interface RankedIdea {
  ideaId: string;
  title: string;
  weighted: number | null;
  coverage: number; // share of (normalized) weight that was actually scored, 0..1
  provisional: boolean;
  lowConfidenceShare: number;
  impact: number;
  riskLevel: number;
  costLevel: number;
  rank: number;
}

export function scoreIdeas(
  ideas: Idea[],
  evaluation: EvaluationResult,
  weights: Record<string, number>,
): RankedIdea[] {
  const norm = normalizeWeights(weights);
  const rows: RankedIdea[] = ideas.map((idea) => {
    const ev = evaluation.evaluations.find((e) => e.ideaId === idea.id);
    if (!ev) {
      return { ideaId: idea.id, title: idea.title, weighted: null, coverage: 0, provisional: true, lowConfidenceShare: 1, impact: 0, riskLevel: 0, costLevel: 0, rank: 0 };
    }
    let covered = 0;
    let acc = 0;
    let lowConf = 0;
    for (const [dim, w] of Object.entries(norm)) {
      const s = ev.scores.find((x) => x.dimension === dim);
      if (!s || s.score === null) continue;
      covered += w;
      acc += s.score * w;
      if (s.confidence === "low" || s.evidence === "missing") lowConf += w;
    }
    const weighted = covered > 0 ? acc / covered : null;
    return {
      ideaId: idea.id,
      title: idea.title,
      weighted: weighted === null ? null : Math.round(weighted * 10) / 10,
      coverage: Math.round(covered * 1000) / 1000,
      provisional: covered < 0.999 || lowConf > 0.5,
      lowConfidenceShare: covered > 0 ? Math.round((lowConf / covered) * 100) / 100 : 1,
      impact: ev.impact, riskLevel: ev.riskLevel, costLevel: ev.costLevel, rank: 0,
    };
  });
  const sorted = [...rows].sort((a, b) => (b.weighted ?? -1) - (a.weighted ?? -1));
  sorted.forEach((r, i) => (r.rank = r.weighted === null ? 0 : i + 1));
  return sorted;
}

/** How much a +/-delta change on one weight would alter the top-ranked idea. */
export function weightSensitivity(
  ideas: Idea[], evaluation: EvaluationResult, weights: Record<string, number>, delta = 10,
): { dimension: string; flipsLeader: boolean; newLeader?: string }[] {
  const base = scoreIdeas(ideas, evaluation, weights)[0]?.ideaId;
  return Object.keys(weights).map((dim) => {
    for (const d of [-delta, delta]) {
      const w = { ...weights, [dim]: Math.max(0, (weights[dim] ?? 0) + d) };
      const leader = scoreIdeas(ideas, evaluation, w)[0];
      if (leader && leader.ideaId !== base) return { dimension: dim, flipsLeader: true, newLeader: leader.title };
    }
    return { dimension: dim, flipsLeader: false };
  });
}

/** Pareto frontier on (impact high, risk low, cost low). */
export function paretoFrontier(rows: RankedIdea[]): string[] {
  const dominated = (a: RankedIdea, b: RankedIdea) =>
    b.impact >= a.impact && b.riskLevel <= a.riskLevel && b.costLevel <= a.costLevel &&
    (b.impact > a.impact || b.riskLevel < a.riskLevel || b.costLevel < a.costLevel);
  return rows.filter((a) => a.impact > 0 && !rows.some((b) => b !== a && b.impact > 0 && dominated(a, b))).map((r) => r.ideaId);
}

// ---------- Idea quality control ----------
const STOP = new Set("a an the and or of to for with in on by is are be that this it as at from into your our their using via".split(" "));
export function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
}
export function jaccard(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export interface QualityFlag { ideaId: string; issue: string; severity: "info" | "warn" }
export function qualityCheck(ideas: Idea[], constraints: string[] = []): QualityFlag[] {
  const flags: QualityFlag[] = [];
  for (let i = 0; i < ideas.length; i++) {
    const a = ideas[i];
    if (!a.targetUsers.trim()) flags.push({ ideaId: a.id, issue: "No intended users specified", severity: "warn" });
    if (a.valueProposition.trim().length < 15) flags.push({ ideaId: a.id, issue: "Value proposition is incomplete", severity: "warn" });
    if (a.keyAssumptions.length === 0) flags.push({ ideaId: a.id, issue: "No assumptions declared — every idea rests on some", severity: "info" });
    for (let j = i + 1; j < ideas.length; j++) {
      const b = ideas[j];
      const sim = jaccard(`${a.title} ${a.summary}`, `${b.title} ${b.summary}`);
      if (sim > 0.5) flags.push({ ideaId: b.id, issue: `Near-duplicate of “${a.title}” (${Math.round(sim * 100)}% overlap)`, severity: "warn" });
    }
    for (const c of constraints) {
      const neg = c.toLowerCase().match(/\b(no|not|without|never|avoid)\s+([a-z]+)/);
      if (neg && tokens(`${a.summary} ${a.howItWorks}`).has(neg[2])) {
        flags.push({ ideaId: a.id, issue: `May conflict with constraint: “${c}”`, severity: "warn" });
      }
    }
  }
  const tiers = new Set(ideas.map((i) => i.tier));
  if (tiers.size < Math.min(3, ideas.length)) flags.push({ ideaId: "*", issue: "Options cluster in too few risk tiers — diversity is low", severity: "warn" });
  return flags;
}
