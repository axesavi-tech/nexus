"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { SiteFooter, TopNav, useCredits } from "@/components/SiteChrome";
import { ExportDialog } from "@/components/ExportDialog";
import { getRepo } from "@/lib/repo";
import { supabaseBrowser } from "@/lib/supabase";
import type { ProjectState } from "@/lib/schemas";

const STAGES = ["Thought", "Map", "Options", "Evaluated", "Decided", "Blueprint", "Plan"] as const;
interface Item { id: string; title: string; thought: string; updatedAt: string; createdAt: string; nodes: number; tasks: number; done: number; kinds: Set<string>; hasInterp: boolean }

function progress(i: Item): number {
  const flags = [i.hasInterp, i.nodes > 1, i.kinds.has("ideas"), i.kinds.has("evaluation"), i.kinds.has("decision"), i.kinds.has("blueprint"), i.kinds.has("roadmap")];
  let n = 0; for (const f of flags) { if (f) n++; else break; }
  return Math.max(1, n);
}

async function loadItems(): Promise<Item[]> {
  const sb = supabaseBrowser();
  if (sb) {
    const [p, a, n, t] = await Promise.all([
      sb.from("projects").select("id,title,thought,interpretation,created_at,updated_at").order("updated_at", { ascending: false }).limit(500),
      sb.from("artifacts").select("project_id,kind"),
      sb.from("nodes").select("project_id"),
      sb.from("tasks").select("project_id,status"),
    ]);
    if (p.error) throw new Error(p.error.message);
    const kinds = new Map<string, Set<string>>(), nodes = new Map<string, number>(), tasks = new Map<string, [number, number]>();
    for (const r of a.data ?? []) (kinds.get(r.project_id) ?? kinds.set(r.project_id, new Set()).get(r.project_id)!).add(r.kind);
    for (const r of n.data ?? []) nodes.set(r.project_id, (nodes.get(r.project_id) ?? 0) + 1);
    for (const r of t.data ?? []) { const c = tasks.get(r.project_id) ?? [0, 0]; c[0]++; if (r.status === "done") c[1]++; tasks.set(r.project_id, c); }
    return (p.data ?? []).map((r) => ({ id: r.id, title: r.title, thought: r.thought, createdAt: r.created_at, updatedAt: r.updated_at, hasInterp: Boolean(r.interpretation),
      nodes: nodes.get(r.id) ?? 0, tasks: tasks.get(r.id)?.[0] ?? 0, done: tasks.get(r.id)?.[1] ?? 0, kinds: kinds.get(r.id) ?? new Set() }));
  }
  const repo = getRepo();
  const list = await repo.list();
  const full = await Promise.all(list.map((s) => repo.load(s.id)));
  return full.filter(Boolean).map((p) => {
    const x = p as ProjectState;
    const kinds = new Set<string>(); if (x.ideas) kinds.add("ideas"); if (x.evaluation) kinds.add("evaluation"); if (x.decision) kinds.add("decision"); if (x.blueprint) kinds.add("blueprint"); if (x.roadmap) kinds.add("roadmap");
    return { id: x.id, title: x.title, thought: x.thought, createdAt: x.createdAt, updatedAt: x.updatedAt, hasInterp: Boolean(x.interpretation), nodes: x.nodes.length, tasks: x.tasks.length, done: x.tasks.filter((t) => t.status === "done").length, kinds };
  });
}

function Library() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<number | null>(null);
  const [sort, setSort] = useState<"recent" | "name" | "progress">("recent");
  const [exporting, setExporting] = useState<ProjectState | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const credits = useCredits();

  useEffect(() => { loadItems().then(setItems).catch((e) => setErr(e.message)); }, []);

  const view = useMemo(() => {
    let xs = (items ?? []).filter((i) => !q || `${i.title} ${i.thought}`.toLowerCase().includes(q.toLowerCase()));
    if (stage !== null) xs = xs.filter((i) => progress(i) - 1 === stage);
    if (sort === "name") xs = [...xs].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "progress") xs = [...xs].sort((a, b) => progress(b) - progress(a));
    return xs;
  }, [items, q, stage, sort]);

  const totals = useMemo(() => ({
    projects: items?.length ?? 0, ideas: (items ?? []).reduce((s, i) => s + i.nodes, 0),
    plans: (items ?? []).filter((i) => i.kinds.has("roadmap")).length, tasks: (items ?? []).reduce((s, i) => s + i.tasks, 0),
  }), [items]);

  const openExport = async (id: string) => {
    setOpening(id);
    try { const p = await getRepo().load(id); if (p) setExporting(p); } finally { setOpening(null); }
  };
  const remove = async (i: Item) => {
    if (!confirm(`Delete “${i.title}” permanently? This removes its map, documents, tasks and history.`)) return;
    await getRepo().remove(i.id);
    setItems((xs) => (xs ?? []).filter((x) => x.id !== i.id));
  };

  return (
    <main className="min-h-screen glow">
      <TopNav />
      <section className="max-w-6xl mx-auto px-6 md:px-8 pt-8 pb-6 fade-in">
        <div className="flex flex-wrap items-end justify-between gap-6 mb-8">
          <div><div className="label mb-2">Your private workspace</div><h1 className="serif text-5xl">Library</h1>
            <p className="text-ink3 mt-2 max-w-xl">Everything you have thought through, decided and planned — saved automatically, visible only to you.</p></div>
          <Link href="/" className="btn btn-primary">New thought <span aria-hidden>→</span></Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {[["Projects", totals.projects], ["Ideas mapped", totals.ideas], ["Delivery plans", totals.plans], ["Tasks", totals.tasks], ["Credits", credits ?? "—"]].map(([l, v]) => (
            <div key={l as string} className="card px-4 py-3"><div className="label">{l}</div><div className="serif text-3xl mt-1">{typeof v === "number" ? v.toLocaleString("en-IN") : v}</div></div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <input className="input !w-72" placeholder="Search your library…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          <div className="flex flex-wrap gap-1.5">
            <button className={`chip ${stage === null ? "!border-accent !text-accent" : ""}`} onClick={() => setStage(null)}>All</button>
            {STAGES.map((s, i) => <button key={s} className={`chip ${stage === i ? "!border-accent !text-accent" : ""}`} onClick={() => setStage(stage === i ? null : i)}>{s}</button>)}
          </div>
          <select className="input !w-auto ml-auto" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
            <option value="recent">Most recent</option><option value="name">Name</option><option value="progress">Furthest along</option>
          </select>
        </div>
        {err && <p className="text-danger text-sm" role="alert">{err}</p>}
        {items === null && !err ? <p className="text-ink3">Loading your library…</p> : view.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="serif text-2xl mb-2">{items?.length ? "Nothing matches." : "Your library is empty."}</p>
            <p className="text-ink3 mb-5">{items?.length ? "Try another search or stage." : "Every thought you start is kept here, privately."}</p>
            {!items?.length && <Link href="/" className="btn btn-primary">Start with a thought</Link>}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {view.map((i) => {
              const pr = progress(i);
              return (
                <article key={i.id} className="card p-5 flex flex-col hover:border-line2 transition">
                  <div className="flex items-center justify-between text-[11px] text-ink3 uppercase tracking-wider mb-2">
                    <span className="text-accent">{STAGES[pr - 1]}</span><span>{new Date(i.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                  <Link href={`/p/${i.id}`} className="block flex-1 group">
                    <h2 className="serif text-xl leading-snug mb-1.5 group-hover:text-accent transition">{i.title}</h2>
                    <p className="text-sm text-ink3 line-clamp-2">{i.thought}</p>
                  </Link>
                  <div className="flex gap-1 mt-4" aria-label={`${pr} of ${STAGES.length} stages`} title={STAGES.slice(0, pr).join(" → ")}>
                    {STAGES.map((s, k) => <span key={s} className={`h-1 flex-1 rounded-full ${k < pr ? "bg-accent" : "bg-line"}`} />)}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-ink3 mt-3">
                    <span>{i.nodes} ideas</span>{i.tasks > 0 && <span>{i.done}/{i.tasks} tasks done</span>}
                  </div>
                  <div className="flex gap-2 mt-4 pt-4 border-t border-line">
                    <Link href={`/p/${i.id}`} className="btn flex-1 justify-center">Open</Link>
                    <button className="btn flex-1 justify-center" disabled={opening === i.id} onClick={() => openExport(i.id)}>{opening === i.id ? "…" : "Export"}</button>
                    <button className="btn btn-ghost !px-3 hover:!text-danger" onClick={() => remove(i)} aria-label={`Delete ${i.title}`} title="Delete">✕</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {exporting && <ExportDialog project={exporting} onClose={() => setExporting(null)} />}
      <SiteFooter />
    </main>
  );
}

export default function Page() { return <AuthGate><Library /></AuthGate>; }
