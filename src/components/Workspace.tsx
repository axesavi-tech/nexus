"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useNexus } from "@/lib/store";
import { getRepo, type VersionSummary } from "@/lib/repo";
import type { ProjectState } from "@/lib/schemas";
import { download, toMarkdown } from "@/lib/export";
import { Spinner } from "./ui";
import { ThoughtView } from "./views/ThoughtView";
import { CanvasView } from "./views/CanvasView";
import { IdeaLab } from "./views/IdeaLab";
import { DesignStudio } from "./views/DesignStudio";
import { ConsultingBoard } from "./views/ConsultingBoard";
import { SolutionStudio } from "./views/SolutionStudio";
import { ExecutionCockpit } from "./views/ExecutionCockpit";

const VIEWS = [
  { id: "thought", name: "Thought Room", glyph: "◉", q: "What is this really about?" },
  { id: "canvas", name: "Infinity Canvas", glyph: "✳", q: "What else is possible?" },
  { id: "design", name: "Design Studio", glyph: "❖", q: "Who is it for, and how many ways could we solve it?" },
  { id: "ideas", name: "Idea Lab", glyph: "✺", q: "Which concepts are worth pursuing?" },
  { id: "board", name: "Consulting Board", glyph: "▦", q: "What really matters?" },
  { id: "solution", name: "Solution Studio", glyph: "◆", q: "What should we do?" },
  { id: "execution", name: "Execution Cockpit", glyph: "▶", q: "How do we make it happen?" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

const STAGES = ["thought", "discovery", "ideation", "evaluation", "solution", "implementation"];

export function Workspace({ id }: { id: string }) {
  const { p, load, busy, error, clearError, undo, redo, past, future, saveState } = useNexus();
  const [view, setView] = useState<ViewId>("canvas");
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const lastSaved = useRef<ProjectState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cur = useNexus.getState().p;
    if (cur?.id === id) { lastSaved.current = cur; return; }
    load(id).then(() => { lastSaved.current = useNexus.getState().p; });
  }, [id, load]);

  useEffect(() => { setTheme((document.documentElement.dataset.theme as "dark" | "light") ?? "dark"); }, []);

  // Debounced autosave of the whole aggregate (diffed against the last saved state).
  useEffect(() => {
    if (!p || p === lastSaved.current) return;
    if (timer.current) clearTimeout(timer.current);
    useNexus.setState({ saveState: "saving" });
    timer.current = setTimeout(async () => {
      try {
        await getRepo().save(p, lastSaved.current);
        lastSaved.current = p;
        useNexus.setState({ saveState: "saved" });
      } catch (e) {
        useNexus.setState({ saveState: "error", error: `Save failed: ${(e as Error).message}` });
      }
    }, 700);
  }, [p]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.closest("input,textarea,[contenteditable=true]")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      if (e.altKey && /^[1-7]$/.test(e.key)) setView(VIEWS[Number(e.key) - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  if (!p) return <div className="h-screen grid place-items-center">{error ? <div className="text-center"><p className="text-danger mb-4">{error}</p><Link className="btn" href="/">Back</Link></div> : <Spinner label="Opening project…" />}</div>;

  const stageIdx = STAGES.indexOf(p.stage);
  const toggleTheme = () => {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t); document.documentElement.dataset.theme = t;
    try { localStorage.setItem("nexus:theme", t); } catch {}
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-line bg-bg2">
        <Link href="/" className="flex items-center gap-2 pr-3 border-r border-line" title="Knowledge Vault"><span className="text-accent">◉</span><span className="tracking-[.3em] text-xs font-semibold">NEXUS</span></Link>
        <input
          className="bg-transparent serif text-lg flex-1 min-w-0 outline-none focus:bg-panel rounded px-2"
          value={p.title}
          onChange={(e) => useNexus.getState().setQuiet((c) => ({ ...c, title: e.target.value }))}
          aria-label="Project title"
        />
        {p.aiMode === "dev" && <span className="chip !border-warn !text-warn" title="No AI key configured: outputs come from deterministic templates, not AI analysis.">Dev templates — not AI</span>}
        <span className="text-xs text-ink3 w-16 text-right" aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "⚠ Not saved" : ""}</span>
        <button className="btn btn-ghost !px-2" onClick={undo} disabled={!past.length} title="Undo (⌘Z)">↶</button>
        <button className="btn btn-ghost !px-2" onClick={redo} disabled={!future.length} title="Redo (⌘⇧Z)">↷</button>
        <button className="btn btn-ghost" onClick={async () => { setVersions(versions ? null : await getRepo().versions(p.id)); }}>History</button>
        <button className="btn btn-ghost" onClick={() => download(`${slug(p.title)}.md`, toMarkdown(p))}>Export</button>
        <button className="btn btn-ghost !px-2" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">{theme === "dark" ? "☀" : "☾"}</button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left nav */}
        <nav className="w-56 shrink-0 border-r border-line bg-bg2 flex flex-col py-3" aria-label="Workspace">
          {VIEWS.map((v, i) => (
            <button key={v.id} onClick={() => setView(v.id)} title={`${v.q} (Alt+${i + 1})`}
              className={`mx-2 mb-0.5 px-3 py-2 rounded-lg text-left text-sm flex items-center gap-3 transition ${view === v.id ? "bg-panel2 text-ink" : "text-ink2 hover:bg-panel hover:text-ink"}`}>
              <span className="w-4 text-center" style={{ color: view === v.id ? "var(--accent)" : undefined }} aria-hidden>{v.glyph}</span>{v.name}
            </button>
          ))}
          <div className="mt-6 px-5">
            <div className="label mb-2">Journey</div>
            <ol className="space-y-1.5">
              {STAGES.map((s, i) => (
                <li key={s} className="flex items-center gap-2 text-xs capitalize" style={{ color: i <= stageIdx ? "var(--ink-2)" : "var(--ink-3)" }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: i < stageIdx ? "var(--accent-2)" : i === stageIdx ? "var(--accent)" : "var(--line-2)" }} />
                  {s}{i === stageIdx && <span className="sr-only"> (current)</span>}
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-ink3 mt-3 leading-relaxed">Move freely — every stage can be revisited.</p>
          </div>
          <div className="mt-auto px-5 text-[11px] text-ink3 space-y-1">
            <div>{p.nodes.length} nodes · {p.edges.length} links</div>
            <div>{p.tasks.length} tasks</div>
            <Link href="/" className="hover:text-ink block pt-2">← Knowledge Vault</Link>
          </div>
        </nav>

        <main className="flex-1 min-w-0 relative">
          {view === "thought" && <ThoughtView go={setView} />}
          {view === "canvas" && <CanvasView go={setView} />}
          {view === "design" && <DesignStudio go={setView} />}
          {view === "ideas" && <IdeaLab go={setView} />}
          {view === "board" && <ConsultingBoard go={setView} />}
          {view === "solution" && <SolutionStudio go={setView} />}
          {view === "execution" && <ExecutionCockpit />}

          {busy && <div className="absolute top-3 left-1/2 -translate-x-1/2 card px-4 py-2 z-50 shadow-xl" role="status"><Spinner label={busy} /></div>}
          {error && (
            <div className="absolute top-3 right-3 card !border-danger px-4 py-3 z-50 max-w-md shadow-xl" role="alert">
              <div className="flex gap-3"><span className="text-danger text-sm flex-1">{error}</span><button className="text-ink3" onClick={clearError} aria-label="Dismiss">✕</button></div>
            </div>
          )}
          {versions && (
            <div className="absolute right-3 top-3 w-80 card p-4 z-40 shadow-xl max-h-[70vh] overflow-auto scroll-thin">
              <div className="flex justify-between items-center mb-3"><h3 className="serif text-lg">Version history</h3><button className="text-ink3" onClick={() => setVersions(null)} aria-label="Close">✕</button></div>
              <button className="btn w-full justify-center mb-3" onClick={async () => { await useNexus.getState().saveVersion(`Manual save ${new Date().toLocaleString()}`); setVersions(await getRepo().versions(p.id)); }}>Save current as version</button>
              {versions.length === 0 && <p className="text-sm text-ink3">No versions yet. Snapshots are taken automatically before each AI change.</p>}
              <ul className="space-y-2">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 text-sm">
                    <div><div>{v.label}</div><div className="text-[11px] text-ink3">{new Date(v.createdAt).toLocaleString()}</div></div>
                    <button className="btn !py-1 !px-2 text-xs" onClick={async () => {
                      const snap = await getRepo().restore(v.id);
                      if (snap && confirm("Restore this version? Your current state stays in undo history.")) { useNexus.getState().set(() => ({ ...snap, id: p.id }), "version.restored"); setVersions(null); }
                    }}>Restore</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "nexus";
export type { ViewId };
