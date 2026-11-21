"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";
import { COUNTRIES } from "@/lib/countries";
import { SERVICES, SERVICE_IDS, type Pro, type Service } from "@/lib/directory";
import { PRODUCTS, rupees, type ProductId } from "@/lib/billing";
import { buy } from "@/lib/checkout";
import { supabaseBrowser } from "@/lib/supabase";

type Form = Pick<Pro, "name" | "firm" | "country" | "city" | "about" | "website" | "email" | "phone" | "registration"> & { services: Service[]; languages: string };
const EMPTY: Form = { name: "", firm: "", country: "IN", city: "", about: "", website: "", email: "", phone: "", registration: "", services: [], languages: "" };
const TIERS: ProductId[] = ["listing_verified", "listing_featured", "listing_premium"];

function Join() {
  const [mine, setMine] = useState<Pro | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payments, setPayments] = useState<boolean | null>(null);
  const [enquiries, setEnquiries] = useState<{ id: string; from_email: string; message: string; created_at: string }[]>([]);
  const sb = supabaseBrowser()!;

  const load = async () => {
    const { data: u } = await sb.auth.getUser();
    const { data, error } = await sb.from("pros").select("*").eq("owner_id", u.user!.id).order("created_at").limit(1).maybeSingle();
    if (error) { setMsg(error.code === "PGRST205" || error.message.includes("does not exist") ? "The directory isn't switched on yet — check back soon." : error.message); return; }
    if (data) {
      const p = data as Pro;
      setMine(p);
      setF({ name: p.name, firm: p.firm ?? "", country: p.country, city: p.city ?? "", about: p.about ?? "", website: p.website ?? "", email: p.email ?? "", phone: p.phone ?? "", registration: p.registration ?? "", services: p.services, languages: p.languages.join(", ") });
      const { data: e } = await sb.from("pro_enquiries").select("id,from_email,message,created_at").eq("pro_id", p.id).order("created_at", { ascending: false }).limit(50);
      setEnquiries(e ?? []);
    } else {
      const { data: s } = await sb.auth.getSession();
      setF((x) => ({ ...x, email: s.session?.user.email ?? "" }));
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); fetch("/api/ai/status").then((r) => r.json()).then((s) => setPayments(!!s.payments)).catch(() => setPayments(false)); }, []);

  const save = async () => {
    setMsg(null);
    if (f.name.trim().length < 2) return setMsg("Add your name.");
    if (!f.services.length) return setMsg("Pick at least one service.");
    if (f.website && !/^https:\/\//i.test(f.website)) return setMsg("Website must start with https://");
    if (!f.registration?.trim()) return setMsg("Add your professional registration (e.g. ICAI / ICSI membership or Bar Council enrolment number) — we check it before your listing goes live.");
    setBusy(true);
    const row = { name: f.name.trim(), firm: f.firm?.trim() || null, country: f.country, city: f.city?.trim() || null, about: f.about?.trim() || null, website: f.website?.trim() || null, email: f.email?.trim() || null, phone: f.phone?.trim() || null, registration: f.registration?.trim() || null, services: f.services, languages: f.languages.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8) };
    const r = mine ? await sb.from("pros").update(row).eq("id", mine.id) : await sb.from("pros").insert(row);
    setBusy(false);
    if (r.error) return setMsg(r.error.message);
    setMsg("Saved."); load();
  };
  const pay = async (id: ProductId) => {
    if (!mine) return;
    setBusy(true); setMsg(null);
    const r = await buy(id, mine.id);
    setBusy(false);
    if (r.ok) { setMsg("Payment received. We'll check your registration and switch your listing on — usually within 2 working days."); load(); }
    else if (!r.cancelled) setMsg(r.error ?? "Payment failed.");
  };
  const live = mine && mine.status === "active" && mine.paid_until && mine.paid_until > new Date().toISOString();

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-3xl mx-auto px-6 pt-6">
        <h1 className="serif text-4xl mb-2">List your practice</h1>
        <p className="text-ink2 mb-6">Founders using NEXUS see professionals in their country at the moment they plan company setup. Every listing is checked before it goes live, and paid placement is always labelled.</p>
        {mine && (
          <div className="card p-4 mb-6 text-sm">
            <b>Status:</b> {live ? `Live (${mine.tier}) until ${new Date(mine.paid_until!).toLocaleDateString()}` : mine.status === "pending_review" ? "Paid — awaiting registration check" : mine.status === "rejected" ? `Not approved${mine.review_note ? `: ${mine.review_note}` : ""}` : "Draft — choose a plan to go live"}
            {mine.verified_at && <span className="text-ok"> · ✓ registration checked</span>}
          </div>
        )}
        <div className="card p-5 grid sm:grid-cols-2 gap-4">
          <label className="text-sm">Your name<input className="input mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="text-sm">Firm (optional)<input className="input mt-1" value={f.firm ?? ""} onChange={(e) => setF({ ...f, firm: e.target.value })} /></label>
          <label className="text-sm">Country<select className="input mt-1" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}</select></label>
          <label className="text-sm">City<input className="input mt-1" value={f.city ?? ""} onChange={(e) => setF({ ...f, city: e.target.value })} /></label>
          <fieldset className="sm:col-span-2"><legend className="text-sm mb-1">Services (up to 8)</legend>
            <div className="flex flex-wrap gap-2">{SERVICE_IDS.map((s) => {
              const on = f.services.includes(s);
              return <button type="button" key={s} className={`chip ${on ? "!border-accent !text-accent" : ""}`} aria-pressed={on} onClick={() => setF({ ...f, services: on ? f.services.filter((x) => x !== s) : [...f.services, s].slice(0, 8) })}>{SERVICES[s]}</button>;
            })}</div>
          </fieldset>
          <label className="text-sm sm:col-span-2">Professional registration<input className="input mt-1" value={f.registration ?? ""} onChange={(e) => setF({ ...f, registration: e.target.value })} placeholder="e.g. ICAI membership no. 123456 · ICSI ACS 12345 · Bar Council of Maharashtra MAH/1234/2015" /></label>
          <label className="text-sm sm:col-span-2">About your practice<textarea className="input mt-1" rows={3} maxLength={1200} value={f.about ?? ""} onChange={(e) => setF({ ...f, about: e.target.value })} placeholder="Who you help, what you do, typical turnaround and fees" /></label>
          <label className="text-sm">Website<input className="input mt-1" value={f.website ?? ""} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="https://" /></label>
          <label className="text-sm">Languages<input className="input mt-1" value={f.languages} onChange={(e) => setF({ ...f, languages: e.target.value })} placeholder="English, Hindi, Marathi" /></label>
          <label className="text-sm">Contact email<input className="input mt-1" type="email" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="text-sm">Phone<input className="input mt-1" value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          <div className="sm:col-span-2 flex items-center gap-3"><button className="btn btn-primary" disabled={busy} onClick={save}>{mine ? "Save changes" : "Create listing"}</button>{msg && <span className="text-sm" role="status">{msg}</span>}</div>
        </div>

        {mine && (
          <>
            <h2 className="serif text-2xl mt-10 mb-3">Choose your plan</h2>
            {payments === false && <p className="text-sm text-warn mb-3">Payments are being switched on — check back shortly.</p>}
            <div className="grid md:grid-cols-3 gap-3">
              {TIERS.map((id) => (
                <div key={id} className={`card p-5 flex flex-col ${id === "listing_featured" ? "!border-accent" : ""}`}>
                  <div className="font-semibold">{PRODUCTS[id].name}</div>
                  <div className="serif text-3xl my-2">{rupees(PRODUCTS[id].amount)}<span className="text-sm text-ink3"> / year</span></div>
                  <p className="text-sm text-ink2 flex-1">{PRODUCTS[id].blurb}</p>
                  <button className="btn btn-primary mt-4 justify-center" disabled={busy || !payments} onClick={() => pay(id)}>{mine.tier !== "none" && live ? "Renew / upgrade" : "Pay & submit"}</button>
                </div>
              ))}
            </div>
            <p className="text-xs text-ink3 mt-2">Prices include applicable taxes. If your registration can&apos;t be verified we refund the payment.</p>
            {enquiries.length > 0 && (
              <>
                <h2 className="serif text-2xl mt-10 mb-3">Enquiries</h2>
                <ul className="space-y-2">{enquiries.map((e) => <li key={e.id} className="card p-3 text-sm"><div className="text-xs text-ink3">{new Date(e.created_at).toLocaleString()} · <a className="underline" href={`mailto:${e.from_email}`}>{e.from_email}</a></div><p className="mt-1">{e.message}</p></li>)}</ul>
              </>
            )}
          </>
        )}
        <p className="text-sm text-ink3 mt-8"><Link className="underline" href="/directory">← Back to the directory</Link></p>
      </section>
      <SiteFooter />
    </main>
  );
}

export default function JoinPage() {
  if (!supabaseBrowser()) return <main className="min-h-screen"><SiteHeader /><p className="max-w-3xl mx-auto px-6 text-ink2">Listings need the cloud database, which is not configured in this environment.</p></main>;
  return <AuthGate vault={false}><Join /></AuthGate>;
}
