"use client";
import { supabaseBrowser } from "./supabase";

export class AIError extends Error {}

export async function callAI<T>(op: string, input: unknown, projectId?: string): Promise<{ data: T; mode: "live" | "dev"; model: string }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const sb = supabaseBrowser();
  if (sb) {
    const { data } = await sb.auth.getSession();
    if (data.session) headers.authorization = `Bearer ${data.session.access_token}`;
  }
  const res = await fetch(`/api/ai/${op}`, { method: "POST", headers, body: JSON.stringify({ input, projectId }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (!json.error && (res.status === 504 || res.status === 524))
      throw new AIError("The AI took too long to respond. Please try again — large plans can take a couple of minutes.");
    throw new AIError(json.error ?? `AI request failed (${res.status})`);
  }
  return json;
}
