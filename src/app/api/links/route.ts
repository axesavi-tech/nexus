import { NextResponse } from "next/server";
import { hasSupabase, supabaseAsUser } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Checks whether official links still open. Only public https URLs on ordinary host names are fetched
 * (no IP literals, localhost or internal names) to avoid server-side request forgery.
 * "missing" = the server answered 404/410; "unknown" = blocked, timed out or refused automated checks.
 */
function allowed(u: string): URL | null {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:") return null;
    const h = url.hostname.toLowerCase();
    if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return null;
    if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return null;
    return url;
  } catch { return null; }
}

async function check(u: string): Promise<"ok" | "missing" | "unknown"> {
  const url = allowed(u);
  if (!url) return "unknown";
  const attempt = async (method: "HEAD" | "GET") => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      return await fetch(url, { method, redirect: "manual", signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; NEXUS link checker)", accept: "text/html,*/*" } });
    } finally { clearTimeout(t); }
  };
  try {
    let r = await attempt("HEAD");
    if (r.status === 405 || r.status === 403 || r.status === 400 || r.status === 0) r = await attempt("GET");
    if (r.ok || (r.status >= 300 && r.status < 400)) return "ok"; // redirects are not followed (SSRF safety); a redirect means the address is live
    if (r.status === 404 || r.status === 410) return "missing";
    return "unknown";
  } catch { return "unknown"; }
}

export async function POST(req: Request) {
  if (hasSupabase()) {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { data, error } = await supabaseAsUser(token).auth.getUser(token);
    if (error || !data.user) return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const urls: string[] = Array.isArray(body?.urls) ? body.urls.filter((x: unknown) => typeof x === "string").slice(0, 60) : [];
  const results = await Promise.all([...new Set(urls)].map(async (u) => [u, await check(u)] as const));
  return NextResponse.json({ results: Object.fromEntries(results) });
}
