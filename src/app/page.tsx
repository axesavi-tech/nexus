"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { getRepo, blankProject, type ProjectSummary } from "@/lib/repo";
import { SAMPLES } from "@/lib/samples";
import type { Mode } from "@/lib/schemas";
import Link from "next/link";
import { SiteFooter, TopNav } from "@/components/SiteChrome";
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


  return (
    <main className="min-h-screen glow">
      <TopNav right={status && status.mode !== "live" ? <span className="chip !border-warn !text-warn" title="AI engine">AI: dev templates</span> : null} />

      <section className="max-w-3xl mx-auto px-6 pt-14 pb-10 text-center fade-in">
        <div className="label mb-4">Thought Room</div>
        <h1 className="serif text-5xl md:text-6xl mb-8">What&rsquo;s on your mind?</h1>
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
        <div className="label mb-3">Sample projects — try one of the five reference scenarios</div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {SAMPLES.map((s) => (
            <button key={s.id} disabled={busy} onClick={() => start(s.thought, s.mode)} className="card p-4 text-left hover:border-line2 transition group">
              <div className="text-[11px] text-accent mb-2">Sample {s.id} · {s.label}</div>
              <div className="serif text-[15px] leading-snug text-ink2 group-hover:text-ink">“{s.thought}”</div>
            </button>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-8">
        <div className="flex items-end justify-between mb-3">
          <div><div className="label">From your library</div><h2 className="serif text-2xl">Pick up where you left off</h2></div>
          <Link href="/library" className="btn btn-ghost">Open Library →</Link>
        </div>
        {projects === null ? <p className="text-ink3 text-sm">Loading…</p> : projects.length === 0 ? (
          <p className="text-ink3 text-sm">Nothing here yet — your first thought starts your library. Everything is saved automatically and privately.</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-3">
            {projects.slice(0, 6).map((p) => (
              <Link key={p.id} href={`/p/${p.id}`} className="card p-4 hover:border-line2 transition block">
                <div className="text-[11px] text-ink3 mb-1 uppercase tracking-wider">{p.stage} · {new Date(p.updatedAt).toLocaleDateString("en-IN")}</div>
                <div className="serif text-lg leading-snug mb-1">{p.title}</div>
                <div className="text-sm text-ink3 line-clamp-2">{p.thought}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}

export default function Page() {
  return <AuthGate><Home /></AuthGate>;
}
