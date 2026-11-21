/**
 * Business-case engine (deterministic, auditable). The LLM may SUGGEST inputs; it never calculates.
 *
 * Year 0 = investment year (capex only). Years 1..H:
 *   volume_t   = volumeY1 × (1+g_v)^(t−1) × m.volume
 *   price_t    = price × (1+g_p)^(t−1) × m.price
 *   revenue_t  = volume_t × price_t
 *   varCost_t  = revenue_t × variableCostPct × m.cost
 *   contrib_t  = revenue_t − varCost_t                          (contribution margin)
 *   fixed_t    = fixedOpex × (1+g_o)^(t−1) × m.cost
 *   savings_t  = savingsPerYear × m.volume                      (cost reduction, for transformation cases)
 *   ebitda_t   = contrib_t − fixed_t + savings_t
 *   cash_t     = ebitda_t                (EBITDA proxy; no tax, depreciation or working capital modelled)
 *   cash_0     = −capex × m.cost
 *   NPV        = Σ cash_t / (1+r)^t,  t = 0..H
 *   IRR        = r such that NPV(r) = 0   (bisection; null when cash flows never change sign)
 *   Payback    = first t where cumulative cash ≥ 0, interpolated within the year
 *   ROI        = (Σ cash_t for t ≥ 1 − capex) / capex
 */
import type { BusinessCase, FinDriver, FinInputs, ScenarioMult } from "./schemas";

export const SCENARIO_DEFAULTS: Record<"conservative" | "base" | "optimistic", ScenarioMult> = {
  conservative: { volume: 0.7, price: 0.95, cost: 1.15 },
  base: { volume: 1, price: 1, cost: 1 },
  optimistic: { volume: 1.3, price: 1.05, cost: 0.95 },
};

export const DEFAULT_INPUTS: FinInputs = {
  currency: "INR", horizonYears: 5, discountRate: 12, unitLabel: "orders",
  volumeY1: 0, volumeGrowth: 0, price: 0, priceGrowth: 0, variableCostPct: 0, fixedOpex: 0, opexGrowth: 0, capex: 0, savingsPerYear: 0,
};

export const DRIVER_META: Record<FinDriver, { label: string; unit: "count" | "pct" | "money"; min: number; max: number; help: string }> = {
  volumeY1: { label: "Year-1 volume", unit: "count", min: 0, max: 1e12, help: "Units, customers or transactions in the first year" },
  volumeGrowth: { label: "Volume growth / yr", unit: "pct", min: -100, max: 1000, help: "Annual growth in volume" },
  price: { label: "Price per unit", unit: "money", min: 0, max: 1e12, help: "Average revenue per unit" },
  priceGrowth: { label: "Price change / yr", unit: "pct", min: -100, max: 1000, help: "Annual price change" },
  variableCostPct: { label: "Variable cost % of revenue", unit: "pct", min: 0, max: 100, help: "COGS, fulfilment, payment fees…" },
  fixedOpex: { label: "Fixed opex / yr", unit: "money", min: 0, max: 1e13, help: "People, tools, rent, marketing base" },
  opexGrowth: { label: "Opex growth / yr", unit: "pct", min: -100, max: 1000, help: "Annual growth in fixed costs" },
  capex: { label: "Upfront investment (yr 0)", unit: "money", min: 0, max: 1e13, help: "Build cost, equipment, set-up" },
  savingsPerYear: { label: "Cost savings / yr", unit: "money", min: 0, max: 1e13, help: "For process/transformation cases" },
};

export function validateInputs(i: FinInputs): string[] {
  const errs: string[] = [];
  const num = (k: string, v: unknown) => { if (typeof v !== "number" || !Number.isFinite(v)) errs.push(`${k} must be a number`); };
  for (const k of Object.keys(DRIVER_META) as FinDriver[]) {
    num(DRIVER_META[k].label, i[k]);
    if (Number.isFinite(i[k]) && (i[k] < DRIVER_META[k].min || i[k] > DRIVER_META[k].max)) errs.push(`${DRIVER_META[k].label} must be between ${DRIVER_META[k].min} and ${DRIVER_META[k].max}`);
  }
  num("Discount rate", i.discountRate);
  if (i.discountRate <= -100 || i.discountRate > 100) errs.push("Discount rate must be between −100% and 100%");
  if (!Number.isInteger(i.horizonYears) || i.horizonYears < 1 || i.horizonYears > 15) errs.push("Horizon must be 1–15 whole years");
  return errs;
}

export interface YearRow { t: number; volume: number; price: number; revenue: number; variableCost: number; contribution: number; fixed: number; savings: number; ebitda: number; cash: number; cumulative: number; discounted: number }
export interface Metrics {
  npv: number; irr: number | null; paybackYears: number | null; roi: number | null; breakEvenYear: number | null;
  totalRevenue: number; grossMarginPct: number | null; tco: number; costOfDelay: number; peakFunding: number;
}

export function cashflows(i: FinInputs, m: ScenarioMult = SCENARIO_DEFAULTS.base): YearRow[] {
  const r = i.discountRate / 100;
  const rows: YearRow[] = [];
  const c0 = -i.capex * m.cost;
  rows.push({ t: 0, volume: 0, price: 0, revenue: 0, variableCost: 0, contribution: 0, fixed: 0, savings: 0, ebitda: 0, cash: c0, cumulative: c0, discounted: c0 });
  let cum = c0;
  for (let t = 1; t <= i.horizonYears; t++) {
    const volume = i.volumeY1 * Math.pow(1 + i.volumeGrowth / 100, t - 1) * m.volume;
    const price = i.price * Math.pow(1 + i.priceGrowth / 100, t - 1) * m.price;
    const revenue = volume * price;
    const variableCost = revenue * (i.variableCostPct / 100) * m.cost;
    const contribution = revenue - variableCost;
    const fixed = i.fixedOpex * Math.pow(1 + i.opexGrowth / 100, t - 1) * m.cost;
    const savings = i.savingsPerYear * m.volume;
    const ebitda = contribution - fixed + savings;
    const cash = ebitda;
    cum += cash;
    rows.push({ t, volume, price, revenue, variableCost, contribution, fixed, savings, ebitda, cash, cumulative: cum, discounted: cash / Math.pow(1 + r, t) });
  }
  return rows;
}

export function npvAt(flows: number[], ratePct: number): number {
  const r = ratePct / 100;
  return flows.reduce((s, c, t) => s + c / Math.pow(1 + r, t), 0);
}

/** IRR by bisection on [-99%, 1000%]. Returns null if NPV does not change sign in range. */
export function irr(flows: number[]): number | null {
  if (!flows.some((c) => c < 0) || !flows.some((c) => c > 0)) return null;
  let lo = -99, hi = 1000;
  let flo = npvAt(flows, lo), fhi = npvAt(flows, hi);
  if (Math.sign(flo) === Math.sign(fhi)) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const f = npvAt(flows, mid);
    if (Math.abs(f) < 1e-7) return mid;
    if (Math.sign(f) === Math.sign(flo)) { lo = mid; flo = f; } else { hi = mid; fhi = f; }
  }
  return (lo + hi) / 2;
}

export function metrics(i: FinInputs, m: ScenarioMult = SCENARIO_DEFAULTS.base): Metrics {
  const rows = cashflows(i, m);
  const flows = rows.map((r) => r.cash);
  const npv = npvAt(flows, i.discountRate);
  let payback: number | null = null;
  for (let t = 1; t < rows.length; t++) {
    if (rows[t - 1].cumulative < 0 && rows[t].cumulative >= 0) { payback = t - 1 + -rows[t - 1].cumulative / rows[t].cash; break; }
  }
  if (rows[0].cumulative >= 0) payback = 0;
  const capex = -flows[0];
  const operating = flows.slice(1).reduce((s, c) => s + c, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalContribution = rows.reduce((s, r) => s + r.contribution, 0);
  const breakEven = rows.find((r) => r.t > 0 && r.ebitda >= 0)?.t ?? null;
  const tco = capex + rows.reduce((s, r) => s + r.variableCost + r.fixed, 0);
  // Cost of delay: value lost by starting one year later (all flows shift by one year).
  const delayed = npvAt([0, ...flows], i.discountRate);
  return {
    npv, irr: irr(flows), paybackYears: payback, roi: capex > 0 ? (operating - capex) / capex : null, breakEvenYear: breakEven,
    totalRevenue, grossMarginPct: totalRevenue > 0 ? (totalContribution / totalRevenue) * 100 : null, tco,
    costOfDelay: npv - delayed, peakFunding: -Math.min(0, ...rows.map((r) => r.cumulative)),
  };
}

/** One-at-a-time sensitivity: NPV when each driver moves ±pct (tornado chart). */
export function tornado(i: FinInputs, pct = 20): { driver: FinDriver; low: number; high: number; swing: number }[] {
  const base = metrics(i).npv;
  return (Object.keys(DRIVER_META) as FinDriver[])
    .filter((k) => i[k] !== 0)
    .map((k) => {
      const lo = metrics({ ...i, [k]: i[k] * (1 - pct / 100) }).npv;
      const hi = metrics({ ...i, [k]: i[k] * (1 + pct / 100) }).npv;
      return { driver: k, low: lo - base, high: hi - base, swing: Math.abs(hi - lo) };
    })
    .sort((a, b) => b.swing - a.swing);
}

export function scenarioTable(bc: BusinessCase) {
  const list = (["conservative", "base", "optimistic"] as const).map((k) => ({ key: k as string, m: bc.scenarios[k] }));
  if (bc.scenarios.custom) list.push({ key: "custom", m: bc.scenarios.custom });
  return list.map(({ key, m }) => ({ key, m, ...metrics(bc.inputs, m) }));
}

export const FORMULAS: { name: string; formula: string }[] = [
  { name: "Revenue (year t)", formula: "volumeY1 × (1+volumeGrowth)^(t−1) × price × (1+priceGrowth)^(t−1) × scenario.volume × scenario.price" },
  { name: "Contribution margin", formula: "revenue − revenue × variableCost% × scenario.cost" },
  { name: "EBITDA (year t)", formula: "contribution − fixedOpex × (1+opexGrowth)^(t−1) × scenario.cost + savingsPerYear × scenario.volume" },
  { name: "Cash flow", formula: "year 0: −capex × scenario.cost; years 1..H: EBITDA (no tax, depreciation or working capital)" },
  { name: "NPV", formula: "Σ cashflow_t ÷ (1 + discountRate)^t for t = 0..H" },
  { name: "IRR", formula: "discount rate at which NPV = 0 (bisection, −99%…1000%)" },
  { name: "Payback", formula: "first year cumulative cash ≥ 0, interpolated within the year" },
  { name: "ROI", formula: "(Σ operating cash flow − capex) ÷ capex" },
  { name: "Cost of delay", formula: "NPV − NPV(all flows shifted one year later)" },
];

export function fmtMoney(n: number, currency = "INR"): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  const sym = currency === "INR" ? "₹" : currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : `${currency} `;
  if (currency === "INR") {
    if (abs >= 1e7) return `${sign}${sym}${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${sign}${sym}${(abs / 1e5).toFixed(2)} L`;
  } else {
    if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(2)}M`;
  }
  if (abs >= 1e3) return `${sign}${sym}${Math.round(abs).toLocaleString("en-IN")}`;
  return `${sign}${sym}${abs.toFixed(abs < 10 ? 2 : 0)}`;
}
