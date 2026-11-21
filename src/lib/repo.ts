/**
 * Persistence layer. Two implementations behind one interface:
 *  - SupabaseRepo: Postgres with row-level security (production)
 *  - LocalRepo: browser localStorage (clearly labelled development alternative when Supabase isn't configured)
 */
import type { NEdge, NNode, ProjectState, Task } from "./schemas";
import { DEFAULT_SLIDERS } from "./schemas";
import { DEFAULT_WEIGHTS } from "./scoring";
import { supabaseBrowser } from "./supabase";

export interface ProjectSummary { id: string; title: string; thought: string; stage: string; updatedAt: string }
export interface VersionSummary { id: string; label: string; createdAt: string }

export interface Repo {
  kind: "supabase" | "local";
  list(): Promise<ProjectSummary[]>;
  load(id: string): Promise<ProjectState | null>;
  create(p: ProjectState): Promise<string>;
  save(p: ProjectState, prev?: ProjectState | null): Promise<void>;
  remove(id: string): Promise<void>;
  snapshot(p: ProjectState, label: string): Promise<void>;
  versions(id: string): Promise<VersionSummary[]>;
  restore(versionId: string): Promise<ProjectState | null>;
  audit(projectId: string, event: string, detail?: Record<string, unknown>, actor?: string): Promise<void>;
}

export function blankProject(id: string, thought: string, mode: ProjectState["mode"]): ProjectState {
  const t = new Date().toISOString();
  return {
    id, title: thought.slice(0, 60), thought, mode, stage: "thought", interpretation: null, answers: {},
    nodes: [], edges: [], ideas: null, sliders: { ...DEFAULT_SLIDERS }, weights: { ...DEFAULT_WEIGHTS },
    evaluation: null, selectedIdeaId: null, decision: null, blueprint: null, roadmap: null, tasks: [], frameworks: [], design: null, os: null,
    createdAt: t, updatedAt: t,
  };
}

// ---------------- Local ----------------
const LS = "nexus:v1:";
class LocalRepo implements Repo {
  kind = "local" as const;
  private get<T>(k: string, d: T): T { try { const v = localStorage.getItem(LS + k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } }
  private set(k: string, v: unknown) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch { /* quota */ } }
  async list() {
    const ids = this.get<string[]>("index", []);
    return ids.map((id) => this.get<ProjectState | null>(`p:${id}`, null)).filter(Boolean)
      .map((p) => ({ id: p!.id, title: p!.title, thought: p!.thought, stage: p!.stage, updatedAt: p!.updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async load(id: string) { const p = this.get<ProjectState | null>(`p:${id}`, null); return p ? { ...p, design: p.design ?? null, os: p.os ?? null } : null; }
  async create(p: ProjectState) { this.set(`p:${p.id}`, p); this.set("index", [p.id, ...this.get<string[]>("index", [])]); return p.id; }
  async save(p: ProjectState) { this.set(`p:${p.id}`, p); }
  async remove(id: string) { localStorage.removeItem(LS + `p:${id}`); this.set("index", this.get<string[]>("index", []).filter((x) => x !== id)); }
  async snapshot(p: ProjectState, label: string) {
    const v = this.get<{ id: string; label: string; createdAt: string; snap: ProjectState }[]>(`v:${p.id}`, []);
    v.unshift({ id: crypto.randomUUID(), label, createdAt: new Date().toISOString(), snap: p });
    this.set(`v:${p.id}`, v.slice(0, 30));
  }
  async versions(id: string) { return this.get<{ id: string; label: string; createdAt: string }[]>(`v:${id}`, []).map(({ id, label, createdAt }) => ({ id, label, createdAt })); }
  async restore(versionId: string) {
    for (const k of Object.keys(localStorage)) if (k.startsWith(LS + "v:")) {
      const hit = (JSON.parse(localStorage.getItem(k)!) as { id: string; snap: ProjectState }[]).find((x) => x.id === versionId);
      if (hit) return hit.snap;
    }
    return null;
  }
  async audit(projectId: string, event: string, detail: Record<string, unknown> = {}, actor = "user") {
    const a = this.get<unknown[]>(`a:${projectId}`, []);
    a.unshift({ event, detail, actor, at: new Date().toISOString() });
    this.set(`a:${projectId}`, a.slice(0, 200));
  }
}

// ---------------- Supabase ----------------
type Row = Record<string, unknown>;
const nodeRow = (pid: string, n: NNode): Row => ({
  id: n.id, project_id: pid, type: n.type, title: n.title, description: n.description, status: n.status, tags: n.tags,
  parent_id: n.parentId, x: n.x, y: n.y, provenance: n.provenance,
  data: { collapsed: n.collapsed ?? false, confidence: n.confidence ?? null, owner: n.owner ?? null, createdAt: n.createdAt },
});
const rowNode = (r: Row): NNode => {
  const d = (r.data ?? {}) as Row;
  return {
    id: r.id as string, type: r.type as NNode["type"], title: r.title as string, description: (r.description as string) ?? "",
    status: (r.status as string) ?? "open", tags: (r.tags as string[]) ?? [], parentId: (r.parent_id as string) ?? null,
    x: Number(r.x), y: Number(r.y), collapsed: Boolean(d.collapsed), confidence: (d.confidence as NNode["confidence"]) ?? undefined,
    owner: (d.owner as string) ?? undefined, provenance: r.provenance as NNode["provenance"],
    createdAt: (d.createdAt as string) ?? (r.created_at as string), updatedAt: r.updated_at as string,
  };
};
const taskRow = (pid: string, t: Task): Row => ({
  id: t.id, project_id: pid, title: t.title, description: t.description, assignee: t.assignee ?? null, due_date: t.dueDate || null,
  priority: t.priority, status: t.status, depends_on: t.dependsOn, acceptance_criteria: t.acceptanceCriteria,
  evidence_of_completion: t.evidenceOfCompletion ?? null, milestone_id: t.milestoneId ?? null, related_node_id: t.relatedNodeId ?? null,
});
const rowTask = (r: Row): Task => ({
  id: r.id as string, title: r.title as string, description: (r.description as string) ?? "", assignee: (r.assignee as string) ?? undefined,
  dueDate: (r.due_date as string) ?? null, priority: r.priority as Task["priority"], status: r.status as Task["status"],
  dependsOn: (r.depends_on as string[]) ?? [], acceptanceCriteria: (r.acceptance_criteria as string[]) ?? [],
  evidenceOfCompletion: (r.evidence_of_completion as string) ?? undefined, milestoneId: (r.milestone_id as string) ?? undefined,
  relatedNodeId: (r.related_node_id as string) ?? undefined,
});

function check<T extends { error: { message: string } | null }>(r: T): T { if (r.error) throw new Error(r.error.message); return r; }

class SupabaseRepo implements Repo {
  kind = "supabase" as const;
  private get sb() { return supabaseBrowser()!; }
  async list() {
    const { data } = check(await this.sb.from("projects").select("id,title,thought,stage,updated_at").order("updated_at", { ascending: false }).limit(100));
    return (data ?? []).map((r) => ({ id: r.id, title: r.title, thought: r.thought, stage: r.stage, updatedAt: r.updated_at }));
  }
  async load(id: string): Promise<ProjectState | null> {
    const p = check(await this.sb.from("projects").select("*").eq("id", id).maybeSingle()).data;
    if (!p) return null;
    const [n, e, a, t] = await Promise.all([
      this.sb.from("nodes").select("*").eq("project_id", id),
      this.sb.from("edges").select("*").eq("project_id", id),
      this.sb.from("artifacts").select("kind,content").eq("project_id", id),
      this.sb.from("tasks").select("*").eq("project_id", id),
    ]);
    const art = Object.fromEntries((a.data ?? []).map((r) => [r.kind, r.content]));
    const s = (p.settings ?? {}) as Partial<ProjectState>;
    const base = blankProject(p.id, p.thought, p.mode);
    return {
      ...base, title: p.title, stage: p.stage, interpretation: p.interpretation,
      answers: s.answers ?? {}, sliders: { ...base.sliders, ...(s.sliders ?? {}) }, weights: { ...base.weights, ...(s.weights ?? {}) },
      selectedIdeaId: s.selectedIdeaId ?? null, frameworks: s.frameworks ?? [], aiMode: s.aiMode, generatedWith: s.generatedWith,
      nodes: (n.data ?? []).map(rowNode),
      edges: (e.data ?? []).map((r) => ({ id: r.id, source: r.source, target: r.target, kind: r.kind, label: r.label ?? undefined })),
      ideas: art.ideas ?? null, evaluation: art.evaluation ?? null, blueprint: art.blueprint ?? null, roadmap: art.roadmap ?? null, decision: art.decision ?? null, design: s.design ?? null, os: s.os ?? null,
      tasks: (t.data ?? []).map(rowTask),
      createdAt: p.created_at, updatedAt: p.updated_at,
    };
  }
  async create(p: ProjectState) {
    const { data } = check(await this.sb.from("projects").insert({ title: p.title, thought: p.thought, mode: p.mode, stage: p.stage, settings: {} }).select("id").single());
    await this.audit(data!.id, "project.created", { mode: p.mode });
    return data!.id as string;
  }
  async save(p: ProjectState, prev?: ProjectState | null) {
    const pid = p.id;
    check(await this.sb.from("projects").update({
      title: p.title, thought: p.thought, mode: p.mode, stage: p.stage, interpretation: p.interpretation,
      settings: { answers: p.answers, sliders: p.sliders, weights: p.weights, selectedIdeaId: p.selectedIdeaId, frameworks: p.frameworks, aiMode: p.aiMode, generatedWith: p.generatedWith, design: p.design, os: p.os },
    }).eq("id", pid));
    const ops: PromiseLike<unknown>[] = [];
    const changed = <T,>(a: T, b: T | undefined) => !prev || JSON.stringify(a) !== JSON.stringify(b);
    if (changed(p.nodes, prev?.nodes)) {
      if (p.nodes.length) ops.push(this.sb.from("nodes").upsert(p.nodes.map((n) => nodeRow(pid, n))).then(check));
      const gone = (prev?.nodes ?? []).filter((n) => !p.nodes.some((m) => m.id === n.id)).map((n) => n.id);
      if (gone.length) ops.push(this.sb.from("nodes").delete().eq("project_id", pid).in("id", gone).then(check));
    }
    if (changed(p.edges, prev?.edges)) {
      if (p.edges.length) ops.push(this.sb.from("edges").upsert(p.edges.map((e) => ({ id: e.id, project_id: pid, source: e.source, target: e.target, kind: e.kind, label: e.label ?? null }))).then(check));
      const gone = (prev?.edges ?? []).filter((e) => !p.edges.some((m) => m.id === e.id)).map((e) => e.id);
      if (gone.length) ops.push(this.sb.from("edges").delete().eq("project_id", pid).in("id", gone).then(check));
    }
    for (const kind of ["ideas", "evaluation", "blueprint", "roadmap", "decision"] as const) {
      const v = p[kind];
      if (!changed(v, prev?.[kind])) continue;
      if (v) ops.push(this.sb.from("artifacts").upsert({ project_id: pid, kind, content: v }, { onConflict: "project_id,kind" }).then(check));
      else ops.push(this.sb.from("artifacts").delete().eq("project_id", pid).eq("kind", kind).then(check));
    }
    if (changed(p.tasks, prev?.tasks)) {
      if (p.tasks.length) ops.push(this.sb.from("tasks").upsert(p.tasks.map((t) => taskRow(pid, t))).then(check));
      const gone = (prev?.tasks ?? []).filter((t) => !p.tasks.some((m) => m.id === t.id)).map((t) => t.id);
      if (gone.length) ops.push(this.sb.from("tasks").delete().eq("project_id", pid).in("id", gone).then(check));
    }
    await Promise.all(ops);
  }
  async remove(id: string) { check(await this.sb.from("projects").delete().eq("id", id)); }
  async snapshot(p: ProjectState, label: string) { check(await this.sb.from("versions").insert({ project_id: p.id, label, snapshot: p })); }
  async versions(id: string) {
    const { data } = check(await this.sb.from("versions").select("id,label,created_at").eq("project_id", id).order("created_at", { ascending: false }).limit(50));
    return (data ?? []).map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at }));
  }
  async restore(versionId: string) {
    const { data } = check(await this.sb.from("versions").select("snapshot").eq("id", versionId).maybeSingle());
    return (data?.snapshot as ProjectState) ?? null;
  }
  async audit(projectId: string, event: string, detail: Record<string, unknown> = {}, actor = "user") {
    await this.sb.from("audit_events").insert({ project_id: projectId, event, detail, actor });
  }
}

let repo: Repo | null = null;
export function getRepo(): Repo {
  if (!repo) repo = supabaseBrowser() ? new SupabaseRepo() : new LocalRepo();
  return repo;
}
export type { NEdge };
