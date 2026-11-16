"use client";
import { useMemo, useState } from "react";
import { useNexus, traceToRoot } from "@/lib/store";
import { schedule, makeNode, nid, now, placeNew, topoOrder } from "@/lib/graph";
import { download, toMarkdown } from "@/lib/export";
import { APPROACHES, type Approach, type Task } from "@/lib/schemas";
import { Empty, Section } from "../ui";
import { slug } from "../Workspace";

const COLS: { id: Task["status"]; name: string }[] = [
  { id: "todo", name: "To do" }, { id: "doing", name: "In progress" }, { id: "blocked", name: "Blocked" }, { id: "done", name: "Done" },
];
const PRI: Record<Task["priority"], string> = { critical: "var(--danger)", high: "var(--warn)", medium: "var(--ink-3)", low: "var(--line-2)" };

export function ExecutionCockpit() {
  const { p, set, planRoadmap, busy } = useNexus();
  const [approach, setApproach] = useState<Approach>("hybrid");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [team, setTeam] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const sch = useMemo(() => (p?.roadmap ? schedule({ ...p.roadmap, tasks: p.roadmap.tasks.filter((t) => p.tasks.some((x) => x.id === t.id)) }, start) : null), [p?.roadmap, p?.tasks, start]);
  if (!p) return null;

  const updTask = (id: string, patch: Partial<Task>, label = "task.updated") => set((c) => ({ ...c, tasks: c.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }), label);
  const blockedBy = (t: Task) => t.dependsOn.filter((d) => p.tasks.find((x) => x.id === d)?.status !== "done");
  const cyclic = p.tasks.length > 0 && topoOrder(p.tasks) === null;
  const done = p.tasks.filter((t) => t.status === "done").length;

  if (!p.blueprint && p.tasks.length === 0) return <Empty title="Nothing to execute yet" body="Choose a direction and generate its blueprint in the Solution Studio. You can also turn any node on the canvas into a task." />;

  const generator = (
    <div className="card p-5 grid md:grid-cols-[auto_auto_1fr_auto] gap-3 items-end">
      <label className="text-sm">Delivery approach
        <select className="input mt-1 capitalize" value={approach} onChange={(e) => setApproach(e.target.value as Approach)}>{APPROACHES.map((a) => <option key={a} value={a}>{a}</option>)}</select>
      </label>
      <label className="text-sm">Start date<input type="date" className="input mt-1" value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <label className="text-sm">Team & capacity (optional)<input className="input mt-1" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="e.g. 2 developers part-time, founder full-time" /></label>
      <button className="btn btn-primary" disabled={!!busy || !p.blueprint} onClick={() => { if (!p.roadmap || confirm("Replace the current roadmap and tasks? The current plan stays in version history.")) planRoadmap(approach, start, team || undefined); }}>{p.roadmap ? "Regenerate plan" : "Generate delivery plan"}</button>
    </div>
  );

  const r = p.roadmap;
  const assumptions = p.nodes.filter((n) => n.type === "assumption");

  return (
    <div className="h-full overflow-auto scroll-thin">
      <div className="max-w-6xl mx-auto px-8 py-10 fade-in">
        <div className="flex items-end justify-between mb-6 gap-4">
          <div><div className="label mb-1">Execution Cockpit</div><h1 className="serif text-3xl">How do we make it happen?</h1></div>
          {p.tasks.length > 0 && <div className="flex items-center gap-4">
            <div className="text-right"><div className="serif text-2xl tabular-nums">{done}/{p.tasks.length}</div><div className="text-xs text-ink3">tasks done</div></div>
            <button className="btn" onClick={() => download(`${slug(p.title)}-roadmap.md`, toMarkdown(p, ["decision", "roadmap"]))}>Export plan</button>
          </div>}
        </div>
        <div className="mb-8">{generator}</div>
        {cyclic && <p className="text-danger text-sm mb-4">⚠ Task dependencies contain a cycle — review the “depends on” fields.</p>}

        {r && (
          <>
            <div className="grid md:grid-cols-2 gap-6">
              <Section title="MVP definition" kicker={`${r.approach} plan`}><p className="text-sm text-ink2 leading-relaxed">{r.mvpDefinition}</p></Section>
              <Section title="Planning assumptions" kicker="Schedules are only as good as these"><ul className="text-sm text-ink2 space-y-1">{r.planningAssumptions.map((a) => <li key={a}>≈ {a}</li>)}</ul></Section>
            </div>

            {sch && (
              <Section title="Timeline" kicker={`${sch.totalDays} calendar days from ${start} · computed from estimates and dependencies`}>
                <div className="card p-4 overflow-x-auto">
                  {r.phases.map((ph) => (
                    <div key={ph.id} className="mb-3">
                      <div className="text-xs text-ink3 mb-1">{ph.name} — {ph.goal}</div>
                      {ph.milestones.map((m) => p.tasks.filter((t) => t.milestoneId === m.id).map((t) => {
                        const it = sch.items.find((i) => i.id === t.id);
                        if (!it) return null;
                        const w = Math.max(1, sch.totalDays);
                        return (
                          <div key={t.id} className="flex items-center gap-3 h-7 text-xs">
                            <button className="w-56 shrink-0 truncate text-left hover:text-accent" onClick={() => setOpen(t.id)}>{t.id} · {t.title}</button>
                            <div className="relative flex-1 h-3 min-w-[300px]">
                              <div className="absolute h-3 rounded" title={`${it.start} → ${it.due}`}
                                style={{ left: `${(it.startDay / w) * 100}%`, width: `${Math.max(1, ((it.endDay - it.startDay) / w) * 100)}%`, background: t.status === "done" ? "var(--accent-2)" : t.status === "blocked" ? "var(--danger)" : "var(--accent)", opacity: t.status === "done" ? 0.6 : 0.85 }} />
                            </div>
                            <span className="w-20 text-ink3 tabular-nums">{it.due}</span>
                          </div>
                        );
                      }))}
                      <div className="flex flex-wrap gap-2 mt-1">{ph.milestones.map((m) => <span key={m.id} className="chip !text-[11px]">◈ {m.title}</span>)}</div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {p.tasks.length > 0 && (
          <Section title="Execution board" kicker="Drag cards between columns · click for details">
            <div className="grid md:grid-cols-4 gap-3">
              {COLS.map((col) => (
                <div key={col.id} className="rounded-xl bg-bg2 border border-line p-2 min-h-40"
                  onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) updTask(drag, { status: col.id }, `task.${col.id}`); setDrag(null); }}>
                  <div className="text-xs text-ink3 px-2 py-1 flex justify-between"><span>{col.name}</span><span>{p.tasks.filter((t) => t.status === col.id).length}</span></div>
                  {p.tasks.filter((t) => t.status === col.id).map((t) => {
                    const waiting = blockedBy(t);
                    return (
                      <div key={t.id} draggable onDragStart={() => setDrag(t.id)} onClick={() => setOpen(t.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(t.id)}
                        className="card p-3 mb-2 cursor-grab hover:border-line2" style={{ borderLeft: `3px solid ${PRI[t.priority]}` }}>
                        <div className="text-[11px] text-ink3 flex justify-between"><span>{t.id} · {t.priority}</span><span>{t.dueDate ?? ""}</span></div>
                        <div className="text-sm mt-1 leading-snug">{t.title}</div>
                        <div className="text-[11px] text-ink3 mt-1">{t.assignee ?? "Unassigned"}</div>
                        {waiting.length > 0 && t.status !== "done" && <div className="text-[11px] text-warn mt-1">Waiting on {waiting.join(", ")}</div>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </Section>
        )}

        {open && (() => {
          const t = p.tasks.find((x) => x.id === open);
          if (!t) return null;
          const trace = traceToRoot(p, t.relatedNodeId);
          const ms = r?.phases.flatMap((ph) => ph.milestones).find((m) => m.id === t.milestoneId);
          return (
            <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-6" onClick={() => setOpen(null)}>
              <div className="card p-6 w-full max-w-2xl max-h-[85vh] overflow-auto scroll-thin" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Task ${t.id}`}>
                <div className="flex justify-between mb-2"><span className="label">{t.id}{ms ? ` · milestone: ${ms.title}` : ""}</span><button className="text-ink3" onClick={() => setOpen(null)} aria-label="Close">✕</button></div>
                <input className="w-full bg-transparent serif text-2xl outline-none focus:bg-panel2 rounded mb-2" value={t.title} onChange={(e) => updTask(t.id, { title: e.target.value })} />
                <textarea className="input text-sm mb-3" rows={2} value={t.description} onChange={(e) => updTask(t.id, { description: e.target.value })} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                  <label>Owner<input className="input mt-1" value={t.assignee ?? ""} onChange={(e) => updTask(t.id, { assignee: e.target.value })} /></label>
                  <label>Due<input type="date" className="input mt-1" value={t.dueDate ?? ""} onChange={(e) => updTask(t.id, { dueDate: e.target.value })} /></label>
                  <label>Priority<select className="input mt-1" value={t.priority} onChange={(e) => updTask(t.id, { priority: e.target.value as Task["priority"] })}>{["low", "medium", "high", "critical"].map((x) => <option key={x}>{x}</option>)}</select></label>
                  <label>Status<select className="input mt-1" value={t.status} onChange={(e) => updTask(t.id, { status: e.target.value as Task["status"] })}>{COLS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                </div>
                <label className="text-sm block mb-3">Depends on (task ids, comma-separated)<input className="input mt-1" value={t.dependsOn.join(", ")} onChange={(e) => updTask(t.id, { dependsOn: e.target.value.split(",").map((s) => s.trim()).filter((s) => s && s !== t.id) })} /></label>
                <label className="text-sm block mb-3">Acceptance criteria (one per line)<textarea className="input mt-1" rows={3} value={t.acceptanceCriteria.join("\n")} onChange={(e) => updTask(t.id, { acceptanceCriteria: e.target.value.split("\n") })} /></label>
                <label className="text-sm block mb-4">Evidence of completion<input className="input mt-1" value={t.evidenceOfCompletion ?? ""} onChange={(e) => updTask(t.id, { evidenceOfCompletion: e.target.value })} placeholder="Link, document, result…" /></label>

                {assumptions.length > 0 && (
                  <div className="card p-3 mb-4 text-sm">
                    <div className="label mb-1">Learning loop — did this task disprove an assumption?</div>
                    <select className="input" defaultValue="" onChange={(e) => {
                      const a = assumptions.find((x) => x.id === e.target.value);
                      if (!a) return;
                      set((c) => {
                        const ev = makeNode({ type: "evidence", title: `Learned in ${t.id}: assumption failed`, description: t.evidenceOfCompletion || t.description, parentId: a.id }, { source: "user", op: "execution", at: now(), claim: "user_fact" });
                        return {
                          ...c, tasks: c.tasks.map((x) => (x.id === t.id ? { ...x, status: "blocked" as const } : x)),
                          nodes: [...c.nodes.map((n) => (n.id === a.id ? { ...n, status: "invalidated" } : n)), ...placeNew(c.nodes, [ev])],
                          edges: [...c.edges, { id: nid(), source: a.id, target: ev.id, kind: "contradicts" as const }],
                        };
                      }, "learning.assumption_invalidated");
                    }}>
                      <option value="">Select the assumption that proved wrong…</option>
                      {assumptions.map((a) => <option key={a.id} value={a.id}>{a.title}{a.status === "invalidated" ? " (already invalidated)" : ""}</option>)}
                    </select>
                    <p className="text-xs text-ink3 mt-1">Marks it invalidated, records the evidence on the map and flags every downstream node for re-evaluation.</p>
                  </div>
                )}

                {trace.length > 0 && (
                  <div>
                    <div className="label mb-1">Traceability — why this task exists</div>
                    <ol className="text-sm border-l border-line pl-3 space-y-0.5">
                      <li className="text-ink3">{t.id} · {t.title}</li>
                      {trace.map((n) => <li key={n.id}><span className="text-[11px] uppercase text-ink3 mr-1">{n.type}</span>{n.title}</li>)}
                    </ol>
                  </div>
                )}
                <div className="flex justify-end mt-4"><button className="btn !text-danger" onClick={() => { set((c) => ({ ...c, tasks: c.tasks.filter((x) => x.id !== t.id).map((x) => ({ ...x, dependsOn: x.dependsOn.filter((d) => d !== t.id) })) }), "task.deleted"); setOpen(null); }}>Delete task</button></div>
              </div>
            </div>
          );
        })()}

        {r && (
          <div className="grid md:grid-cols-2 gap-6">
            {r.raci.length > 0 && <Section title="RACI">
              <div className="card overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-ink3 border-b border-line"><th className="p-2 font-normal">Activity</th><th className="p-2 font-normal">R</th><th className="p-2 font-normal">A</th><th className="p-2 font-normal">C</th><th className="p-2 font-normal">I</th></tr></thead>
                <tbody>{r.raci.map((x) => <tr key={x.activity} className="border-b border-line/60"><td className="p-2">{x.activity}</td><td className="p-2">{x.responsible}</td><td className="p-2">{x.accountable}</td><td className="p-2">{x.consulted.join(", ")}</td><td className="p-2">{x.informed.join(", ")}</td></tr>)}</tbody></table></div>
            </Section>}
            <Section title="KPIs & go-live criteria">
              <ul className="text-sm space-y-1 mb-3">{r.kpis.map((k) => <li key={k.name}><b>{k.name}</b> — {k.target} <span className="text-ink3 text-xs">({k.measure})</span></li>)}</ul>
              <ul className="text-sm text-ink2 space-y-1">{r.goLiveCriteria.map((g) => <li key={g}>✓ {g}</li>)}</ul>
            </Section>
            {r.risks.length > 0 && <Section title="Delivery risks"><ul className="text-sm space-y-1">{r.risks.map((k) => <li key={k.risk}>△ {k.risk} <span className="text-ink3 text-xs">— {k.owner}: {k.mitigation}</span></li>)}</ul></Section>}
          </div>
        )}
      </div>
    </div>
  );
}
