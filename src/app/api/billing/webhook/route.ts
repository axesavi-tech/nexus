import { NextResponse } from "next/server";
import { supabaseAdmin, verifyWebhookSignature } from "@/lib/server/razorpay";
import { fulfilOrder } from "@/lib/server/fulfil";

export const runtime = "nodejs";

/** Razorpay webhook (payment.captured / order.paid): a safety net if the browser closes before verification. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature") ?? "")) return NextResponse.json({ error: "bad signature" }, { status: 400 });
  const evt = JSON.parse(raw);
  const pay = evt?.payload?.payment?.entity;
  if (!pay?.order_id || !["payment.captured", "order.paid"].includes(evt?.event)) return NextResponse.json({ ignored: true });
  try { return NextResponse.json(await fulfilOrder(supabaseAdmin(), pay.order_id, pay.id)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
