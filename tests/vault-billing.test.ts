import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createVault, unlockWithPassphrase, recoverAndReset, seal, open, isSealed, newRecoveryKey, normRecovery, passphraseProblems } from "@/lib/vault";
import { PRODUCTS, FREE_OPS, applyPurchase, available } from "@/lib/billing";
import { rankPros, SERVICES_FOR_STEP, SERVICES, type Pro } from "@/lib/directory";
import { SETUP_CATEGORIES } from "@/lib/schemas";
import { createHmac } from "node:crypto";
import { verifyCheckoutSignature, verifyWebhookSignature } from "@/lib/server/razorpay";

const FAST = 1000; // test-only KDF rounds; production uses 600,000

describe("zero-knowledge vault", () => {
  it("encrypts so the stored form contains no plaintext, and decrypts with the right key", async () => {
    const { meta, key } = await createVault("correct horse battery staple", FAST);
    const idea = { title: "Premium handloom sarees online", secret: "our margin is 62%" };
    const sealed = await seal(key, idea);
    expect(isSealed(sealed)).toBe(true);
    const stored = JSON.stringify({ meta, sealed });
    expect(stored).not.toContain("handloom");
    expect(stored).not.toContain("62%");
    expect(await open(key, sealed)).toEqual(idea);
  });

  it("only the right passphrase unlocks; a wrong one fails without revealing anything", async () => {
    const { meta, key } = await createVault("correct horse battery staple", FAST);
    const sealed = await seal(key, { x: 1 });
    const k2 = await unlockWithPassphrase(meta, "correct horse battery staple");
    expect(await open(k2, sealed)).toEqual({ x: 1 });
    await expect(unlockWithPassphrase(meta, "wrong passphrase entirely")).rejects.toThrow(/doesn't open/);
  });

  it("the recovery key restores access and sets a new passphrase; the old one stops working", async () => {
    const { meta, key, recoveryKey } = await createVault("my old forgotten phrase", FAST);
    const sealed = await seal(key, { note: "keep me" });
    const lower = recoveryKey.toLowerCase().replace(/-/g, " ");
    const r = await recoverAndReset(meta, lower, "a brand new passphrase", FAST);
    expect(await open(r.key, sealed)).toEqual({ note: "keep me" });
    await expect(unlockWithPassphrase(r.meta, "my old forgotten phrase")).rejects.toThrow();
    expect(await open(await unlockWithPassphrase(r.meta, "a brand new passphrase"), sealed)).toEqual({ note: "keep me" });
    await expect(recoverAndReset(meta, "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH", "x".repeat(12), FAST)).rejects.toThrow(/recovery key/);
  });

  it("generates 160-bit recovery keys and tolerates typing variations", () => {
    const k = newRecoveryKey();
    expect(k).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
    expect(normRecovery(k.toLowerCase())).toBe(k.replace(/-/g, ""));
    expect(new Set(Array.from({ length: 50 }, newRecoveryKey)).size).toBe(50);
  });

  it("rejects weak passphrases", () => {
    expect(passphraseProblems("short")).not.toHaveLength(0);
    expect(passphraseProblems("aaaaaaaaaaaaaaa")).not.toHaveLength(0);
    expect(passphraseProblems("tea at the old mill pond")).toHaveLength(0);
  });

  it("each seal uses a fresh IV (same plaintext never encrypts the same twice)", async () => {
    const { key } = await createVault("correct horse battery staple", FAST);
    const a = await seal(key, { same: true }), b = await seal(key, { same: true });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });
});

describe("plans and credits (hybrid model)", () => {
  const now = new Date("2026-12-01T00:00:00Z");
  it("prices match the chosen model", () => {
    expect(PRODUCTS.pass.amount).toBe(99900);
    expect(PRODUCTS.founder.amount).toBe(99900);
    expect(PRODUCTS.pro.amount).toBe(299900);
    expect(PRODUCTS.topup.amount).toBe(34900);
    expect([PRODUCTS.listing_verified.amount, PRODUCTS.listing_featured.amount, PRODUCTS.listing_premium.amount]).toEqual([299900, 999900, 2499900]);
  });
  it("Plan Pass and top-ups add permanent credits; a monthly plan sets an expiring allowance", () => {
    let e = applyPurchase(null, "pass", now);
    expect(available(e, now.toISOString())).toMatchObject({ credits: 1, planCredits: 0, total: 1 });
    e = applyPurchase(e, "founder", now);
    expect(available(e, now.toISOString())).toMatchObject({ credits: 1, planCredits: 3, total: 4, planActive: true });
    expect(available(e, "2027-01-15T00:00:00Z")).toMatchObject({ planCredits: 0, credits: 1, planActive: false }); // expired after 30 days
    e = applyPurchase({ ...e, plan_credits: 1 }, "pro", now);
    expect(e.plan_credits).toBe(8); // new month replaces the allowance; no rollover
    expect(e.credits).toBe(1);
    expect(applyPurchase(e, "listing_featured", now)).toEqual(e); // listings don't touch founder credits
  });
  it("the free taster covers only the first steps", () => {
    for (const op of ["analyze", "empathize", "ideate", "evaluate"]) expect(FREE_OPS.has(op)).toBe(true);
    for (const op of ["country_guide", "fin_assumptions", "testplan", "blueprint", "roadmap", "decision_report"]) expect(FREE_OPS.has(op)).toBe(false);
  });
});

describe("payment verification", () => {
  it("accepts only Razorpay's HMAC signature", () => {
    const sig = createHmac("sha256", "secret_x").update("order_1|pay_1").digest("hex");
    expect(verifyCheckoutSignature("order_1", "pay_1", sig, "secret_x")).toBe(true);
    expect(verifyCheckoutSignature("order_1", "pay_2", sig, "secret_x")).toBe(false);
    expect(verifyCheckoutSignature("order_1", "pay_1", sig, "")).toBe(false);
    const body = '{"event":"payment.captured"}';
    expect(verifyWebhookSignature(body, createHmac("sha256", "wh").update(body).digest("hex"), "wh")).toBe(true);
    expect(verifyWebhookSignature(body + " ", createHmac("sha256", "wh").update(body).digest("hex"), "wh")).toBe(false);
  });
});

describe("directory", () => {
  const pro = (id: string, tier: Pro["tier"]) => ({ id, tier } as Pro);
  it("paid tiers rank first, with stable daily rotation inside a tier", () => {
    const list = [pro("a", "verified"), pro("b", "premium"), pro("c", "featured"), pro("d", "verified")];
    const r = rankPros(list, "2026-11-21");
    expect(r.map((x) => x.tier)).toEqual(["premium", "featured", "verified", "verified"]);
    expect(rankPros(list, "2026-11-21").map((x) => x.id)).toEqual(r.map((x) => x.id));
  });
  it("every company-setup step maps to known professional services", () => {
    for (const c of SETUP_CATEGORIES) for (const s of SERVICES_FOR_STEP[c]) expect(SERVICES[s]).toBeTruthy();
  });
});
