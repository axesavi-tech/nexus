import { describe, it, expect } from "vitest";
import {
  DEFAULT_ECONOMICS, PACKS, OP_ESTIMATES, creditsForCost, creditsForUsage, requestCostInr, estimateCredits, journeyCredits, packMargin, modelPrice,
} from "@/lib/billing/pricing";

const E = DEFAULT_ECONOMICS;

describe("pricing: every request earns at least 3x its fully loaded cost", () => {
  it("₹1 of credits nets ≥ 3× cost after gateway fees, across request sizes", () => {
    for (const [inp, out] of [[0, 0], [100, 50], [2000, 1900], [8000, 9000], [40000, 24000], [123457, 98765]]) {
      const usage = { model: "claude-sonnet-5-5", inputTokens: inp, outputTokens: out };
      const cost = requestCostInr(usage, E);
      const credits = creditsForUsage(usage, E);
      const netRevenue = credits * 1 * (1 - E.gatewayFee); // credits sold at ≥ ₹1
      expect(netRevenue).toBeGreaterThanOrEqual(3 * cost - 1e-9);
    }
  });

  it("no pack sells credits below ₹1 (so no pack drops under 3×)", () => {
    for (const p of PACKS) {
      expect(p.priceInr / p.credits).toBeGreaterThanOrEqual(1);
      expect(packMargin(p, E)).toBeGreaterThanOrEqual(3);
    }
  });

  it("cost includes the fixed platform share and FX", () => {
    const zero = requestCostInr({ model: "claude-sonnet-5-5", inputTokens: 0, outputTokens: 0 }, E);
    expect(zero).toBeCloseTo(E.infraMonthlyInr / E.expectedRequestsPerMonth);
    const m = requestCostInr({ model: "claude-sonnet-5-5", inputTokens: 1_000_000, outputTokens: 0 }, E) - zero;
    expect(m).toBeCloseTo(2 * E.usdInr);
  });

  it("unknown models are priced conservatively", () => {
    expect(modelPrice("some-new-model").output).toBeGreaterThanOrEqual(modelPrice("claude-sonnet-5-5").output);
    expect(modelPrice("claude-sonnet-5-5-20261001").input).toBe(2);
  });

  it("estimates are positive and a journey fits within the Spark pack's reach", () => {
    for (const op of Object.keys(OP_ESTIMATES)) expect(estimateCredits(op, E)).toBeGreaterThan(0);
    expect(journeyCredits(E)).toBeLessThan(PACKS[0].credits);
    expect(creditsForCost(0.0001, E)).toBe(1);
  });
});
