"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, Handle, Position, MarkerType,
  useReactFlow, type Node, type Edge, type NodeChange, type NodeProps, type Connection,
} from "@xyflow/react";
import { useNexus, deleteNodes } from "@/lib/store";
import { affectedByInvalidated, children, descendants, hiddenByCollapse, makeNode, nid, now, placeNew, radialLayout } from "@/lib/graph";
import type { NEdge, NNode, NodeType, ProjectState } from "@/lib/schemas";
import { FRAMEWORKS } from "@/lib/frameworks";
import { TYPE_GLYPH, TYPE_HEX, typeColor } from "../ui";
import { IntelligencePanel } from "./IntelligencePanel";
import type { ViewId } from "../Workspace";

type Layout = "mind" | "tree" | "affinity";

type NodeData = { n: NNode; pending: boolean; childCount: number; match: boolean; dim: boolean; affected: boolean; radial: boolean };
const MindNode = memo(function MindNode({ data }: NodeProps<Node<NodeData>>) {
  const { n, pending, childCount, match, dim, affected, radial } = data;
  const center = radial ? { left: "50%", top: "50%", transform: "translate(-50%,-50%)", opacity: 0 } : undefined;
  const root = !n.parentId;
  return (
    <div className="nx-node rounded-xl border bg-panel px-3 py-2 transition-shadow"
      style={{
        width: root ? 260 : 210, borderColor: pending ? "var(--accent)" : "var(--line-2)", borderStyle: pending ? "dashed" : "solid",
        borderLeft: `3px solid ${typeColor(n.type)}`, opacity: dim ? 0.3 : 1,
        boxShadow: match ? "0 0 0 2px var(--t-question)" : root ? "0 8px 30px -10px rgba(0,0,0,.6)" : undefined,
      }}>
      <Handle type="target" position={Position.Left} style={center} className="!bg-transparent !border-0 !w-3 !h-3" />
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="text-[10px] uppercase tracking-[.08em] font-semibold" style={{ color: typeColor(n.type) }}><span aria-hidden>{TYPE_GLYPH[n.type]} </span>{n.type}</span>
        <span className="text-[10px] text-ink3">
          {pending && <span className="text-accent">preview </span>}
          {n.provenance.source !== "user" && <span title={`Created by ${n.provenance.source === "dev" ? "dev templates" : "AI"} (${n.provenance.op ?? ""})`}>{n.provenance.source === "dev" ? "dev" : "AI"}</span>}
          {n.collapsed && childCount > 0 && <span className="ml-1 chip !py-0 !px-1.5 !text-[10px]">+{childCount}</span>}
        </span>
      </div>
      <div className={`${root ? "serif text-[17px]" : "text-[13px]"} leading-snug text-ink`}>{n.title}</div>
      {n.status && n.status !== "open" && <div className="text-[10px] mt-1" style={{ color: n.status === "invalidated" ? "var(--danger)" : "var(--ink-3)" }}>● {n.status}</div>}
      {affected && <div className="text-[10px] mt-1 text-warn" title="An assumption this depends on was invalidated">⚠ re-evaluate: assumption failed</div>}
      <Handle type="source" position={Position.Right} style={center} className="!bg-transparent !border-0 !w-3 !h-3" />
    </div>
  );
});
const nodeTypes = { mind: MindNode };

function edgeStyle(e: NEdge): Partial<Edge> {
  switch (e.kind) {
    case "crosslink": return { style: { stroke: "var(--t-question)", strokeDasharray: "6 4" }, label: e.label ?? "related" };
    case "contradicts": return { style: { stroke: "var(--danger)", strokeDasharray: "4 3" }, label: e.label ?? "contradicts" };
    case "supports": return { style: { stroke: "var(--ok)" }, label: e.label ?? "supports" };
    case "depends_on": return { style: { stroke: "var(--t-action)" }, markerEnd: { type: MarkerType.ArrowClosed, color: "var(--t-action)" }, label: e.label ?? "depends on" };
    case "derived_from": return { style: { stroke: "var(--t-idea)", strokeDasharray: "2 4", opacity: 0.6 } };
    case "implements": return { style: { stroke: "var(--accent-2)", strokeWidth: 2 } };
    default: return {};
  }
}

function treeLayout(nodes: NNode[]): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  let row = 0;
  const walk = (n: NNode, depth: number) => {
    const kids = children(nodes, n.id);
    if (!kids.length || n.collapsed) { pos.set(n.id, { x: depth * 300, y: row++ * 78 }); return; }
    kids.forEach((k) => walk(k, depth + 1));
    const ys = kids.map((k) => pos.get(k.id)!.y);
    pos.set(n.id, { x: depth * 300, y: (Math.min(...ys) + Math.max(...ys)) / 2 });
  };
  nodes.filter((n) => !n.parentId).forEach((r) => walk(r, 0));
  return pos;
}
function affinityLayout(nodes: NNode[]): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const types = [...new Set(nodes.map((n) => n.type))];
  types.forEach((t, col) => nodes.filter((n) => n.type === t).forEach((n, i) => pos.set(n.id, { x: col * 250, y: 60 + i * 90 })));
  return pos;
}

function Canvas({ go }: { go: (v: ViewId) => void }) {
  const { p, pending, set, setQuiet, selected, select, acceptPending, rejectPending, nodeAction, ideate, busy } = useNexus();
  const rf = useReactFlow();
  const [layout, setLayout] = useState<Layout>("mind");
  const [search, setSearch] = useState("");
  const [cmd, setCmd] = useState("");
  const [multi, setMulti] = useState<string[]>([]);
  const dragStart = useRef<ProjectState | null>(null);
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});

  const src = pending ? { nodes: pending.nodes, edges: pending.edges } : { nodes: p!.nodes, edges: p!.edges };
  const hidden = useMemo(() => hiddenByCollapse(src.nodes), [src.nodes]);
  const affected = useMemo(() => affectedByInvalidated(src.nodes, src.edges), [src.nodes, src.edges]);
  const q = search.trim().toLowerCase();

  const computed = useMemo(() => (layout === "tree" ? treeLayout(src.nodes) : layout === "affinity" ? affinityLayout(src.nodes) : null), [layout, src.nodes]);

  const rfNodes: Node<NodeData>[] = useMemo(() => src.nodes.filter((n) => !hidden.has(n.id)).map((n) => {
    const pos = computed?.get(n.id) ?? { x: n.x, y: n.y };
    const match = !!q && `${n.title} ${n.description} ${n.tags.join(" ")}`.toLowerCase().includes(q);
    return {
      id: n.id, type: "mind", position: pos, draggable: layout === "mind" && !pending, measured: measured[n.id],
      selected: multi.includes(n.id) || selected === n.id,
      data: { n, pending: !!pending?.added.includes(n.id), childCount: descendants(src.nodes, n.id).size, match, dim: !!q && !match, affected: affected.has(n.id), radial: layout !== "tree" },
    };
  }), [src.nodes, hidden, computed, q, layout, pending, multi, selected, affected, measured]);

  const rfEdges: Edge[] = useMemo(() => src.edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)).map((e) => ({
    id: e.id, source: e.source, target: e.target, type: layout === "tree" ? "default" : "straight",
    labelStyle: { fill: "var(--ink-3)", fontSize: 10 }, labelBgStyle: { fill: "var(--bg)" },
    ...edgeStyle(e),
  })), [src.edges, hidden, layout]);

  const onNodesChange = useCallback((changes: NodeChange<Node<NodeData>>[]) => {
    const dims = changes.filter((c) => c.type === "dimensions" && c.dimensions);
    if (dims.length) setMeasured((m) => { const next = { ...m }; for (const c of dims) if (c.type === "dimensions" && c.dimensions) next[c.id] = c.dimensions; return next; });
    if (pending) return;
    const moves = changes.filter((c) => c.type === "position" && c.position);
    if (moves.length && layout === "mind") {
      setQuiet((cur) => ({ ...cur, nodes: cur.nodes.map((n) => { const m = moves.find((c) => c.type === "position" && c.id === n.id); return m && m.type === "position" && m.position ? { ...n, x: Math.round(m.position.x), y: Math.round(m.position.y) } : n; }) }));
    }
    const removes = changes.filter((c) => c.type === "remove").map((c) => (c as { id: string }).id);
    if (removes.length) { set((cur) => deleteNodes(cur, removes), "node.deleted"); select(null); setMulti([]); }
  }, [pending, layout, setQuiet, set, select]);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    set((cur) => ({ ...cur, edges: [...cur.edges, { id: nid(), source: c.source!, target: c.target!, kind: "crosslink" }] }), "edge.crosslink");
  }, [set]);

  const addChild = useCallback((parentId: string | null, type: NodeType = "thought") => {
    const n = makeNode({ type, title: "New thought", parentId }, { source: "user", at: now(), claim: "user_fact" });
    set((cur) => {
      const placed = placeNew(cur.nodes, [n]);
      return { ...cur, nodes: [...cur.nodes, ...placed], edges: parentId ? [...cur.edges, { id: nid(), source: parentId, target: n.id, kind: "child" }] : cur.edges };
    }, "node.added");
    select(n.id);
  }, [set, select]);

  const duplicate = useCallback((ids: string[]) => {
    set((cur) => {
      const copies = cur.nodes.filter((n) => ids.includes(n.id)).map((n) => ({ ...n, id: nid(), title: `${n.title} (copy)`, x: n.x + 40, y: n.y + 40, provenance: { source: "user" as const, op: "duplicate", at: now() } }));
      const edges: NEdge[] = copies.filter((c) => c.parentId).map((c) => ({ id: nid(), source: c.parentId!, target: c.id, kind: "child" }));
      return { ...cur, nodes: [...cur.nodes, ...copies], edges: [...cur.edges, ...edges] };
    }, "node.duplicated");
  }, [set]);

  const merge = useCallback((ids: string[]) => {
    if (ids.length < 2) return;
    const [keepId, ...rest] = ids;
    set((cur) => {
      const keep = cur.nodes.find((n) => n.id === keepId)!;
      const others = cur.nodes.filter((n) => rest.includes(n.id));
      const merged = { ...keep, title: keep.title, description: [keep.description, ...others.map((o) => `${o.title}: ${o.description}`)].filter(Boolean).join("\n"), updatedAt: now() };
      const nodes = cur.nodes.filter((n) => !rest.includes(n.id)).map((n) => (n.id === keepId ? merged : rest.includes(n.parentId ?? "") ? { ...n, parentId: keepId } : n));
      const edges = cur.edges.map((e) => ({ ...e, source: rest.includes(e.source) ? keepId : e.source, target: rest.includes(e.target) ? keepId : e.target })).filter((e) => e.source !== e.target);
      return { ...cur, nodes, edges };
    }, "node.merged");
    setMulti([]);
  }, [set]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if (e.key === "Tab" && selected) { e.preventDefault(); addChild(selected); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && (multi.length || selected)) { e.preventDefault(); duplicate(multi.length ? multi : [selected!]); }
      if (e.key === "Escape") { select(null); setMulti([]); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") { e.preventDefault(); document.getElementById("nx-search")?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, multi, addChild, duplicate, select]);

  const runCommand = async () => {
    const c = cmd.trim();
    if (!c) return;
    const l = c.toLowerCase();
    setCmd("");
    const target = selected ?? p!.nodes.find((n) => !n.parentId)?.id;
    if (/roadmap|implementation plan|what needs to happen first|tasks/.test(l)) return go("execution");
    if (/compare|rank|evaluate (all|the|these) (options|ideas|branches)/.test(l)) return go("board");
    if (/business case|blueprint|solution design/.test(l)) return go("solution");
    if (/^(generate|give me|more) (ideas|options|alternatives)/.test(l)) { await ideate(multi.length ? multi : undefined); return; }
    if (!target) return;
    const matched = FRAMEWORKS.find((f) => l.includes(f.name.toLowerCase().split(" (")[0].split(" /")[0]) || l.includes(f.id.replace("_", " ")));
    if (matched && /apply|use|run/.test(l)) await nodeAction(target, "framework", { frameworkId: matched.id });
    else await nodeAction(target, "custom", { instruction: c });
  };

  if (!p) return null;
  const sel = src.nodes.find((n) => n.id === selected) ?? null;

  return (
    <div className="h-full flex">
      <div className="flex-1 relative min-w-0">
        <ReactFlow
          nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStart={() => { dragStart.current = useNexus.getState().p; }}
          onNodeDragStop={() => { const before = dragStart.current; if (before) useNexus.setState((s) => ({ past: [...s.past.slice(-79), before], future: [] })); }}
          onConnect={onConnect}
          onNodeClick={(e, n) => { if (e.shiftKey || e.metaKey) setMulti((m) => (m.includes(n.id) ? m.filter((x) => x !== n.id) : [...m, n.id])); else { setMulti([]); select(n.id); } }}
          onNodeDoubleClick={(_, n) => set((cur) => ({ ...cur, nodes: cur.nodes.map((x) => (x.id === n.id ? { ...x, collapsed: !x.collapsed } : x)) }))}
          onPaneClick={() => { select(null); setMulti([]); }}
          onSelectionChange={({ nodes }) => { if (nodes.length > 1) setMulti(nodes.map((n) => n.id)); }}
          deleteKeyCode={pending ? null : ["Delete", "Backspace"]}
          fitView fitViewOptions={{ padding: 0.25 }} minZoom={0.1} maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          selectionOnDrag={false} panOnScroll={false} multiSelectionKeyCode={["Meta", "Shift", "Control"]}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--line)" />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap position="bottom-right" pannable zoomable nodeColor={(n) => TYPE_HEX[(n.data as NodeData).n.type] ?? "#888"} maskColor="rgba(0,0,0,.35)" nodeStrokeWidth={0} nodeBorderRadius={6} />
        </ReactFlow>

        {/* Canvas toolbar */}
        <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center gap-2 pointer-events-none">
          <div className="card flex items-center gap-1 p-1 pointer-events-auto" role="radiogroup" aria-label="View">
            {(["mind", "tree", "affinity"] as Layout[]).map((l) => (
              <button key={l} role="radio" aria-checked={layout === l} onClick={() => setLayout(l)} className={`px-3 py-1 rounded-lg text-xs ${layout === l ? "bg-panel2 text-ink" : "text-ink3 hover:text-ink"}`}>{l === "mind" ? "Mind map" : l === "tree" ? "Issue tree" : "Affinity"}</button>
            ))}
          </div>
          <input id="nx-search" className="input !w-52 !py-1.5 pointer-events-auto" placeholder="Search map… (⌘F)" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the map" />
          <button className="btn !py-1.5 pointer-events-auto" onClick={() => addChild(selected ?? p.nodes.find((n) => !n.parentId)?.id ?? null)} title="Add child (Tab)">＋ Node</button>
          {layout === "mind" && <button className="btn !py-1.5 pointer-events-auto" onClick={() => { set((cur) => ({ ...cur, nodes: radialLayout(cur.nodes) }), "layout.auto"); setTimeout(() => rf.fitView({ padding: 0.25, duration: 400 }), 50); }}>Auto layout</button>}
          <button className="btn !py-1.5 pointer-events-auto" onClick={() => rf.fitView({ padding: 0.25, duration: 400 })}>Fit</button>
          <button className="btn !py-1.5 pointer-events-auto" disabled={!!busy} onClick={() => ideate(multi.length ? multi : undefined)} title="Generate divergent options from the selected nodes (or the whole map)">✺ Generate options</button>
          {multi.length > 1 && (
            <div className="card flex items-center gap-1 p-1 pointer-events-auto">
              <span className="text-xs text-ink3 px-2">{multi.length} selected</span>
              <button className="btn btn-ghost !py-1 text-xs" onClick={() => duplicate(multi)}>Duplicate</button>
              <button className="btn btn-ghost !py-1 text-xs" onClick={() => merge(multi)}>Merge</button>
              <button className="btn btn-ghost !py-1 text-xs" onClick={() => ideate(multi)}>Idea fusion</button>
              <button className="btn btn-ghost !py-1 text-xs !text-danger" onClick={() => { set((cur) => deleteNodes(cur, multi), "node.deleted"); setMulti([]); }}>Delete</button>
            </div>
          )}
        </div>

        {pending && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 card px-4 py-3 z-30 shadow-2xl max-w-xl fade-in" role="dialog" aria-label="Review AI change">
            <div className="label mb-1">Preview — {pending.mode === "dev" ? "dev template" : "AI"} proposal · {pending.added.length} new nodes</div>
            <p className="text-sm mb-2">{pending.summary}</p>
            {pending.rejected.length > 0 && <p className="text-xs text-warn mb-2">Discarded invalid references: {pending.rejected.join("; ")}</p>}
            <div className="flex gap-2"><button className="btn btn-primary" onClick={acceptPending}>Accept</button><button className="btn" onClick={rejectPending}>Discard</button><span className="text-xs text-ink3 self-center">Accepted changes stay undoable.</span></div>
          </div>
        )}

        {/* Command bar */}
        <form className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[min(680px,calc(100%-260px))] z-20" onSubmit={(e) => { e.preventDefault(); runCommand(); }}>
          <div className="card flex items-center gap-2 px-3 py-2 shadow-2xl">
            <span className="text-accent" aria-hidden>⌘</span>
            <input className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink3" value={cmd} onChange={(e) => setCmd(e.target.value)} disabled={!!busy || !!pending}
              placeholder={sel ? `Ask about “${sel.title.slice(0, 30)}” — e.g. “Find the biggest assumption”` : "e.g. “Explore this from a different angle”, “Apply first principles thinking”"} aria-label="Command" />
            <button className="btn btn-primary !py-1" disabled={!cmd.trim() || !!busy || !!pending}>Run</button>
          </div>
        </form>
      </div>
      <IntelligencePanel node={sel} go={go} onAddChild={(id) => addChild(id)} />
    </div>
  );
}

export function CanvasView({ go }: { go: (v: ViewId) => void }) {
  return <ReactFlowProvider><Canvas go={go} /></ReactFlowProvider>;
}
