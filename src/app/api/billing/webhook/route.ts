import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/admin";
import { fetchOrder, verifyWebhook } from "@/lib/server/cashfree";

export const runtime = "nodejs";

/**
 * Cashfree payment webhook. Credits are granted only when:
 *  1. the HMAC signature over (timestamp + raw body) verifies,
 *  2. Cashfree's own Get Order API confirms the order is PAID, and
 *  3. the paid amount equals the amount we stored when the order was created.
 * Granting is idempotent per order, so retries and duplicate deliveries are harmless.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("x-webhook-timestamp"), req.headers.get("x-webhook-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "billing disabled" }, { status: 503 });

  let orderId = "";
  try { orderId = String(JSON.parse(raw)?.data?.order?.order_id ?? ""); } catch { /* ignore */ }
  if (!orderId.startsWith("nx_")) return NextResponse.json({ ok: true, ignored: true });

  const o = await fetchOrder(orderId);
  if (o.status !== "PAID") {
    if (o.status === "EXPIRED" || o.status === "TERMINATED") await admin.from("billing_orders").update({ status: "failed" }).eq("id", orderId).eq("status", "created");
    return NextResponse.json({ ok: true, status: o.status });
  }
  const { data, error } = await admin.rpc("nexus_complete_order", { p_order_id: orderId, p_gateway_ref: o.cfOrderId, p_amount: o.amount });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}
