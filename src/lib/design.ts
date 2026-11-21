/**
 * Design-thinking engine — pure helpers (no I/O).
 * Technique library, dot-voting budget, convergence ranking and assumption-map maths.
 */
import type { DesignState, Empathy, Hmw, Spark, Technique, TestPlan, TestRecord } from "./schemas";

export interface TechniqueInfo { id: Technique; name: string; glyph: string; blurb: string; prompt: string; count: number }

export const TECHNIQUES_INFO: TechniqueInfo[] = [
  { id: "brainstorm", name: "Open brainstorm", glyph: "✺", count: 8,
    blurb: "Quantity over quality. Defer judgement, welcome wild ideas.",
    prompt: "Classic brainstorm: generate many quick, varied ideas. Defer judgement; include a couple of deliberately wild ones. Vary mechanism, channel and who acts." },
  { id: "scamper", name: "SCAMPER", glyph: "S", count: 7,
    blurb: "Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse.",
    prompt: "Apply SCAMPER: exactly one idea for each of Substitute, Combine, Adapt, Modify/Magnify, Put to another use, Eliminate, Reverse/Rearrange. Put the SCAMPER letter-word in lens." },
  { id: "analogy", name: "Borrow from elsewhere", glyph: "⇋", count: 6,
    blurb: "How would a hospital, game studio, airline or nature solve this?",
    prompt: "Analogical thinking: pick distant domains (e.g. emergency medicine, gaming, aviation, hospitality, biology, logistics, religion, sport). For each, describe how that domain already solves a structurally similar problem and transfer the mechanism. Put the source domain in lens." },
  { id: "reverse", name: "Worst possible idea", glyph: "↺", count: 6,
    blurb: "Generate terrible ideas, then flip each into a good one.",
    prompt: "Reverse brainstorm: think of the worst ways to address this (make it worse, more painful, more expensive), then flip each into a positive idea. Title = the flipped idea; description starts with 'Flip of: <bad idea>' then the good idea. lens = 'flipped'." },
  { id: "constraints", name: "Extreme constraints", glyph: "▣", count: 6,
    blurb: "Zero budget. One day. 100× the users. No technology.",
    prompt: "Constraint-forcing: generate ideas under extreme constraints — zero budget, must ship tomorrow, 100x the users, no technology allowed, only volunteers, must be fun, must be invisible. Put the constraint in lens." },
  { id: "crazy8", name: "Crazy 8s", glyph: "8", count: 8,
    blurb: "Eight rapid variations — push past the obvious first ideas.",
    prompt: "Crazy 8s: eight rapid, distinct variations. The first two may be obvious; the last four must be surprising. lens = 'variation N'." },
  { id: "persona", name: "Through their eyes", glyph: "☺", count: 6,
    blurb: "Ideas from each persona's goals, pains and journey low points.",
    prompt: "Persona lens: for each persona provided, generate ideas aimed at their biggest pain or the lowest emotional point in their journey. Put the persona name in lens." },
  { id: "mashup", name: "Trend mash-up", glyph: "✚", count: 6,
    blurb: "Collide the challenge with an unrelated trend or format.",
    prompt: "Mash-up: combine the challenge with unrelated trends or formats (subscription, community, gamification, AI agent, marketplace, physical ritual, live event, micro-learning). Put the trend in lens." },
  { id: "build", name: "Yes, and…", glyph: "＋", count: 5,
    blurb: "Build on a chosen spark: extend, combine, push further.",
    prompt: "Yes-and: build on the seed idea. Each new idea must extend, strengthen, combine or push the seed further — never repeat it. lens = how it builds (extend / combine / scale / simplify / remix)." },
];
export const techniqueById = (id: string) => TECHNIQUES_INFO.find((t) => t.id === id);

export const HMW_ANGLE_LABEL: Record<string, string> = {
  amplify_good: "Amplify the good", remove_bad: "Remove the bad", explore_opposite: "Explore the opposite",
  question_assumption: "Question an assumption", change_status_quo: "Change the status quo",
  break_into_parts: "Break it into parts", analogy: "Use an analogy",
};

export const PROTOTYPE_LABEL: Record<string, string> = {
  paper_sketch: "Paper sketch", storyboard: "Storyboard", clickable_mockup: "Clickable mock-up", wizard_of_oz: "Wizard of Oz",
  concierge: "Concierge", fake_door: "Fake door", landing_page: "Landing page", role_play: "Role play",
  physical_mockup: "Physical mock-up", pilot: "Small pilot",
};

export function emptyDesign(): DesignState {
  return { notes: "", empathy: null, hmws: [], activeHmwId: null, sparks: [], clusters: [], whitespace: [], tests: [] };
}

/** Dot-voting budget: a third of the sparks, at least 3, at most 10. */
export function dotBudget(sparkCount: number): number {
  return Math.max(3, Math.min(10, Math.ceil(sparkCount / 3)));
}
export const dotsUsed = (sparks: Spark[]) => sparks.reduce((s, x) => s + x.votes, 0);

/** Converge: voted sparks ranked by votes, then human-authored first, then oldest. */
export function topSparks(sparks: Spark[], max = 6): Spark[] {
  return sparks.filter((s) => s.votes > 0)
    .sort((a, b) => b.votes - a.votes || Number(b.source === "user") - Number(a.source === "user") || a.createdAt.localeCompare(b.createdAt))
    .slice(0, max);
}

/** Merge AI-generated HMWs into the list, keeping the user's own and starred questions. */
export function mergeHmws(existing: Hmw[], fromAi: Empathy["hmws"], source: "ai" | "dev"): Hmw[] {
  const kept = existing.filter((h) => h.source === "user" || h.starred);
  const seen = new Set(kept.map((h) => norm(h.question)));
  const fresh = fromAi.filter((h) => !seen.has(norm(h.question))).map((h) => ({ id: `h_${h.id}_${Math.random().toString(36).slice(2, 6)}`, question: h.question, povId: h.povId, angle: h.angle, source }));
  return [...kept, ...fresh];
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Near-duplicate detection for sparks (word-set Jaccard on titles). */
export function isDuplicate(title: string, others: { title: string }[], threshold = 0.7): boolean {
  const a = new Set(norm(title).split(" ").filter((w) => w.length > 2));
  if (!a.size) return false;
  return others.some((o) => {
    const b = new Set(norm(o.title).split(" ").filter((w) => w.length > 2));
    if (!b.size) return false;
    const inter = [...a].filter((x) => b.has(x)).length;
    return inter / (a.size + b.size - inter) >= threshold;
  });
}

/**
 * Assumption mapping (importance × evidence). Riskiest = important and weakly evidenced.
 * risk = importance × (6 − evidence), range 1–25.
 */
export function riskScore(a: TestPlan["assumptions"][number]) { return a.importance * (6 - a.evidence); }
export function quadrant(a: TestPlan["assumptions"][number]): "test_first" | "monitor" | "safe_bet" | "deprioritise" {
  const important = a.importance >= 3, evidenced = a.evidence >= 3;
  if (important && !evidenced) return "test_first";
  if (important && evidenced) return "safe_bet";
  if (!important && !evidenced) return "monitor";
  return "deprioritise";
}
export function rankAssumptions(plan: TestPlan) {
  return [...plan.assumptions].sort((x, y) => riskScore(y) - riskScore(x));
}

/** Overall learning progress for a test record. */
export function testProgress(t: TestRecord) {
  const ids = t.assumptions.map((a) => a.id);
  const done = ids.filter((id) => ["validated", "invalidated", "inconclusive"].includes(t.results[id]?.status ?? "untested"));
  const invalid = ids.filter((id) => t.results[id]?.status === "invalidated");
  const riskiest = rankAssumptions(t).filter((a) => quadrant(a) === "test_first");
  const riskiestOpen = riskiest.filter((a) => !["validated", "invalidated"].includes(t.results[a.id]?.status ?? "untested"));
  return { total: ids.length, done: done.length, invalidated: invalid.length, riskiestOpen: riskiestOpen.length };
}

/** Where the user is in the design-thinking loop (for the progress rail). */
export function designPhase(d: DesignState | null, hasIdeas: boolean): number {
  if (!d) return 0;
  if (d.tests.length) return 4;
  if (hasIdeas && d.sparks.some((s) => s.votes > 0)) return 3;
  if (d.sparks.length) return 2;
  if (d.hmws.length) return 1;
  return d.empathy ? 1 : 0;
}
