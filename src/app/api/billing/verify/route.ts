import { NextResponse } from "next/server";
import { getCaller, supabaseAdmin } from "@/lib/server/admin";
import { fetchOrder, paymentsEnabled } from "@/lib/server/cashfree";

export const runtime = "nodejs";

/** Called when the buyer returns from checkout, so credits appear even if the webhook is delayed. */
export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const admin = supabaseAdmin();
  if (!admin || !paymentsEnabled()) return NextResponse.json({ error: "Payments are not switched on." }, { status: 503 });
  const { orderId } = await req.json().catch(() => ({ orderId: "" }));
  if (typeof orderId !== "string" || !orderId.startsWith("nx_")) return NextResponse.json({ error: "Unknown order." }, { status: 400 });

  const { data: row } = await admin.from("billing_orders").select("id,user_id,status,credits").eq("id", orderId).maybeSingle();
  if (!row || row.user_id !== caller.id) return NextResponse.json({ error: "Unknown order." }, { status: 404 });
  if (row.status === "paid") return NextResponse.json({ status: "paid", credits: row.credits });

  const o = await fetchOrder(orderId);
  if (o.status !== "PAID") return NextResponse.json({ status: o.status.toLowerCase() || "pending" });
  const { data, error } = await admin.rpc("nexus_complete_order", { p_order_id: orderId, p_gateway_ref: o.cfOrderId, p_amount: o.amount });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: data === "paid" || data === "already_paid" ? "paid" : String(data), credits: row.credits });
}
