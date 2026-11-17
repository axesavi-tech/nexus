/**
 * NEXUS pricing engine — prepaid credits, priced at a fixed multiple of fully loaded cost.
 *
 * For every AI request:
 *   cost (₹)    = model tokens × list price × FX  +  share of fixed platform cost
 *   credits     = ceil( MARGIN × cost / (1 − gateway fee) )
 * Credits are never sold below ₹1, so every request earns at least MARGIN × its cost after
 * payment-gateway fees. Larger packs only ever approach — never undercut — that floor.
 *
 * All economics can be tuned with environment variables on the server (see README → Billing).
 */

export interface Economics {
  /** Rupees per US dollar, including card forex markup and GST on the AI provider's invoice. */
  usdInr: number;
  /** Fixed monthly platform cost in rupees (hosting, database, email, domain). */
  infraMonthlyInr: number;
  /** Requests per month the fixed cost is spread across. */
  expectedRequestsPerMonth: number;
  /** Payment gateway fee including GST on the fee (Cashfree standard 1.95% + 18% GST ≈ 2.3%). */
  gatewayFee: number;
  /** Required multiple of fully loaded cost. */
  margin: number;
}

export const DEFAULT_ECONOMICS: Economics = {
  usdInr: 100,
  infraMonthlyInr: 4500,
  expectedRequestsPerMonth: 3000,
  gatewayFee: 0.023,
  margin: 3,
};

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) && n > 0 ? n : d;
};

/** Server-side economics (env overrides). Safe to call on the client: falls back to defaults. */
export function economics(): Economics {
  const e = typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>);
  const out: Economics = {
    usdInr: num(e.COST_USD_INR, DEFAULT_ECONOMICS.usdInr),
    infraMonthlyInr: num(e.COST_INFRA_MONTHLY_INR, DEFAULT_ECONOMICS.infraMonthlyInr),
    expectedRequestsPerMonth: num(e.COST_EXPECTED_REQUESTS_PER_MONTH, DEFAULT_ECONOMICS.expectedRequestsPerMonth),
    gatewayFee: Math.min(0.2, num(e.COST_GATEWAY_FEE, DEFAULT_ECONOMICS.gatewayFee)),
    margin: Math.max(1, num(e.PRICING_MARGIN, DEFAULT_ECONOMICS.margin)),
  };
  return out;
}

/** USD per million tokens. Unknown models are priced as the most expensive known one. */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-haiku-5-5": { input: 1, output: 5 },
};
const FALLBACK_PRICE = { input: 4, output: 20 };

export function modelPrice(model: string | undefined) {
  if (!model) return FALLBACK_PRICE;
  const key = Object.keys(MODEL_PRICES).find((k) => model === k || model.startsWith(k + "-"));
  return key ? MODEL_PRICES[key] : FALLBACK_PRICE;
}

export interface Usage { model?: string; inputTokens: number; outputTokens: number }

/** Fully loaded cost of one request, in rupees. */
export function requestCostInr(u: Usage, e: Economics = economics()): number {
  const p = modelPrice(u.model);
  const aiUsd = (u.inputTokens * p.input + u.outputTokens * p.output) / 1_000_000;
  return aiUsd * e.usdInr + e.infraMonthlyInr / e.expectedRequestsPerMonth;
}

/** Credits to charge for a cost, so that ₹1/credit nets MARGIN × cost after gateway fees. */
export function creditsForCost(costInr: number, e: Economics = economics()): number {
  return Math.max(1, Math.ceil((e.margin * costInr) / (1 - e.gatewayFee) - 1e-9));
}

export const creditsForUsage = (u: Usage, e: Economics = economics()) => creditsForCost(requestCostInr(u, e), e);

/** Typical token use per operation (from production logs) — used for estimates and balance checks. */
export const OP_ESTIMATES: Record<string, { label: string; input: number; output: number }> = {
  analyze: { label: "Understand a thought", input: 2000, output: 1900 },
  node: { label: "Explore a node (expand, challenge, connect…)", input: 4800, output: 1500 },
  ideate: { label: "Generate solution options", input: 5200, output: 3000 },
  evaluate: { label: "Evaluate options", input: 5000, output: 4000 },
  blueprint: { label: "Solution blueprint", input: 6600, output: 6500 },
  roadmap: { label: "Delivery plan & tasks", input: 8000, output: 9000 },
};

export function estimateCredits(op: string, e: Economics = economics(), model = "claude-sonnet-5-5"): number {
  const est = OP_ESTIMATES[op] ?? OP_ESTIMATES.blueprint;
  return creditsForUsage({ model, inputTokens: est.input, outputTokens: est.output }, e);
}

/** A complete thought-to-roadmap journey with three map explorations. */
export function journeyCredits(e: Economics = economics()): number {
  return estimateCredits("analyze", e) + 3 * estimateCredits("node", e) + estimateCredits("ideate", e)
    + estimateCredits("evaluate", e) + estimateCredits("blueprint", e) + estimateCredits("roadmap", e);
}

// ---------- Packs (prepaid, valid 12 months) ----------
export interface Pack { id: string; name: string; priceInr: number; credits: number; tagline: string; highlight?: boolean }
export const SIGNUP_CREDITS = 75;
export const CREDIT_VALIDITY_MONTHS = 12;
export const PACKS: Pack[] = [
  { id: "spark", name: "Spark", priceInr: 299, credits: 250, tagline: "Try a full idea-to-plan journey" },
  { id: "builder", name: "Builder", priceInr: 999, credits: 900, tagline: "For founders working several ideas", highlight: true },
  { id: "studio", name: "Studio", priceInr: 2999, credits: 2850, tagline: "For consultants and small teams" },
];
export const packById = (id: string) => PACKS.find((p) => p.id === id);

/** Effective margin multiple a pack earns on fully loaded cost (≥ MARGIN by construction). */
export function packMargin(p: Pack, e: Economics = economics()): number {
  return (p.priceInr / p.credits) * e.margin;
}
