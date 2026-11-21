import { NextResponse } from "next/server";
import { razorpayConfigured, supabaseAdmin, verifyCheckoutSignature } from "@/lib/server/razorpay";
import { fulfilOrder } from "@/lib/server/fulfil";
import { requireUser } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!razorpayConfigured()) return NextResponse.json({ error: "Payments are not switched on yet." }, { status: 503 });
  const who = await requireUser(req);
  if (!who) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const orderId = String(b?.orderId ?? ""), paymentId = String(b?.paymentId ?? ""), signature = String(b?.signature ?? "");
  if (!verifyCheckoutSignature(orderId, paymentId, signature)) return NextResponse.json({ error: "Payment could not be verified" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: pay } = await admin.from("payments").select("user_id").eq("provider_order_id", orderId).maybeSingle();
  if (!pay || pay.user_id !== who.user.id) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  try { return NextResponse.json(await fulfilOrder(admin, orderId, paymentId)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
