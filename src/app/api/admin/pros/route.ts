import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/razorpay";
import { isAdmin, requireUser } from "@/lib/server/auth";

export const runtime = "nodejs";

async function guard(req: Request) {
  const who = await requireUser(req);
  if (!who || !isAdmin(who.user.email)) return null;
  return who;
}
export async function GET(req: Request) {
  if (!(await guard(req))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { data, error } = await supabaseAdmin().from("pros").select("*").in("status", ["pending_review", "active", "rejected"]).order("updated_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pros: data });
}
export async function POST(req: Request) {
  if (!(await guard(req))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = String(b?.id ?? ""), action = b?.action as "approve" | "reject";
  if (!id || !["approve", "reject"].includes(action)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const patch = action === "approve" ? { status: "active", verified_at: new Date().toISOString(), review_note: String(b?.note ?? "").slice(0, 500) || null } : { status: "rejected", review_note: String(b?.note ?? "").slice(0, 500) || null };
  const { error } = await supabaseAdmin().from("pros").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
