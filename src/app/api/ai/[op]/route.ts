import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { OPS, runOp, type OpName } from "@/lib/ai/gateway";
import { hasSupabase, supabaseAsUser } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

// Per-instance burst limiter (best effort on serverless); the daily cap below is enforced from the database.
const hits = new Map<string, number[]>();
function burstLimited(key: string, perMinute = Number(process.env.AI_RATE_PER_MINUTE ?? 20)) {
  const t = Date.now();
  const arr = (hits.get(key) ?? []).filter((x) => t - x < 60_000);
  arr.push(t);
  hits.set(key, arr);
  return arr.length > perMinute;
}

export async function POST(req: Request, ctx: { params: Promise<{ op: string }> }) {
  const { op } = await ctx.params;
  if (!(op in OPS)) return NextResponse.json({ error: "Unknown operation" }, { status: 404 });

  let userId = "local";
  let sb: ReturnType<typeof supabaseAsUser> | null = null;
  if (hasSupabase()) {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    sb = supabaseAsUser(token);
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return NextResponse.json({ error: "Session expired — sign in again" }, { status: 401 });
    userId = data.user.id;
    const cap = Number(process.env.AI_DAILY_LIMIT ?? 200);
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await sb.from("ai_runs").select("id", { count: "exact", head: true }).gte("created_at", since);
    if ((count ?? 0) >= cap) return NextResponse.json({ error: `Daily AI limit (${cap}) reached` }, { status: 429 });
  }
  if (burstLimited(userId)) return NextResponse.json({ error: "Too many requests — slow down a little" }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const projectId = (body as { projectId?: string })?.projectId ?? null;

  try {
    const out = await runOp(op as OpName, (body as { input?: unknown })?.input);
    if (sb) await sb.from("ai_runs").insert({ owner_id: userId, project_id: projectId, operation: op, model: out.model, input_tokens: out.tokens?.input ?? null, output_tokens: out.tokens?.output ?? null, ok: true });
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof ZodError ? "Invalid request: " + e.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ") : (e as Error).message;
    if (sb) await sb.from("ai_runs").insert({ owner_id: userId, project_id: projectId, operation: op, ok: false, error: msg.slice(0, 500) });
    return NextResponse.json({ error: msg }, { status: e instanceof ZodError ? 400 : 502 });
  }
}

export async function GET() {
  return NextResponse.json({ mode: process.env.ANTHROPIC_API_KEY ? "live" : "dev", model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", persistence: hasSupabase() ? "supabase" : "local" });
}
