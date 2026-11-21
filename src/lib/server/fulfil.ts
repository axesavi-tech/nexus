import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCTS, applyPurchase, isProduct, type Entitlement } from "../billing";

/**
 * Apply a confirmed payment exactly once. The status flip from 'created' to 'paid' is the idempotency guard:
 * the checkout callback and the webhook may both arrive, and only the first one grants anything.
 */
export async function fulfilOrder(admin: SupabaseClient, orderId: string, paymentId: string): Promise<{ ok: boolean; already?: boolean; product?: string }> {
  const { data: claimed, error } = await admin.from("payments")
    .update({ status: "paid", provider_payment_id: paymentId, paid_at: new Date().toISOString() })
    .eq("provider_order_id", orderId).eq("status", "created").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!claimed) {
    const { data: existing } = await admin.from("payments").select("status,product").eq("provider_order_id", orderId).maybeSingle();
    if (existing?.status === "paid") return { ok: true, already: true, product: existing.product };
    throw new Error("Unknown order");
  }
  const product = claimed.product as string;
  if (!isProduct(product)) throw new Error("Unknown product");
  const p = PRODUCTS[product];
  if (p.kind === "listing") {
    if (!claimed.listing_id) throw new Error("Listing missing on order");
    const { data: pro } = await admin.from("pros").select("paid_until,verified_at").eq("id", claimed.listing_id).maybeSingle();
    const start = pro?.paid_until && pro.paid_until > new Date().toISOString() ? new Date(pro.paid_until) : new Date();
    const paidUntil = new Date(start.getTime() + (p.days ?? 365) * 86400000).toISOString();
    const { error: e2 } = await admin.from("pros").update({ tier: p.tier, paid_until: paidUntil, status: pro?.verified_at ? "active" : "pending_review" }).eq("id", claimed.listing_id);
    if (e2) throw new Error(e2.message);
  } else {
    const { data: cur } = await admin.from("entitlements").select("plan,plan_until,plan_credits,credits").eq("user_id", claimed.user_id).maybeSingle();
    const next = applyPurchase((cur as Entitlement | null) ?? null, product);
    const { error: e3 } = await admin.from("entitlements").upsert({ user_id: claimed.user_id, ...next, updated_at: new Date().toISOString() });
    if (e3) throw new Error(e3.message);
  }
  return { ok: true, product };
}
