"use client";
import { useNexus, traceToRoot } from "@/lib/store";
import { byId } from "@/lib/frameworks";
import { NODE_TYPES, type NNode, type NodeAction, type NodeType, type Task } from "@/lib/schemas";
import { nid } from "@/lib/graph";
import { ClaimTag, TypeBadge, Confidence } from "../ui";
import type { ViewId } from "../Workspace";

const ACTIONS: { id: NodeAction; label: string; hint: string }[] = [
  { id: "expand", label: "Expand this thought", hint: "Explore related directions" },
  { id: "deeper", label: "Go deeper", hint: "Decompose into finer detail" },
  { id: "challenge", label: "Challenge this", hint: "Weaknesses & counter-arguments" },
  { id: "different", label: "Think differently", hint: "Unconventional possibilities" },
  { id: "root_cause", label: "Find root cause", hint: "Underlying causes" },
  { id: "connect", label: "Connect the dots", hint: "Relationships with other nodes" },
  { id: "evidence", label: "Find evidence", hint: "What would support or contradict" },
  { id: "evaluate", label: "Evaluate", hint: "Potential and trade-offs" },
  { id: "to_solution", label: "Turn into solution", hint: "A feasible concept" },
  { id: "to_action", label: "Turn into action", hint: "Tasks and dependencies" },
  { id: "missing", label: "What am I missing?", hint: "Blind spots" },
];

export function IntelligencePanel({ node, go, onAddChild }: { node: NNode | null; go: (v: ViewId) => void; onAddChild: (id: string) => void }) {
  const { p, set, setQuiet, checkpoint, nodeAction, busy, pending, select } = useNexus();
  if (!p) return null;
  const I = p.interpretation;

  if (!node) {
    const counts = NODE_TYPES.map((t) => [t, p.nodes.filter((n) => n.type === t).length] as const).filter(([, c]) => c);
    const assumptions = p.nodes.filter((n) => n.type === "assumption");
    const questions = p.nodes.filter((n) => n.type === "question" && n.status !== "answered");
    return (
      <aside className="w-80 shrink-0 border-l border-line bg-bg2 overflow-auto scroll-thin p-5" aria-label="Intelligence panel">
        <div className="label mb-2">Intelligence</div>
        <h3 className="serif text-xl mb-3">Select a node to work on it</h3>
        <p className="text-sm text-ink2 mb-5 leading-relaxed">Click a node for AI actions. Shift-click to multi-select, drag between nodes to cross-link, double-click to collapse, Tab to add a child.</p>
        {I && <div className="card p-3 mb-4"><div className="label mb-1">Working understanding</div><p className="text-sm">{I.problemOrOpportunity}</p></div>}
        {questions.length > 0 && <div className="mb-4"><div className="label mb-2">Open questions ({questions.length})</div><ul className="space-y-1 text-sm">{questions.slice(0, 5).map((q) => <li key={q.id}><button className="text-left hover:text-accent" onClick={() => select(q.id)}>? {q.title}</button></li>)}</ul></div>}
        {assumptions.length > 0 && <div className="mb-4"><div className="label mb-2">Assumptions on the map ({assumptions.length})</div><ul className="space-y-1 text-sm">{assumptions.slice(0, 5).map((q) => <li key={q.id}><button className="text-left hover:text-accent" onClick={() => select(q.id)}>≈ {q.title}</button></li>)}</ul></div>}
        {p.frameworks.length > 0 && <div className="mb-4"><div className="label mb-2">Frameworks in use</div><div className="flex flex-wrap gap-1">{p.frameworks.map((f) => <span key={f} className="chip">{byId(f)?.name}</span>)}</div></div>}
        <div className="label mb-2">Composition</div>
        <div className="flex flex-wrap gap-1.5">{counts.map(([t, c]) => <span key={t} className="chip"><TypeBadge type={t} /> {c}</span>)}</div>
        <div className="mt-6 space-y-2">
          <button className="btn w-full justify-center" onClick={() => go("ideas")}>Open Idea Lab →</button>
          {p.ideas && <button className="btn w-full justify-center" onClick={() => go("board")}>Compare options →</button>}
        </div>
      </aside>
    );
  }

  const isPending = !!pending?.added.includes(node.id);
  const upd = (patch: Partial<NNode>, history = false) => {
    const fn = (cur: NonNullable<typeof p>) => ({ ...cur, nodes: cur.nodes.map((n) => (n.id === node.id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n)) });
    if (history) set(fn, "node.edited"); else setQuiet(fn);
  };
  const links = p.edges.filter((e) => (e.source === node.id || e.target === node.id) && e.kind !== "child");
  const trace = traceToRoot(p, node.id).slice(1);
  const linkedTask = p.tasks.find((t) => t.relatedNodeId === node.id);

  const toTask = () => {
    const t: Task = { id: `N-${nid().slice(0, 5)}`, title: node.title, description: node.description, priority: "medium", status: "todo", dependsOn: [], acceptanceCriteria: [], relatedNodeId: node.id };
    set((cur) => ({ ...cur, tasks: [...cur.tasks, t], nodes: cur.nodes.map((n) => (n.id === node.id && n.type !== "milestone" ? { ...n, type: "action" as NodeType } : n)) }), "task.created_from_node");
  };

  return (
    <aside className="w-80 shrink-0 border-l border-line bg-bg2 overflow-auto scroll-thin" aria-label="Node details">
      <div className="p-5 border-b border-line">
        <div className="flex items-center justify-between mb-2">
          <select className="bg-transparent text-xs uppercase tracking-wider outline-none" value={node.type} onChange={(e) => upd({ type: e.target.value as NodeType }, true)} disabled={isPending} aria-label="Node type">
            {NODE_TYPES.map((t) => <option key={t} value={t} className="bg-panel">{t}</option>)}
          </select>
          <button className="text-ink3 text-sm" onClick={() => select(null)} aria-label="Close">✕</button>
        </div>
        <TypeBadge type={node.type} />
        <textarea className="w-full bg-transparent serif text-xl leading-snug mt-1 resize-none outline-none focus:bg-panel rounded" rows={2} value={node.title} disabled={isPending}
          onFocus={checkpoint} onChange={(e) => upd({ title: e.target.value })} aria-label="Title" />
        <textarea className="input mt-2 text-sm !leading-relaxed" rows={4} value={node.description} placeholder="Description, notes, evidence…" disabled={isPending}
          onFocus={checkpoint} onChange={(e) => upd({ description: e.target.value })} aria-label="Description" />
        <div className="grid grid-cols-2 gap-2 mt-2">
          <label className="text-xs text-ink3">Status<input className="input !py-1 mt-0.5" value={node.status} onChange={(e) => upd({ status: e.target.value })} disabled={isPending} /></label>
          <label className="text-xs text-ink3">Owner<input className="input !py-1 mt-0.5" value={node.owner ?? ""} onChange={(e) => upd({ owner: e.target.value })} disabled={isPending} /></label>
          <label className="text-xs text-ink3 col-span-2">Tags<input className="input !py-1 mt-0.5" value={node.tags.join(", ")} onChange={(e) => upd({ tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} disabled={isPending} /></label>
          <label className="text-xs text-ink3 col-span-2">Confidence
            <select className="input !py-1 mt-0.5" value={node.confidence ?? ""} onChange={(e) => upd({ confidence: (e.target.value || undefined) as NNode["confidence"] }, true)} disabled={isPending}>
              <option value="">Not set</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] text-ink3">
          <span>{node.provenance.source === "user" ? "Created by you" : node.provenance.source === "dev" ? "Dev template" : "AI-generated"}{node.provenance.op ? ` · ${node.provenance.op}` : ""}</span>
          <ClaimTag claim={node.provenance.claim} />
          <Confidence level={node.confidence} />
        </div>
      </div>

      {!isPending && (
        <div className="p-5 border-b border-line">
          <div className="label mb-2">AI actions</div>
          <div className="grid grid-cols-1 gap-1">
            {ACTIONS.map((a) => (
              <button key={a.id} disabled={!!busy || !!pending} onClick={() => nodeAction(node.id, a.id)} className="text-left px-3 py-1.5 rounded-lg hover:bg-panel2 disabled:opacity-40 group">
                <div className="text-sm">{a.label}</div><div className="text-[11px] text-ink3">{a.hint}</div>
              </button>
            ))}
          </div>
          {p.frameworks.length > 0 && (
            <>
              <div className="label mt-4 mb-2">Apply framework here</div>
              <div className="flex flex-wrap gap-1.5">
                {p.frameworks.map((f) => <button key={f} disabled={!!busy || !!pending} className="chip hover:!text-accent hover:!border-accent" onClick={() => nodeAction(node.id, "framework", { frameworkId: f })}>{byId(f)?.name}</button>)}
              </div>
            </>
          )}
          <p className="text-[11px] text-ink3 mt-3">AI changes appear as a preview you can accept or discard. Only this branch is touched.</p>
        </div>
      )}

      <div className="p-5 border-b border-line space-y-2">
        <div className="flex flex-wrap gap-2">
          <button className="btn !py-1 text-xs" onClick={() => onAddChild(node.id)}>＋ Child</button>
          <button className="btn !py-1 text-xs" onClick={() => upd({ collapsed: !node.collapsed }, true)}>{node.collapsed ? "Expand branch" : "Collapse branch"}</button>
          {!linkedTask && <button className="btn !py-1 text-xs" onClick={toTask}>Turn into task</button>}
          {node.parentId && <button className="btn !py-1 text-xs !text-danger" onClick={() => { set((cur) => ({ ...cur, nodes: cur.nodes.filter((n) => n.id !== node.id).map((n) => (n.parentId === node.id ? { ...n, parentId: node.parentId } : n)), edges: cur.edges.filter((e) => e.source !== node.id && e.target !== node.id).concat(p.nodes.filter((n) => n.parentId === node.id).map((n) => ({ id: nid(), source: node.parentId!, target: n.id, kind: "child" as const }))) }), "node.deleted"); select(null); }}>Delete (keep children)</button>}
        </div>
        {linkedTask && <p className="text-xs text-ink2">Linked task: <button className="text-accent" onClick={() => go("execution")}>{linkedTask.id} · {linkedTask.title}</button> ({linkedTask.status})</p>}
      </div>

      {links.length > 0 && (
        <div className="p-5 border-b border-line">
          <div className="label mb-2">Relationships</div>
          <ul className="space-y-1 text-sm">
            {links.map((e) => {
              const other = p.nodes.find((n) => n.id === (e.source === node.id ? e.target : e.source));
              return <li key={e.id} className="flex items-center gap-2"><span className="text-ink3 text-xs w-24 shrink-0">{e.source === node.id ? e.kind : `← ${e.kind}`}</span><button className="truncate hover:text-accent" onClick={() => other && select(other.id)}>{other?.title}</button>
                <button className="ml-auto text-ink3 hover:text-danger text-xs" aria-label="Remove link" onClick={() => set((cur) => ({ ...cur, edges: cur.edges.filter((x) => x.id !== e.id) }), "edge.removed")}>✕</button></li>;
            })}
          </ul>
        </div>
      )}

      {trace.length > 0 && (
        <div className="p-5">
          <div className="label mb-2">Traceability — path to the original thought</div>
          <ol className="text-sm space-y-1 border-l border-line pl-3">
            {trace.map((n) => <li key={n.id}><button className="text-left hover:text-accent" onClick={() => select(n.id)}><span className="text-ink3 text-[11px] uppercase mr-1">{n.type}</span>{n.title}</button></li>)}
          </ol>
        </div>
      )}
    </aside>
  );
}
