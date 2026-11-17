import { NextResponse } from "next/server";
import { getCaller, supabaseAdmin } from "@/lib/server/admin";

export const runtime = "nodejs";

/**
 * Right to erasure (DPDP Act 2023 s.12, GDPR art.17): deletes every project, map, artifact, task,
 * version, audit event and AI log for the caller, then the login itself. Payment records are kept
 * without the user link, as required for tax and accounting.
 */
export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const { confirm } = await req.json().catch(() => ({ confirm: "" }));
  if (typeof confirm !== "string" || confirm.trim().toLowerCase() !== (caller.email ?? "").toLowerCase()) {
    return NextResponse.json({ error: "Type your email address exactly to confirm." }, { status: 400 });
  }
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Account deletion is unavailable right now. Email us and we will do it within 7 days." }, { status: 503 });
  const { error: e1 } = await admin.rpc("nexus_erase_user", { p_user: caller.id });
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  const { error: e2 } = await admin.auth.admin.deleteUser(caller.id);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
