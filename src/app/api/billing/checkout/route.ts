import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getCaller, supabaseAdmin } from "@/lib/server/admin";
import { cashfreeMode, createOrder, paymentsEnabled } from "@/lib/server/cashfree";
import { packById } from "@/lib/billing/pricing";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Sign in to buy credits." }, { status: 401 });
  const admin = supabaseAdmin();
  if (!admin || !paymentsEnabled()) return NextResponse.json({ error: "Payments are not switched on yet. Please try again soon." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const pack = packById(String(body.packId ?? ""));
  if (!pack) return NextResponse.json({ error: "Unknown pack." }, { status: 400 });
  const phone = String(body.phone ?? "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(phone)) return NextResponse.json({ error: "Enter a valid 10-digit Indian mobile number (needed by the payment gateway)." }, { status: 400 });
  if (!caller.email) return NextResponse.json({ error: "Your account needs an email address." }, { status: 400 });

  // Price and credits come from the server-side pack table only — never from the browser.
  const orderId = `nx_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
  const { error } = await admin.from("billing_orders").insert({ id: orderId, user_id: caller.id, pack_id: pack.id, credits: pack.credits, amount_inr: pack.priceInr });
  if (error) return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });

  const origin = process.env.APP_URL || new URL(req.url).origin;
  try {
    const o = await createOrder({
      orderId, amount: pack.priceInr, customerId: caller.id.replace(/-/g, "").slice(0, 32), email: caller.email, phone,
      note: `NEXUS ${pack.name} — ${pack.credits} credits`,
      returnUrl: `${origin}/account?order_id={order_id}`,
      notifyUrl: `${origin}/api/billing/webhook`,
    });
    return NextResponse.json({ orderId, paymentSessionId: o.paymentSessionId, mode: cashfreeMode });
  } catch (e) {
    await admin.from("billing_orders").update({ status: "failed" }).eq("id", orderId);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
