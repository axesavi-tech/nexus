"use client";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SERVICES, type Pro } from "@/lib/directory";
import { countryByCode } from "@/lib/countries";
import { supabaseBrowser } from "@/lib/supabase";

function Admin() {
  const [pros, setPros] = useState<Pro[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const call = async (method: "GET" | "POST", body?: unknown) => {
    const s = (await supabaseBrowser()!.auth.getSession()).data.session;
    const r = await fetch("/api/admin/pros", { method, headers: { "content-type": "application/json", authorization: `Bearer ${s?.access_token}` }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
    return j;
  };
  const load = () => call("GET").then((j) => setPros(j.pros)).catch((e) => setErr(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);
  const act = async (id: string, action: "approve" | "reject") => { try { await call("POST", { id, action, note: notes[id] }); load(); } catch (e) { setErr((e as Error).message); } };
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-4xl mx-auto px-6">
        <h1 className="serif text-4xl mb-4">Directory review</h1>
        {err && <p className="text-danger mb-4">{err}</p>}
        {pros === null ? <p className="text-ink3">Loading…</p> : pros.length === 0 ? <p className="text-ink3">Nothing to review.</p> : (
          <ul className="space-y-3">
            {pros.map((p) => (
              <li key={p.id} className="card p-4 text-sm">
                <div className="flex flex-wrap gap-2 items-baseline"><b>{p.name}</b>{p.firm && <span>· {p.firm}</span>}<span className="text-ink3">{p.city}, {countryByCode(p.country)?.name}</span><span className="chip ml-auto">{p.status} · {p.tier}</span></div>
                <div className="mt-1"><b>Registration:</b> {p.registration ?? "—"}</div>
                <div className="text-ink2">{p.services.map((s) => SERVICES[s] ?? s).join(", ")}</div>
                <div className="text-ink3 text-xs">Paid until {p.paid_until ? new Date(p.paid_until).toLocaleDateString() : "—"} · {p.email} · {p.phone} · {p.website}</div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <input className="input !w-72 !py-1 text-sm" placeholder="Note (shown to the professional)" value={notes[p.id] ?? ""} onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })} />
                  <button className="btn !py-1" onClick={() => act(p.id, "approve")}>Approve (registration checked)</button>
                  <button className="btn !py-1 !text-danger" onClick={() => act(p.id, "reject")}>Reject</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
export default function AdminDirectoryPage() {
  if (!supabaseBrowser()) return <main className="min-h-screen"><SiteHeader /><p className="max-w-3xl mx-auto px-6 text-ink2">Needs the cloud database.</p></main>;
  return <AuthGate vault={false}><Admin /></AuthGate>;
}
