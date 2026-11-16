/** Pure graph operations: patch application, layout, traversal, schedule. No I/O. */
import { nanoid } from "nanoid";
import type { NEdge, NNode, NodePatch, NodeType, Provenance, Roadmap, Task } from "./schemas";

export const now = () => new Date().toISOString();
export const nid = () => nanoid(10);

export function makeNode(p: Partial<NNode> & { type: NodeType; title: string }, prov: Provenance): NNode {
  const t = now();
  return {
    id: p.id ?? nid(), type: p.type, title: p.title, description: p.description ?? "",
    status: p.status ?? "open", tags: p.tags ?? [], parentId: p.parentId ?? null,
    x: p.x ?? 0, y: p.y ?? 0, provenance: prov, createdAt: t, updatedAt: t,
    confidence: p.confidence,
  };
}

export function children(nodes: NNode[], id: string) {
  return nodes.filter((n) => n.parentId === id);
}
export function descendants(nodes: NNode[], id: string): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of nodes) if (c.parentId === cur && !out.has(c.id)) { out.add(c.id); stack.push(c.id); }
  }
  return out;
}
export function ancestors(nodes: NNode[], id: string): NNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: NNode[] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur?.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId);
    cur = byId.get(cur.parentId);
    if (cur) out.push(cur);
  }
  return out;
}
export function hiddenByCollapse(nodes: NNode[]): Set<string> {
  const hidden = new Set<string>();
  for (const n of nodes) if (n.collapsed) for (const d of descendants(nodes, n.id)) hidden.add(d);
  return hidden;
}

/** Minimal context sent to the AI: the focus node, its ancestry, siblings and children — never the whole map. */
export function contextFor(nodes: NNode[], id: string) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const focus = byId.get(id);
  if (!focus) return null;
  const slim = (n: NNode) => ({ id: n.id, type: n.type, title: n.title, description: n.description.slice(0, 300) });
  return {
    focus: slim(focus),
    ancestry: ancestors(nodes, id).map(slim),
    siblings: focus.parentId ? children(nodes, focus.parentId).filter((n) => n.id !== id).slice(0, 8).map(slim) : [],
    children: children(nodes, id).slice(0, 12).map(slim),
    others: nodes.filter((n) => n.id !== id).slice(0, 40).map((n) => ({ id: n.id, type: n.type, title: n.title })),
  };
}

export interface PatchResult { nodes: NNode[]; edges: NEdge[]; added: string[]; rejected: string[] }

/** Apply a validated AI patch. Unknown references are rejected, never guessed. Existing nodes are only updated, never removed. */
export function applyPatch(nodes: NNode[], edges: NEdge[], patch: NodePatch, prov: Provenance, focusId?: string): PatchResult {
  const refMap = new Map<string, string>();
  const exists = new Set(nodes.map((n) => n.id));
  const resolve = (ref: string) => refMap.get(ref) ?? (exists.has(ref) ? ref : undefined);
  const added: NNode[] = [];
  const newEdges: NEdge[] = [];
  const rejected: string[] = [];
  for (const a of patch.addNodes) refMap.set(a.ref, nid());
  for (const a of patch.addNodes) {
    const parent = resolve(a.parentRef) ?? focusId;
    if (!parent) { rejected.push(`“${a.title}”: unknown parent ${a.parentRef}`); continue; }
    const id = refMap.get(a.ref)!;
    const n = makeNode({ id, type: a.type, title: a.title, description: a.description, parentId: a.relation === "child" ? parent : parent }, { ...prov, claim: a.claim });
    added.push(n);
    newEdges.push({ id: nid(), source: parent, target: id, kind: a.relation });
  }
  for (const l of patch.links) {
    const s = resolve(l.sourceRef), t = resolve(l.targetRef);
    if (!s || !t || s === t) { rejected.push(`link ${l.sourceRef}→${l.targetRef}`); continue; }
    newEdges.push({ id: nid(), source: s, target: t, kind: l.kind, label: l.label });
  }
  const t = now();
  const updated = nodes.map((n) => {
    const u = patch.updateNodes.find((x) => x.id === n.id);
    if (!u) return n;
    return { ...n, description: u.description ?? n.description, status: u.status ?? n.status, updatedAt: t };
  });
  for (const u of patch.updateNodes) if (!exists.has(u.id)) rejected.push(`update of unknown node ${u.id}`);
  const placed = placeNew(updated, added);
  return { nodes: [...updated, ...placed], edges: [...edges, ...newEdges], added: placed.map((n) => n.id), rejected };
}

/** Place newly added nodes in a fan around their parent without moving the user's existing layout. */
export function placeNew(existing: NNode[], added: NNode[]): NNode[] {
  const all = [...existing];
  const byId = new Map(all.map((n) => [n.id, n]));
  const out: NNode[] = [];
  const groups = new Map<string, NNode[]>();
  for (const a of added) {
    const k = a.parentId ?? "_root";
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  const roots = existing.filter((n) => !n.parentId);
  const center = roots[0] ?? { x: 0, y: 0 };
  for (const [pid, list] of groups) {
    const parent = byId.get(pid) ?? out.find((o) => o.id === pid);
    const px = parent?.x ?? 0, py = parent?.y ?? 0;
    let base = Math.atan2(py - center.y, px - center.x);
    if (!parent || (px === center.x && py === center.y)) base = 0;
    const existingKids = existing.filter((n) => n.parentId === pid).length;
    const spread = Math.min(Math.PI * 0.9, 0.35 * (list.length + existingKids));
    const dist = 300;
    list.forEach((n, i) => {
      const step = list.length > 1 ? spread / (list.length - 1) : 0;
      const angle = parent && parent.parentId ? base - spread / 2 + step * i : (2 * Math.PI * (i + existingKids)) / (list.length + existingKids);
      const placed = { ...n, x: Math.round(px + Math.cos(angle) * dist), y: Math.round(py + Math.sin(angle) * dist * 0.8) };
      out.push(placed);
      byId.set(placed.id, placed);
    });
  }
  return out;
}

/** Full radial re-layout (user-triggered "Auto layout"). */
export function radialLayout(nodes: NNode[]): NNode[] {
  const roots = nodes.filter((n) => !n.parentId || !nodes.some((m) => m.id === n.parentId));
  const pos = new Map<string, { x: number; y: number }>();
  const leafCount = new Map<string, number>();
  const count = (id: string): number => {
    const kids = children(nodes, id);
    // outer rings are larger, so a deep subtree needs proportionally less angle than its raw leaf count
    const c = kids.length ? Math.max(1, 0.6 * kids.reduce((s, k) => s + count(k.id), 0)) : 1;
    leafCount.set(id, c);
    return c;
  };
  roots.forEach((r) => count(r.id));
  const total = roots.reduce((s, r) => s + (leafCount.get(r.id) ?? 1), 0);
  // per-depth ring radius: wide enough for the nodes on that ring (~230px arc each) and ≥260px beyond the previous ring
  const depthOf = new Map<string, number>();
  const walkDepth = (id: string, d: number) => { depthOf.set(id, d); for (const k of children(nodes, id)) walkDepth(k.id, d + 1); };
  roots.forEach((r) => walkDepth(r.id, roots.length === 1 ? 0 : 1));
  const perDepth = new Map<number, number>();
  for (const d of depthOf.values()) perDepth.set(d, (perDepth.get(d) ?? 0) + 1);
  const radius = [0];
  const maxD = Math.max(0, ...depthOf.values());
  for (let d = 1; d <= maxD; d++) radius[d] = Math.max(radius[d - 1] + 260, ((perDepth.get(d) ?? 0) * 230) / (2 * Math.PI), d === 1 ? 340 : 0);
  let start = 0;
  const place = (id: string, depth: number, a0: number, a1: number) => {
    const mid = (a0 + a1) / 2;
    const r = radius[depth] ?? depth * 300;
    pos.set(id, { x: Math.round(Math.cos(mid) * r) + 0, y: Math.round(Math.sin(mid) * r * 0.85) + 0 });
    let cur = a0;
    const kids = children(nodes, id);
    const sum = kids.reduce((s, k) => s + (leafCount.get(k.id) ?? 1), 0) || 1;
    for (const k of kids) {
      const span = ((a1 - a0) * (leafCount.get(k.id) ?? 1)) / sum;
      place(k.id, depth + 1, cur, cur + span);
      cur += span;
    }
  };
  for (const r of roots) {
    const span = (2 * Math.PI * (leafCount.get(r.id) ?? 1)) / total;
    if (roots.length === 1) place(r.id, 0, 0, 2 * Math.PI);
    else place(r.id, 1, start, start + span);
    start += span;
  }
  return nodes.map((n) => ({ ...n, ...(pos.get(n.id) ?? {}) }));
}

/** Topological order of tasks; returns null if a dependency cycle exists. */
export function topoOrder(tasks: Pick<Task, "id" | "dependsOn">[]): string[] | null {
  const ids = new Set(tasks.map((t) => t.id));
  const indeg = new Map(tasks.map((t) => [t.id, t.dependsOn.filter((d) => ids.has(d)).length]));
  const q = tasks.filter((t) => indeg.get(t.id) === 0).map((t) => t.id);
  const out: string[] = [];
  while (q.length) {
    const id = q.shift()!;
    out.push(id);
    for (const t of tasks) if (t.dependsOn.includes(id)) {
      indeg.set(t.id, indeg.get(t.id)! - 1);
      if (indeg.get(t.id) === 0) q.push(t.id);
    }
  }
  return out.length === tasks.length ? out : null;
}

/** Deterministic forward-pass schedule (working days collapsed to calendar days, stated as an assumption). */
export function schedule(roadmap: Roadmap, startISO: string) {
  const order = topoOrder(roadmap.tasks) ?? roadmap.tasks.map((t) => t.id);
  const finish = new Map<string, number>();
  const start = new Map<string, number>();
  for (const id of order) {
    const t = roadmap.tasks.find((x) => x.id === id)!;
    const s = Math.max(0, ...t.dependsOn.map((d) => finish.get(d) ?? 0));
    start.set(id, s);
    finish.set(id, s + Math.ceil(t.estimateDays));
  }
  const base = new Date(startISO);
  const iso = (d: number) => new Date(base.getTime() + d * 86400000).toISOString().slice(0, 10);
  const totalDays = Math.max(0, ...finish.values());
  return {
    cyclic: topoOrder(roadmap.tasks) === null,
    totalDays,
    items: roadmap.tasks.map((t) => ({ id: t.id, startDay: start.get(t.id) ?? 0, endDay: finish.get(t.id) ?? 0, start: iso(start.get(t.id) ?? 0), due: iso(finish.get(t.id) ?? 0) })),
  };
}

/** Sanitize AI roadmap: drop dangling deps & self-deps, break cycles deterministically. */
export function sanitizeRoadmap(r: Roadmap): { roadmap: Roadmap; fixes: string[] } {
  const fixes: string[] = [];
  const ids = new Set(r.tasks.map((t) => t.id));
  const ms = new Set(r.phases.flatMap((p) => p.milestones.map((m) => m.id)));
  let tasks = r.tasks.map((t) => {
    const deps = t.dependsOn.filter((d) => ids.has(d) && d !== t.id);
    if (deps.length !== t.dependsOn.length) fixes.push(`Removed invalid dependency on ${t.id}`);
    let milestoneId = t.milestoneId;
    if (!ms.has(milestoneId)) { milestoneId = r.phases[0].milestones[0].id; fixes.push(`Re-homed ${t.id} to milestone ${milestoneId}`); }
    return { ...t, dependsOn: deps, milestoneId };
  });
  let guard = 0;
  while (topoOrder(tasks) === null && guard++ < 50) {
    // break the dependency pointing to the latest-listed task
    const idx = new Map(tasks.map((t, i) => [t.id, i]));
    tasks = tasks.map((t) => {
      const back = t.dependsOn.filter((d) => (idx.get(d) ?? 0) >= (idx.get(t.id) ?? 0));
      if (back.length) fixes.push(`Broke cyclic dependency ${t.id}→${back.join(",")}`);
      return { ...t, dependsOn: t.dependsOn.filter((d) => !back.includes(d)) };
    });
  }
  return { roadmap: { ...r, tasks }, fixes };
}

/** Living decision intelligence: nodes downstream of an invalidated assumption need re-evaluation. */
export function affectedByInvalidated(nodes: NNode[], edges: NEdge[]): Set<string> {
  const out = new Set<string>();
  for (const a of nodes.filter((n) => n.type === "assumption" && n.status === "invalidated")) {
    const seeds = [a.id, ...(a.parentId ? [a.parentId] : []), ...edges.filter((e) => e.source === a.id && e.kind !== "contradicts").map((e) => e.target)];
    for (const s of seeds) {
      if (s !== a.id) out.add(s);
      for (const d of descendants(nodes, s)) if (d !== a.id) out.add(d);
      // follow implementation/derivation links forward (idea → decision → solution → milestones)
      const queue = [s];
      const seen = new Set<string>();
      while (queue.length) {
        const cur = queue.pop()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const e of edges) if (e.source === cur && (e.kind === "implements" || e.kind === "derived_from" || e.kind === "depends_on")) { out.add(e.target); queue.push(e.target); for (const d of descendants(nodes, e.target)) out.add(d); }
      }
    }
    // evidence nodes recording the failure are not "affected"
    for (const n of nodes) if (n.parentId === a.id && n.type === "evidence") out.delete(n.id);
  }
  return out;
}
