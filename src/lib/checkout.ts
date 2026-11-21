"use client";
import { supabaseBrowser } from "./supabase";
import type { ProductId } from "./billing";

declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void } } }

async function authHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { "content-type": "application/json" };
  const s = (await supabaseBrowser()?.auth.getSession())?.data.session;
  if (s) h.authorization = `Bearer ${s.access_token}`;
  return h;
}
function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => res(); s.onerror = () => rej(new Error("Couldn't load the payment window. Check your connection and try again."));
    document.body.appendChild(s);
  });
}

/** Create an order on our server, open Razorpay Checkout, then have the server verify the signature and grant. */
export async function buy(product: ProductId, listingId?: string): Promise<{ ok: boolean; error?: string; cancelled?: boolean }> {
  const headers = await authHeaders();
  if (!headers.authorization) return { ok: false, error: "Sign in first." };
  const r = await fetch("/api/billing/order", { method: "POST", headers, body: JSON.stringify({ product, listingId }) });
  const order = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: order.error ?? "Couldn't start the payment." };
  await loadScript();
  return new Promise((resolve) => {
    const rz = new window.Razorpay!({
      key: order.keyId, amount: order.amount, currency: order.currency, order_id: order.orderId, name: "NEXUS", description: order.name,
      prefill: { email: order.email }, theme: { color: "#a8641a" },
      handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const v = await fetch("/api/billing/verify", { method: "POST", headers, body: JSON.stringify({ orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature }) });
        const j = await v.json().catch(() => ({}));
        resolve(v.ok ? { ok: true } : { ok: false, error: j.error ?? "Payment received but not confirmed yet — it will appear shortly." });
      },
      modal: { ondismiss: () => resolve({ ok: false, cancelled: true }) },
    });
    rz.open();
  });
}
