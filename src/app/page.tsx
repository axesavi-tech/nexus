"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { getRepo, blankProject, type ProjectSummary } from "@/lib/repo";
import { SAMPLES } from "@/lib/samples";
import type { Mode } from "@/lib/schemas";
import { supabaseBrowser } from "@/lib/supabase";
import { useNexus } from "@/lib/store";

const MODES: { id: Mode; name: string; desc: string }[] = [
  { id: "free", name: "Free Exploration", desc: "Minimal structure, maximum creative freedom" },
  { id: "guided", name: "Guided Thinking", desc: "A few well-chosen questions as you go" },
  { id: "strategic", name: "Strategic Deep Dive", desc: "Frameworks, rigorous analysis, evaluation" },
];

function Home() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("guided");
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<{ mode: string; persistence: string } | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getRepo().list().then(setProjects).catch((e) => setErr(e.message));
    fetch("/api/ai/status").then((r) => r.json()).then(setStatus).catch(() => {});
    ta.current?.focus();
  }, []);

  const start = async (thought: string, m: Mode) => {
    if (!thought.trim()) return;
    setBusy(true); setErr(null);
    try {
      const repo = getRepo();
      const p = blankProject(crypto.randomUUID(), thought.trim(), m);
      const id = await repo.create(p);
      await useNexus.getState().load(id);
      await useNexus.getState().analyze();
      const s = useNexus.getState();
      if (s.error) throw new Error(s.error);
      if (s.p) await repo.save(s.p, null);
      router.push(`/p/${id}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  const filtered = (projects ?? []).filter((p) => !q || `${p.title} ${p.thought}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <main className="min-h-screen glow">
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3"><span className="text-accent text-xl">◉</span><span className="tracking-[.3em] text-sm font-semibold">NEXUS</span></div>
        <div className="flex items-center gap-3 text-xs text-ink3">
          {status && <span className="chip" title="AI engine">{status.mode === "live" ? "AI: live" : "AI: dev templates"}</span>}
          {status && <span className="chip" title="Where projects are saved">{status.persistence === "supabase" ? "Saved to cloud" : "Saved in this browser"}</span>}
          {supabaseBrowser() && <button className="btn btn-ghost" onClick={() => supabaseBrowser()!.auth.signOut()}>Sign out</button>}
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 pt-14 pb-10 text-center fade-in">
        <div className="label mb-4">Idea → Outcome OS</div>
        <h1 className="serif text-5xl md:text-6xl mb-4">Is this idea worth pursuing?</h1>
        <p className="text-ink2 mb-8 max-w-xl mx-auto">From a thought to a defensible investment decision. From an approved idea to an executable delivery plan — with the evidence to prove it.</p>
        <div className="card p-3 text-left shadow-2xl shadow-black/30">
          <textarea
            ref={ta}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start(text, mode); }}
            placeholder="A single word, a question, a half-formed idea, or a detailed challenge…"
            rows={4}
            className="w-full resize-none bg-transparent p-3 text-lg outline-none placeholder:text-ink3 serif"
            aria-label="Your thought"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-1">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Entry mode">
              {MODES.map((m) => (
                <button key={m.id} role="radio" aria-checked={mode === m.id} title={m.desc} onClick={() => setMode(m.id)}
                  className={`chip transition ${mode === m.id ? "!border-accent !text-accent" : "hover:!text-ink"}`}>{m.name}</button>
              ))}
            </div>
            <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => start(text, mode)}>
              {busy ? <span className="pulse">Understanding…</span> : <>Begin <span aria-hidden>→</span></>}
            </button>
          </div>
        </div>
        <p className="text-xs text-ink3 mt-3">{MODES.find((m) => m.id === mode)!.desc}. You can switch modes later without losing work. ⌘/Ctrl + Enter to begin.</p>
        {err && <p className="text-danger text-sm mt-3" role="alert">{err}</p>}
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-10">
        <div className="label mb-3">Reference scenarios — the AI analyses them live; no customer research or market data is pre-filled</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SAMPLES.map((s) => (
            <button key={s.id} disabled={busy} onClick={() => start(s.thought, s.mode)} className="card p-4 text-left hover:border-line2 transition group">
              <div className="text-[11px] text-accent mb-2">{s.id === "R" ? s.label : `Sample ${s.id} · ${s.label}`}</div>
              <div className="serif text-[15px] leading-snug text-ink2 group-hover:text-ink">“{s.thought}”</div>
            </button>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="flex items-end justify-between mb-3">
          <div><div className="label">Knowledge Vault</div><h2 className="serif text-2xl">Your projects</h2></div>
          <input className="input !w-64" placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" />
        </div>
        {projects === null ? <p className="text-ink3 text-sm">Loading…</p> : filtered.length === 0 ? (
          <p className="text-ink3 text-sm">{projects.length ? "No matches." : "Nothing here yet — your first thought starts the vault."}</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-3">
            {filtered.map((p) => (
              <div key={p.id} className="card p-4 hover:border-line2 transition flex flex-col">
                <button className="text-left flex-1" onClick={() => router.push(`/p/${p.id}`)}>
                  <div className="text-[11px] text-ink3 mb-1 uppercase tracking-wider">{p.stage} · {new Date(p.updatedAt).toLocaleDateString()}</div>
                  <div className="serif text-lg leading-snug mb-1">{p.title}</div>
                  <div className="text-sm text-ink3 line-clamp-2">{p.thought}</div>
                </button>
                <button className="text-xs text-ink3 hover:text-danger self-end mt-2" onClick={async () => {
                  if (!confirm(`Delete “${p.title}” permanently?`)) return;
                  await getRepo().remove(p.id); setProjects((x) => (x ?? []).filter((y) => y.id !== p.id));
                }}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default function Page() {
  return <AuthGate><Home /></AuthGate>;
}
