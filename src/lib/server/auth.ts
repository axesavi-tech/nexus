import "server-only";
import { supabaseAsUser } from "../supabase";

/** Resolve the calling user from the bearer token (RLS-scoped client included). */
export async function requireUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const sb = supabaseAsUser(token);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return { sb, user: data.user };
}
export const isAdmin = (email?: string | null) =>
  !!email && (process.env.ADMIN_EMAILS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
