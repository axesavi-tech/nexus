import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { OPS, runOp, type OpName } from "@/lib/ai/gateway";
import { hasSupabase, supabaseAsUser } from "@/lib/supabase";
import { billingEnabled, charge, getBalance, getCaller, isExempt } from "@/lib/server/admin";
import { creditsForUsage, estimateCredits, requestCostInr } from "@/lib/billing/pricing";

export const runtime = "nodejs";
// Blueprint and roadmap generation can take well over a minute (up to 12k output tokens, plus one
// corrective retry). Fluid compute allows up to 300 s.
export const maxDuration = 300;

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
  let email: string | null = null;
  let sb: ReturnType<typeof supabaseAsUser> | null = null;
  if (hasSupabase()) {
    const caller = await getCaller(req);
    if (!caller) return NextResponse.json({ error: "Session expired — sign in again" }, { status: 401 });
    userId = caller.id; email = caller.email;
    sb = supabaseAsUser(caller.token);
    const cap = Number(process.env.AI_DAILY_LIMIT ?? 200);
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await sb.from("ai_runs").select("id", { count: "exact", head: true }).gte("created_at", since);
    if ((count ?? 0) >= cap) return NextResponse.json({ error: `Daily AI limit (${cap}) reached` }, { status: 429 });
  }
  if (burstLimited(userId)) return NextResponse.json({ error: "Too many requests — slow down a little" }, { status: 429 });

  // Prepaid credits: make sure the caller can cover a typical run of this step before spending tokens.
  const metered = Boolean(sb) && billingEnabled() && !isExempt(email);
  if (metered) {
    const need = estimateCredits(op);
    const balance = await getBalance(userId);
    if (balance < need) {
      return NextResponse.json({
        error: `This step needs about ${need} credits and you have ${Math.max(0, balance)}. Add credits on the Pricing page to continue — your work is saved.`,
        code: "insufficient_credits", need, balance,
      }, { status: 402 });
    }
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const projectId = (body as { projectId?: string })?.projectId ?? null;

  try {
    const out = await runOp(op as OpName, (body as { input?: unknown })?.input);
    let billing: { charged: number; balance: number } | undefined;
    let cost: number | null = null, credits: number | null = null;
    if (out.mode === "live" && out.tokens) {
      const usage = { model: out.model, inputTokens: out.tokens.input ?? 0, outputTokens: out.tokens.output ?? 0 };
      cost = requestCostInr(usage);
      credits = creditsForUsage(usage);
      if (metered) {
        try {
          const balance = await charge(userId, credits, op, projectId, cost, { model: out.model, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens });
          billing = { charged: credits, balance: balance ?? 0 };
        } catch (err) {
          // Never lose the user's result over a ledger hiccup; the failed charge is logged for reconciliation.
          console.error("[billing] charge failed", { userId, op, credits, err: (err as Error).message });
        }
      }
    }
    if (sb) await sb.from("ai_runs").insert({ owner_id: userId, project_id: projectId, operation: op, model: out.model, input_tokens: out.tokens?.input ?? null, output_tokens: out.tokens?.output ?? null, ok: true, cost_inr: cost, credits: metered ? credits : 0 });
    return NextResponse.json({ ...out, billing });
  } catch (e) {
    const msg = e instanceof ZodError ? "Invalid request: " + e.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ") : (e as Error).message;
    if (sb) await sb.from("ai_runs").insert({ owner_id: userId, project_id: projectId, operation: op, ok: false, error: msg.slice(0, 500) });
    return NextResponse.json({ error: msg }, { status: e instanceof ZodError ? 400 : 502 });
  }
}

export async function GET() {
  return NextResponse.json({
    mode: process.env.ANTHROPIC_API_KEY ? "live" : "dev",
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    persistence: hasSupabase() ? "supabase" : "local",
    billing: billingEnabled(),
  });
}
