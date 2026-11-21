"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";
import { ProCard } from "@/components/site/ProCard";
import { COUNTRIES, countryByCode } from "@/lib/countries";
import { SERVICES, SERVICE_IDS, livePros, type Pro, type Service } from "@/lib/directory";

export default function DirectoryPage() {
  const [country, setCountry] = useState("IN");
  const [service, setService] = useState<Service | "">("");
  const [q, setQ] = useState("");
  const [pros, setPros] = useState<Pro[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    const c = (u.get("country") ?? (navigator.language.split("-")[1] ?? "IN")).toUpperCase();
    if (countryByCode(c)) setCountry(c);
    const s = u.get("service");
    if (s && s in SERVICES) setService(s as Service);
  }, []);
  useEffect(() => { setPros(null); livePros(country).then((r) => { setPros(r.pros); setErr(r.error ?? null); }); }, [country]);

  const shown = useMemo(() => (pros ?? []).filter((p) => (!service || p.services.includes(service)) && (!q || `${p.name} ${p.firm ?? ""} ${p.city ?? ""} ${p.about ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [pros, service, q]);

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-4xl mx-auto px-6 pt-6">
        <h1 className="serif text-5xl mb-2">Professionals who set up companies</h1>
        <p className="text-ink2 mb-6">Chartered accountants, company secretaries, lawyers and specialists who help founders register, stay compliant and get banking in place. Listings are paid and registration-checked; paid placement is always labelled.</p>
        <div className="card p-4 grid sm:grid-cols-3 gap-3 mb-6">
          <label className="text-sm">Country<select className="input mt-1" value={country} onChange={(e) => setCountry(e.target.value)}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}</select></label>
          <label className="text-sm">Service<select className="input mt-1" value={service} onChange={(e) => setService(e.target.value as Service | "")}><option value="">All services</option>{SERVICE_IDS.map((s) => <option key={s} value={s}>{SERVICES[s]}</option>)}</select></label>
          <label className="text-sm">Search<input className="input mt-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, firm or city" /></label>
        </div>
        {pros === null ? <p className="text-ink3">Loading…</p> : err ? <p className="text-ink3">{err}</p> : shown.length === 0 ? (
          <div className="card p-6 text-center"><p className="text-ink2 mb-3">No listed professionals for this search in {countryByCode(country)?.name} yet.</p><Link className="btn" href="/directory/join">Are you one? List your practice</Link></div>
        ) : <div className="space-y-3">{shown.map((p) => <ProCard key={p.id} pro={p} />)}</div>}
        <div className="card p-5 mt-10 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[220px]"><div className="font-semibold">Help founders set up their companies</div><div className="text-sm text-ink2">Get listed where founders plan their company setup — from ₹2,999 a year.</div></div>
          <Link className="btn btn-primary" href="/directory/join">List your practice</Link>
        </div>
        <p className="text-xs text-ink3 mt-6">NEXUS checks registration details before a listing goes live but does not endorse any professional. Agree scope and fees directly with them.</p>
      </section>
      <SiteFooter />
    </main>
  );
}
