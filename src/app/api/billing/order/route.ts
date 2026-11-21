import { NextResponse } from "next/server";
import { PRODUCTS, isProduct } from "@/lib/billing";
import { createOrder, razorpayConfigured, supabaseAdmin } from "@/lib/server/razorpay";
import { requireUser } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!razorpayConfigured()) return NextResponse.json({ error: "Payments are not switched on yet." }, { status: 503 });
  const who = await requireUser(req);
  if (!who) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const product: unknown = body?.product;
  if (!isProduct(product)) return NextResponse.json({ error: "Unknown product" }, { status: 400 });
  const p = PRODUCTS[product];
  let listingId: string | null = null;
  if (p.kind === "listing") {
    // The listing must belong to the caller (checked through RLS with their own token).
    const { data } = await who.sb.from("pros").select("id").eq("id", String(body.listingId ?? "")).eq("owner_id", who.user.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Create your listing first" }, { status: 400 });
    listingId = data.id;
  }
  try {
    const order = await createOrder(p.amount, p.currency, `${p.id}-${who.user.id.slice(0, 8)}-${Date.now()}`, { product: p.id, user: who.user.id, ...(listingId ? { listing: listingId } : {}) });
    const { error } = await supabaseAdmin().from("payments").insert({ user_id: who.user.id, product: p.id, amount: p.amount, currency: p.currency, provider_order_id: order.id, listing_id: listingId });
    if (error) throw new Error(error.message);
    return NextResponse.json({ orderId: order.id, amount: p.amount, currency: p.currency, keyId: process.env.RAZORPAY_KEY_ID, name: p.name, email: who.user.email });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
