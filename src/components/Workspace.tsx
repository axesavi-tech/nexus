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
import { EvidenceLab } from "./views/EvidenceLab";
import { BusinessCase } from "./views/BusinessCase";
import { ConsultingBoard } from "./views/ConsultingBoard";
import { SolutionStudio } from "./views/SolutionStudio";
import { ExecutionCockpit } from "./views/ExecutionCockpit";

const VIEWS = [
  { id: "thought", name: "Idea Brief", glyph: "◉", q: "What is this really about?", group: "Discover" },
  { id: "canvas", name: "Knowledge Map", glyph: "✳", q: "How does it all connect?", group: "Discover" },
  { id: "discovery", name: "Problem Discovery", glyph: "☺", q: "Who has the problem, and is it real?", group: "Discover" },
  { id: "ideation", name: "Ideation Studio", glyph: "❖", q: "How many ways could we solve it?", group: "Create" },
  { id: "ideas", name: "Concept Portfolio", glyph: "✺", q: "Which concepts are worth pursuing?", group: "Create" },
  { id: "evidence", name: "Evidence Lab", glyph: "✓", q: "What supports or challenges it?", group: "Decide" },
  { id: "board", name: "Decision Intelligence", glyph: "⚑", q: "Is it worth pursuing — can you prove it?", group: "Decide" },
  { id: "business", name: "Business Case", glyph: "₹", q: "Does the investment make sense?", group: "Decide" },
  { id: "validation", name: "Validation Lab", glyph: "⚗", q: "What must be true, and how do we test it?", group: "Decide" },
  { id: "solution", name: "Solution Studio", glyph: "◆", q: "What exactly are we building?", group: "Deliver" },
  { id: "execution", name: "Delivery Planner", glyph: "▶", q: "How do we make it happen?", group: "Deliver" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"] | "design";

/** Lifecycle completeness, derived from the data itself (not a stored label). */
function lifecycle(p: ProjectState): { name: string; done: boolean }[] {
  const os = p.os;
  return [
    { name: "Thought", done: !!p.interpretation },
    { name: "Discovery", done: !!p.design?.empathy || (os?.evidence ?? []).some((e) => e.links.some((l) => l.targetKind === "problem")) },
    { name: "Problem definition", done: (p.design?.hmws.length ?? 0) > 0 },
    { name: "Ideation", done: !!p.ideas },
    { name: "Evaluation", done: !!p.evaluation },
    { name: "Validation", done: (p.design?.tests ?? []).some((t) => Object.values(t.results).some((r) => r.status === "validated" || r.status === "invalidated")) || (os?.evidence ?? []).some((e) => e.links.some((l) => l.targetKind === "concept")) },
    { name: "Investment decision", done: (os?.approvals ?? []).some((a) => a.action === "approve") },
    { name: "Solution design", done: !!p.blueprint },
    { name: "Delivery planning", done: !!p.roadmap },
    { name: "Execution", done: p.tasks.some((t) => t.status === "done") },
    { name: "Value realization", done: false },
  ];
}

export function Workspace({ id }: { id: string }) {
  const { p, load, busy, error, clearError, undo, redo, past, future, saveState } = useNexus();
  const [view, setViewRaw] = useState<ViewId>("canvas");
  const setView = (v: ViewId) => setViewRaw(v === "design" ? "ideation" : v);
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
      if (e.altKey && /^[1-9]$/.test(e.key)) setViewRaw(VIEWS[Number(e.key) - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  if (!p) return <div className="h-screen grid place-items-center">{error ? <div className="text-center"><p className="text-danger mb-4">{error}</p><Link className="btn" href="/">Back</Link></div> : <Spinner label="Opening project…" />}</div>;

  const stages = lifecycle(p);
  const nextIdx = stages.findIndex((s) => !s.done);
  const toggleTheme = () => {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t); document.documentElement.dataset.theme = t;
    try { localStorage.setItem("nexus:theme", t); } catch {}
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-line bg-bg2">
        <Link href="/" className="flex items-center gap-2 pr-3 border-r border-line" title="Knowledge Vault"><span className="text-accent">◉</span><span className="leading-tight"><span className="tracking-[.3em] text-xs font-semibold block">NEXUS</span><span className="text-[9.5px] text-ink3 tracking-wider block">IDEA → OUTCOME OS</span></span></Link>
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
            <div key={v.id}>
              {(i === 0 || VIEWS[i - 1].group !== v.group) && <div className="label px-5 pt-3 pb-1 !text-[10px]">{v.group}</div>}
              <button onClick={() => setView(v.id)} title={`${v.q}${i < 9 ? ` (Alt+${i + 1})` : ""}`}
                className={`mx-2 mb-0.5 px-3 py-1.5 rounded-lg text-left text-sm flex items-center gap-3 transition w-[calc(100%-1rem)] ${view === v.id ? "bg-panel2 text-ink" : "text-ink2 hover:bg-panel hover:text-ink"}`}>
                <span className="w-4 text-center" style={{ color: view === v.id ? "var(--accent)" : undefined }} aria-hidden>{v.glyph}</span>{v.name}
              </button>
            </div>
          ))}
          <div className="mt-6 px-5">
            <div className="label mb-2">Lifecycle</div>
            <ol className="space-y-1">
              {stages.map((s, i) => (
                <li key={s.name} className="flex items-center gap-2 text-[11.5px]" style={{ color: s.done ? "var(--ink-2)" : i === nextIdx ? "var(--ink)" : "var(--ink-3)" }}>
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: s.done ? "var(--accent-2)" : i === nextIdx ? "var(--accent)" : "var(--line-2)" }} />
                  {s.name}{s.done && <span className="sr-only"> (done)</span>}{i === nextIdx && <span className="sr-only"> (next)</span>}
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
          {view === "discovery" && <DesignStudio key="d" initial="empathize" go={setView} />}
          {view === "ideation" && <DesignStudio key="i" initial="ideate" go={setView} />}
          {view === "validation" && <DesignStudio key="v" initial="test" go={setView} />}
          {view === "evidence" && <EvidenceLab go={setView} />}
          {view === "business" && <BusinessCase go={setView} />}
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
