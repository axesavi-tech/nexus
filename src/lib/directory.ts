import type { SetupCategory } from "./schemas";
import { supabaseBrowser } from "./supabase";

export const SERVICES = {
  company_registration: "Company registration",
  ca_cs: "Chartered accountant / company secretary",
  tax_gst: "Tax & GST / VAT",
  accounting: "Bookkeeping & accounting",
  legal: "Startup & contracts lawyer",
  trademark_ip: "Trademark & IP attorney",
  banking: "Banking & payment setup",
  payroll_hr: "Payroll & HR compliance",
  licensing: "Licences & permits",
  funding: "Fundraising & investor readiness",
} as const;
export type Service = keyof typeof SERVICES;
export const SERVICE_IDS = Object.keys(SERVICES) as Service[];

/** Which professionals can help with each company-setup step. */
export const SERVICES_FOR_STEP: Record<SetupCategory, Service[]> = {
  structure: ["legal", "ca_cs"], formation: ["company_registration", "ca_cs"], tax: ["tax_gst", "ca_cs"], banking: ["banking", "ca_cs"],
  licences: ["licensing", "legal"], employment: ["payroll_hr"], ip: ["trademark_ip"], data: ["legal"], sector: ["legal", "licensing"], ongoing: ["accounting", "ca_cs"],
};

export interface Pro {
  id: string; owner_id: string; name: string; firm: string | null; services: Service[]; country: string; city: string | null; languages: string[];
  about: string | null; website: string | null; email: string | null; phone: string | null; registration: string | null;
  tier: "none" | "verified" | "featured" | "premium"; status: "draft" | "pending_review" | "active" | "rejected";
  paid_until: string | null; verified_at: string | null; review_note: string | null; created_at: string; updated_at: string;
}
const TIER_RANK: Record<Pro["tier"], number> = { premium: 3, featured: 2, verified: 1, none: 0 };

/** Paid tiers first; within a tier, a daily rotation so no single listing is always on top. */
export function rankPros(list: Pro[], seed = new Date().toISOString().slice(0, 10)): Pro[] {
  const h = (s: string) => { let x = 0; for (const c of seed + s) x = (x * 31 + c.charCodeAt(0)) | 0; return x; };
  return [...list].sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || h(a.id) - h(b.id));
}

export async function livePros(country: string): Promise<{ pros: Pro[]; error?: string }> {
  const sb = supabaseBrowser();
  if (!sb) return { pros: [], error: "The directory needs the cloud database." };
  const { data, error } = await sb.from("pros").select("*").eq("country", country).eq("status", "active").gt("paid_until", new Date().toISOString()).limit(200);
  if (error) return { pros: [], error: error.message.includes("does not exist") || error.code === "42P01" || error.code === "PGRST205" ? "The directory isn't switched on yet." : error.message };
  return { pros: rankPros((data ?? []) as Pro[]) };
}
