"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { getRepo, blankProject, type ProjectSummary } from "@/lib/repo";
import { supabaseBrowser } from "@/lib/supabase";
import { emptyGuide, useNexus } from "@/lib/store";
import { COUNTRIES, countryByCode } from "@/lib/countries";
import { STAGES } from "@/components/journey/Journey";
import { lockAndSignOut } from "@/components/VaultGate";
import type { GuideState } from "@/lib/schemas";

const EXAMPLES = [
  "Premium handloom sarees sold online with video styling consultations",
  "A subscription box of healthy snacks for office teams",
  "An app that helps small clinics manage appointments on WhatsApp",
];
const JOURNEY = ["Your idea", "What it's really about", "Your customers", "Ways to do it", "Test before you spend", "The numbers", "Set up the company", "Delivery plan"];

function Home() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [country, setCountry] = useState("IN");
  const [stage, setStage] = useState<GuideState["stage"]>("idea");
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<{ mode: string; persistence: string } | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getRepo().list().then(setProjects).catch((e) => setErr(e.message));
    fetch("/api/ai/status").then((r) => r.json()).then(setStatus).catch(() => {});
    const region = (navigator.language.split("-")[1] ?? "").toUpperCase();
    if (countryByCode(region)) setCountry(region);
    ta.current?.focus();
  }, []);

  const start = async () => {
    if (!text.trim()) return;
    setBusy(true); setErr(null);
    try {
      const repo = getRepo();
      const id = await repo.create(blankProject(crypto.randomUUID(), text.trim(), "guided"));
      const s = useNexus.getState();
      await s.load(id);
      s.guide(() => ({ ...emptyGuide(country), stage }));
      await s.analyze();
      const after = useNexus.getState();
      if (after.error) throw new Error(after.error);
      after.guide((g) => ({ ...g, step: "understand" }));
      if (useNexus.getState().p) await repo.save(useNexus.getState().p!, null);
      router.push(`/p/${id}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-3"><span className="text-accent text-xl">◉</span><span className="tracking-[.3em] text-sm font-semibold">NEXUS</span></div>
        <div className="flex items-center gap-3 text-xs text-ink3">
          {status?.mode === "dev" && <span className="chip !border-warn !text-warn">Offline templates — AI not connected</span>}
          <a className="btn btn-ghost" href="/pricing">Pricing</a>
          <a className="btn btn-ghost" href="/directory">Find professionals</a>
          {supabaseBrowser() && <span className="chip" title="Your ideas are encrypted in your browser; only your vault passphrase can open them">🔒 Encrypted</span>}
          {supabaseBrowser() && <button className="btn btn-ghost" onClick={lockAndSignOut}>Lock & sign out</button>}
        </div>
      </header>

      <section className="max-w-2xl mx-auto px-6 pt-12 pb-10 fade-in">
        <h1 className="serif text-5xl md:text-6xl leading-[1.05] mb-4 text-center">From an idea to a plan you can act on.</h1>
        <p className="text-ink2 text-lg mb-10 text-center">Your AI guide takes you step by step — understand the problem, choose the right approach, test it cheaply, check the numbers, set up the company in your country, and get a delivery plan.</p>

        <div className="card p-5 shadow-xl shadow-black/5">
          <label htmlFor="nx-idea" className="text-sm text-ink2">What do you want to build?</label>
          <textarea id="nx-idea" ref={ta} value={text} onChange={(e) => setText(e.target.value)} rows={3}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start(); }}
            placeholder="Describe your idea in a sentence or two…" className="w-full resize-none bg-transparent py-2 text-xl outline-none placeholder:text-ink3 serif" />
          <div className="flex flex-wrap gap-2 mb-4">
            {EXAMPLES.map((x) => <button key={x} className="chip hover:!text-ink !text-[11.5px]" onClick={() => { setText(x); ta.current?.focus(); }}>{x}</button>)}
          </div>
          <div className="grid sm:grid-cols-2 gap-4 border-t border-line pt-4">
            <label className="block"><span className="text-sm text-ink2">Where will you set up?</span>
              <select className="input mt-1" value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-sm text-ink2">How far along are you?</span>
              <select className="input mt-1" value={stage} onChange={(e) => setStage(e.target.value as GuideState["stage"])}>
                {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <button className="btn btn-primary w-full justify-center !py-3 text-base mt-5" disabled={busy || !text.trim()} onClick={start}>
            {busy ? <span className="pulse">Understanding your idea…</span> : <>Start my plan <span aria-hidden>→</span></>}
          </button>
          {err && <p className="text-danger text-sm mt-3" role="alert">{err}</p>}
        </div>

        <ol className="flex flex-wrap justify-center gap-x-2 gap-y-1 mt-6 text-xs text-ink3">
          {JOURNEY.map((j, i) => <li key={j}>{i > 0 && <span className="mr-2">→</span>}{j}</li>)}
        </ol>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-24">
        <h2 className="label mb-3">Your plans</h2>
        {projects === null ? <p className="text-ink3 text-sm">Loading…</p> : projects.length === 0 ? (
          <p className="text-ink3 text-sm">Nothing yet — your first idea starts here.</p>
        ) : (
          <ul className="divide-y divide-line card">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center gap-4 px-4 py-3">
                <button className="text-left flex-1 min-w-0" onClick={() => router.push(`/p/${p.id}`)}>
                  <div className="font-medium truncate">{p.title}</div>
                  <div className="text-xs text-ink3 truncate">{p.thought}</div>
                </button>
                <span className="text-xs text-ink3 whitespace-nowrap">{new Date(p.updatedAt).toLocaleDateString()}</span>
                <button className="text-xs text-ink3 hover:text-danger" onClick={async () => {
                  if (!confirm(`Delete “${p.title}” permanently?`)) return;
                  await getRepo().remove(p.id); setProjects((x) => (x ?? []).filter((y) => y.id !== p.id));
                }}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default function Page() {
  return <AuthGate><Home /></AuthGate>;
}
