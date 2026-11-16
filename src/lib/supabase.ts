import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const hasSupabase = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

let browser: SupabaseClient | null = null;
export function supabaseBrowser(): SupabaseClient | null {
  if (!hasSupabase()) return null;
  if (!browser) browser = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return browser;
}

/** Server-side client acting as the calling user (RLS applies). */
export function supabaseAsUser(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
