import "server-only";
import crypto from "node:crypto";

/**
 * Minimal Cashfree Payment Gateway client (API version 2025-01-01).
 * Individuals can open an account with PAN, Aadhaar and a bank account — no company documents.
 */
const API_VERSION = "2025-01-01";
const ENV = (process.env.CASHFREE_ENV ?? "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
const BASE = ENV === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
const APP_ID = process.env.CASHFREE_APP_ID ?? "";
const SECRET = process.env.CASHFREE_SECRET_KEY ?? "";

export const cashfreeMode = ENV;
export const paymentsEnabled = () => Boolean(APP_ID && SECRET);

function headers() {
  return { "content-type": "application/json", "x-api-version": API_VERSION, "x-client-id": APP_ID, "x-client-secret": SECRET };
}

export interface CreateOrderInput {
  orderId: string; amount: number; customerId: string; email: string; phone: string; note: string; returnUrl: string; notifyUrl: string;
}

export async function createOrder(i: CreateOrderInput): Promise<{ paymentSessionId: string; cfOrderId: string }> {
  const res = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      order_id: i.orderId,
      order_amount: i.amount,
      order_currency: "INR",
      order_note: i.note.slice(0, 200),
      customer_details: { customer_id: i.customerId, customer_email: i.email, customer_phone: i.phone },
      order_meta: { return_url: i.returnUrl, notify_url: i.notifyUrl },
    }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.payment_session_id) throw new Error(json.message ?? `Cashfree order failed (${res.status})`);
  return { paymentSessionId: json.payment_session_id, cfOrderId: String(json.cf_order_id ?? "") };
}

/** Authoritative order status from Cashfree (never trust the browser or the webhook body alone). */
export async function fetchOrder(orderId: string): Promise<{ status: string; amount: number; cfOrderId: string }> {
  const res = await fetch(`${BASE}/orders/${encodeURIComponent(orderId)}`, { headers: headers(), cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message ?? `Cashfree lookup failed (${res.status})`);
  return { status: String(json.order_status ?? ""), amount: Number(json.order_amount), cfOrderId: String(json.cf_order_id ?? "") };
}

/** Webhook signature: base64(HMAC-SHA256(timestamp + rawBody, secret)), compared in constant time. */
export function verifyWebhook(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  if (!timestamp || !signature || !SECRET) return false;
  const expected = crypto.createHmac("sha256", SECRET).update(timestamp + rawBody).digest("base64");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  // No staleness window: Cashfree may retry with the original timestamp. Replays are harmless because
  // every webhook is re-verified against Cashfree's own order record and crediting is idempotent.
  return true;
}
