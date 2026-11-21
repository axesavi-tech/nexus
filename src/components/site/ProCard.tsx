"use client";
import { useState } from "react";
import { SERVICES, type Pro } from "@/lib/directory";
import { countryByCode } from "@/lib/countries";
import { supabaseBrowser } from "@/lib/supabase";

export function ProCard({ pro, compact, sponsored }: { pro: Pro; compact?: boolean; sponsored?: boolean }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const c = countryByCode(pro.country);
  const send = async () => {
    const sb = supabaseBrowser();
    const s = (await sb?.auth.getSession())?.data.session;
    if (!sb || !s) { setSent("Sign in to send an enquiry."); return; }
    const { error } = await sb.from("pro_enquiries").insert({ pro_id: pro.id, from_email: s.user.email, message: msg.trim() });
    setSent(error ? `Couldn't send: ${error.message}` : "Sent — they'll reply to your email.");
    if (!error) setMsg("");
  };
  return (
    <article className={`card ${compact ? "p-3" : "p-5"}`} style={pro.tier === "premium" || pro.tier === "featured" ? { borderLeft: "3px solid var(--accent)" } : undefined}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-[180px]">
          <div className="font-semibold">{pro.name}{pro.firm && <span className="text-ink2 font-normal"> · {pro.firm}</span>}</div>
          <div className="text-xs text-ink3">{[pro.city, c?.name].filter(Boolean).join(", ")}{pro.languages.length > 0 && ` · ${pro.languages.join(", ")}`}</div>
        </div>
        <div className="flex gap-1">
          {sponsored && <span className="chip !text-[10.5px] !py-0">Sponsored</span>}
          {pro.tier === "featured" && <span className="chip !text-[10.5px] !py-0 !border-accent !text-accent">Featured</span>}
          {pro.tier === "premium" && <span className="chip !text-[10.5px] !py-0 !border-accent !text-accent">Premium partner</span>}
          {pro.verified_at && <span className="chip !text-[10.5px] !py-0 !border-ok !text-ok" title={pro.registration ? `Registration: ${pro.registration}` : "Checked by NEXUS"}>✓ Registration checked</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">{pro.services.map((s) => <span key={s} className="chip !text-[11px] !py-0">{SERVICES[s] ?? s}</span>)}</div>
      {!compact && pro.about && <p className="text-sm text-ink2 mt-2">{pro.about}</p>}
      <div className="flex flex-wrap gap-3 mt-3 text-sm">
        {pro.website && <a className="text-accent underline" href={pro.website} target="_blank" rel="noopener noreferrer nofollow sponsored">Website</a>}
        {pro.email && <a className="text-accent underline" href={`mailto:${pro.email}`}>Email</a>}
        {pro.phone && <a className="text-accent underline" href={`tel:${pro.phone.replace(/\s/g, "")}`}>{pro.phone}</a>}
        {pro.tier === "premium" && <button className="text-accent underline" onClick={() => setOpen(!open)}>Send an enquiry</button>}
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <textarea className="input text-sm" rows={3} maxLength={2000} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="What do you need help with? Don't include confidential details of your idea." />
          <button className="btn !py-1 text-sm" disabled={msg.trim().length < 10} onClick={send}>Send</button>
          {sent && <span className="text-xs text-ink2 ml-2">{sent}</span>}
        </div>
      )}
    </article>
  );
}
