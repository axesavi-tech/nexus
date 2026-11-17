import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, supabaseAsUser } from "@/lib/supabase";

/** Service-role key (legacy "service_role" JWT or new "sb_secret_…" key). Never exposed to the browser. */
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

let admin: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient | null {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  if (!admin) admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

/** Billing runs only when the server can write to the ledger. Without the key, AI use is unmetered (development). */
export const billingEnabled = () => Boolean(supabaseAdmin());

export interface Caller { id: string; email: string | null; token: string }

/** Verify the bearer token and return the signed-in user, or null. */
export async function getCaller(req: Request): Promise<Caller | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await supabaseAsUser(token).auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null, token };
}

/** Accounts that are never charged (the owner's own account, for example). */
export function isExempt(email: string | null): boolean {
  if (!email) return false;
  const list = (process.env.BILLING_EXEMPT_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

export async function getBalance(userId: string): Promise<number> {
  const a = supabaseAdmin();
  if (!a) return Number.POSITIVE_INFINITY;
  const { data } = await a.from("billing_wallets").select("balance").eq("user_id", userId).maybeSingle();
  return data?.balance ?? 0;
}

export async function charge(userId: string, credits: number, operation: string, projectId: string | null, costInr: number, meta: Record<string, unknown>) {
  const a = supabaseAdmin();
  if (!a) return null;
  const { data, error } = await a.rpc("nexus_charge", {
    p_user: userId, p_credits: credits, p_operation: operation, p_project: projectId, p_cost_inr: Math.round(costInr * 10000) / 10000, p_meta: meta,
  });
  if (error) throw new Error(`Billing error: ${error.message}`);
  return data as number;
}
