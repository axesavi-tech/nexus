import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../supabase";

export const razorpayConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY);
/** Paywall is enforced only once payments actually work, so nobody is ever blocked from something they can't buy. */
export const billingEnforced = () => razorpayConfigured() && process.env.BILLING_ENFORCE !== "0";

/** Service-role client — server only, bypasses RLS. Used solely to record verified payments and moderation. */
export function supabaseAdmin(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function createOrder(amount: number, currency: string, receipt: string, notes: Record<string, string>) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount, currency, receipt: receipt.slice(0, 40), notes }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.description ?? `Payment provider error (${res.status})`);
  return json as { id: string; amount: number; currency: string };
}

const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, secret = process.env.RAZORPAY_KEY_SECRET ?? "") {
  return !!secret && safeEq(createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex"), signature);
}
export function verifyWebhookSignature(rawBody: string, signature: string, secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "") {
  return !!secret && safeEq(createHmac("sha256", secret).update(rawBody).digest("hex"), signature);
}
