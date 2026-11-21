/**
 * Plans and products (the hybrid model chosen on 2026-11-21). Prices are in paise and include any
 * applicable taxes. One "plan" = one idea taken through the full journey (research, numbers, delivery plan).
 */
export type ProductId = "pass" | "topup" | "founder" | "pro" | "listing_verified" | "listing_featured" | "listing_premium";
export interface Product { id: ProductId; name: string; amount: number; currency: "INR"; kind: "credit" | "plan" | "listing"; credits?: number; planCredits?: number; days?: number; tier?: "verified" | "featured" | "premium"; blurb: string }

export const PRODUCTS: Record<ProductId, Product> = {
  pass: { id: "pass", name: "Plan Pass", amount: 99900, currency: "INR", kind: "credit", credits: 1, blurb: "Unlock one idea, end to end. No subscription." },
  topup: { id: "topup", name: "Extra plan", amount: 34900, currency: "INR", kind: "credit", credits: 1, blurb: "One more idea for subscribers who've used their plans." },
  founder: { id: "founder", name: "Founder", amount: 99900, currency: "INR", kind: "plan", planCredits: 3, days: 30, blurb: "3 ideas a month, end to end." },
  pro: { id: "pro", name: "Pro", amount: 299900, currency: "INR", kind: "plan", planCredits: 8, days: 30, blurb: "8 ideas a month, for advisers and studios." },
  listing_verified: { id: "listing_verified", name: "Verified listing", amount: 299900, currency: "INR", kind: "listing", tier: "verified", days: 365, blurb: "Listed after a registration check, with contact details." },
  listing_featured: { id: "listing_featured", name: "Featured listing", amount: 999900, currency: "INR", kind: "listing", tier: "featured", days: 365, blurb: "Shown first in your city and services, with a Featured badge." },
  listing_premium: { id: "listing_premium", name: "Premium partner", amount: 2499900, currency: "INR", kind: "listing", tier: "premium", days: 365, blurb: "Also suggested inside matching company-setup steps (marked Sponsored), plus an enquiry form." },
};
export const isProduct = (x: unknown): x is ProductId => typeof x === "string" && x in PRODUCTS;
export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

/** Free taster: understand the idea, customers, options and comparison. Everything else needs an unlocked idea. */
export const FREE_OPS = new Set(["analyze", "empathize", "ideate", "evaluate", "node", "spark", "cluster"]);
export const PAYWALL_MESSAGE = "This step is part of a paid plan. Unlock this idea with a Plan Pass or a subscription to continue.";

export interface Entitlement { plan: "founder" | "pro" | null; plan_until: string | null; plan_credits: number; credits: number }
export function available(e: Entitlement | null, nowISO = new Date().toISOString()) {
  if (!e) return { planCredits: 0, credits: 0, total: 0, planActive: false };
  const planActive = !!e.plan && !!e.plan_until && e.plan_until > nowISO;
  const planCredits = planActive ? e.plan_credits : 0;
  return { planCredits, credits: e.credits, total: planCredits + e.credits, planActive };
}

/** Pure state change applied when a payment is confirmed (mirrors what the server writes). */
export function applyPurchase(e: Entitlement | null, product: ProductId, now = new Date()): Entitlement {
  const p = PRODUCTS[product];
  const cur: Entitlement = e ?? { plan: null, plan_until: null, plan_credits: 0, credits: 0 };
  if (p.kind === "credit") return { ...cur, credits: cur.credits + (p.credits ?? 0) };
  if (p.kind === "plan") {
    // A new month replaces the plan allowance (unused plan credits don't roll over); purchased credits are kept.
    return { ...cur, plan: product as "founder" | "pro", plan_until: new Date(now.getTime() + (p.days ?? 30) * 86400000).toISOString(), plan_credits: p.planCredits ?? 0 };
  }
  return cur;
}
