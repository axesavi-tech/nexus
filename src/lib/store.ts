"use client";
import { create } from "zustand";
import type {
  Approach, Blueprint, DecisionRecord, EvaluationResult, IdeasResult, Interpretation, NEdge, NNode, NodeAction,
  NodePatch, ProjectState, Roadmap, Task,
} from "./schemas";
import { applyPatch, contextFor, descendants, makeNode, nid, now, placeNew, radialLayout, sanitizeRoadmap, schedule } from "./graph";
import { recommendFrameworks } from "./frameworks";
import { callAI } from "./client";
import { getRepo } from "./repo";

export interface Pending {
  op: string;
  summary: string;
  nodes: NNode[];
  edges: NEdge[];
  added: string[];
  rejected: string[];
  mode: "live" | "dev";
}

interface S {
  p: ProjectState | null;
  past: ProjectState[];
  future: ProjectState[];
  pending: Pending | null;
  busy: string | null;
  error: string | null;
  saveState: "saved" | "saving" | "error" | "idle";
  selected: string | null;
  set: (fn: (p: ProjectState) => ProjectState, label?: string) => void;
  setQuiet: (fn: (p: ProjectState) => ProjectState) => void;
  checkpoint: () => void;
  load: (id: string) => Promise<void>;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  clearError: () => void;
  analyze: () => Promise<void>;
  nodeAction: (nodeId: string, action: NodeAction, opts?: { frameworkId?: string; instruction?: string }) => Promise<void>;
  acceptPending: () => void;
  rejectPending: () => void;
  ideate: (nodeIds?: string[]) => Promise<void>;
  evaluate: () => Promise<void>;
  decide: (rec: DecisionRecord, ideaId: string) => void;
  designSolution: () => Promise<void>;
  planRoadmap: (approach: Approach, startISO: string, teamNote?: string) => Promise<void>;
  saveVersion: (label: string) => Promise<void>;
}

const touch = (p: ProjectState): ProjectState => ({ ...p, updatedAt: now() });

export const useNexus = create<S>((set, get) => {
  const run = async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    set({ busy: label, error: null });
    try { return await fn(); } catch (e) { set({ error: (e as Error).message }); } finally { set({ busy: null }); }
  };
  const audit = (event: string, detail?: Record<string, unknown>, actor = "user") => {
    const p = get().p;
    if (p) getRepo().audit(p.id, event, detail, actor).catch(() => {});
  };
  const snapshotBefore = (label: string) => {
    const p = get().p;
    if (p) getRepo().snapshot(p, `Before: ${label}`).catch(() => {});
  };

  return {
    p: null, past: [], future: [], pending: null, busy: null, error: null, saveState: "idle", selected: null,
    set: (fn, label) => {
      const cur = get().p;
      if (!cur) return;
      set({ p: touch(fn(cur)), past: [...get().past.slice(-79), cur], future: [] });
      if (label) audit(label);
    },
    checkpoint: () => { const cur = get().p; if (cur) set({ past: [...get().past.slice(-79), cur], future: [] }); },
    setQuiet: (fn) => { const cur = get().p; if (cur) set({ p: touch(fn(cur)) }); },
    load: async (id) => {
      set({ p: null, past: [], future: [], pending: null, error: null, selected: null });
      const p = await getRepo().load(id);
      if (!p) { set({ error: "Project not found or you don't have access." }); return; }
      set({ p, saveState: "saved" });
    },
    undo: () => {
      const { past, p, future } = get();
      if (!past.length || !p) return;
      set({ p: past[past.length - 1], past: past.slice(0, -1), future: [p, ...future] });
    },
    redo: () => {
      const { past, p, future } = get();
      if (!future.length || !p) return;
      set({ p: future[0], future: future.slice(1), past: [...past, p] });
    },
    select: (id) => set({ selected: id }),
    clearError: () => set({ error: null }),

    analyze: async () => {
      const p = get().p!;
      await run("Understanding your thought…", async () => {
        const r = await callAI<Interpretation>("analyze", { thought: p.thought, mode: p.mode, answers: p.answers }, p.id);
        const I = r.data;
        const prov = { source: (r.mode === "live" ? "ai" : "dev") as "ai" | "dev", op: "analyze", at: now() };
        // Keep the user's root thought; rebuild only the AI-generated discovery scaffolding.
        const existingRoot = p.nodes.find((n) => !n.parentId && n.type === "thought");
        const root = existingRoot ?? makeNode({ type: "thought", title: I.title, description: p.thought }, { source: "user", at: now(), claim: "user_fact" });
        const keep = p.nodes.filter((n) => n.provenance.op !== "analyze" || n.id === root.id);
        const add: NNode[] = [];
        const edges: NEdge[] = [];
        const child = (type: NNode["type"], title: string, description: string, claim: NNode["provenance"]["claim"], parent = root.id) => {
          const n = makeNode({ type, title, description, parentId: parent }, { ...prov, claim });
          add.push(n); edges.push({ id: nid(), source: parent, target: n.id, kind: "child" });
          return n;
        };
        const prob = child("problem", "Problem / opportunity", I.problemOrOpportunity, "ai_inference");
        I.opportunityAreas.forEach((o) => child("opportunity", o.title, o.description, "ai_inference"));
        I.alternativeInterpretations.forEach((a) => child("insight", `Interpretation: ${a.label}`, a.description, "ai_inference", prob.id));
        I.beneficiaries.slice(0, 3).forEach((b) => child("stakeholder", b, "Intended beneficiary", "ai_inference"));
        I.assumptions.slice(0, 3).forEach((a) => child("assumption", a.slice(0, 120), a, "working_assumption"));
        I.constraints.slice(0, 3).forEach((c) => child("constraint", c.text.slice(0, 120), `${c.kind} constraint`, c.kind === "explicit" ? "user_fact" : "ai_inference"));
        I.clarifyingQuestions.forEach((q) => child("question", q.question.slice(0, 140), q.why, "ai_inference"));
        const base = keep.some((n) => n.id === root.id) ? keep : [root, ...keep];
        const laid = radialLayout([...base, ...add]);
        const fw = recommendFrameworks({ text: p.thought, category: I.category, maturity: I.maturity, mode: p.mode }).map((f) => f.id);
        snapshotBefore("thought analysis");
        get().set((cur) => ({
          ...cur, title: I.title, interpretation: I, aiMode: r.mode, stage: cur.stage === "thought" ? "discovery" : cur.stage,
          nodes: laid, edges: [...cur.edges.filter((e) => laid.some((n) => n.id === e.source) && laid.some((n) => n.id === e.target)), ...edges],
          frameworks: cur.frameworks.length ? cur.frameworks : fw,
        }), "ai.analyze");
      });
    },

    nodeAction: async (nodeId, action, opts) => {
      const p = get().p!;
      const ctx = contextFor(p.nodes, nodeId);
      if (!ctx) return;
      await run(`Working on “${ctx.focus.title.slice(0, 40)}”…`, async () => {
        const r = await callAI<NodePatch>("node", { action, ...opts, thought: p.thought, context: ctx }, p.id);
        const res = applyPatch(p.nodes, p.edges, r.data, { source: r.mode === "live" ? "ai" : "dev", op: `node.${action}`, at: now() }, nodeId);
        set({ pending: { op: action, summary: r.data.summary, nodes: res.nodes, edges: res.edges, added: res.added, rejected: res.rejected, mode: r.mode } });
      });
    },
    acceptPending: () => {
      const pend = get().pending;
      if (!pend) return;
      snapshotBefore(`AI ${pend.op}`);
      get().set((cur) => ({ ...cur, nodes: pend.nodes, edges: pend.edges }), `ai.node.${pend.op}.accepted`);
      set({ pending: null });
    },
    rejectPending: () => { const pend = get().pending; set({ pending: null }); if (pend) audit(`ai.node.${pend.op}.rejected`); },

    ideate: async (nodeIds) => {
      const p = get().p!;
      const ids = nodeIds?.length ? nodeIds : p.nodes.filter((n) => ["problem", "opportunity", "insight", "stakeholder", "constraint", "idea"].includes(n.type)).map((n) => n.id);
      const focus = p.nodes.filter((n) => ids.includes(n.id)).slice(0, 30).map((n) => ({ id: n.id, type: n.type, title: n.title, description: n.description.slice(0, 200) }));
      await run("Generating divergent options…", async () => {
        const r = await callAI<IdeasResult>("ideate", { thought: p.thought, interpretation: p.interpretation, focus, sliders: p.sliders, previousTitles: p.ideas?.ideas.map((i) => i.title) }, p.id);
        const root = p.nodes.find((n) => !n.parentId) ?? p.nodes[0];
        // Idea nodes on the canvas, linked to the nodes they came from (idea lineage).
        const prevIdeaNodes = p.nodes.filter((n) => n.tags.some((t) => t.startsWith("idea:")) && n.provenance.op === "ideate");
        const keep = p.nodes.filter((n) => !prevIdeaNodes.includes(n));
        const add: NNode[] = [];
        const edges: NEdge[] = p.edges.filter((e) => !prevIdeaNodes.some((n) => n.id === e.source || n.id === e.target));
        for (const idea of r.data.ideas) {
          const n = makeNode({ type: "idea", title: idea.title, description: idea.summary, parentId: root?.id ?? null, tags: [`idea:${idea.id}`, idea.tier] }, { source: r.mode === "live" ? "ai" : "dev", op: "ideate", at: now(), claim: "ai_inference" });
          add.push(n);
          if (root) edges.push({ id: nid(), source: root.id, target: n.id, kind: "child" });
          for (const o of idea.originNodeIds) if (keep.some((k) => k.id === o) && o !== root?.id) edges.push({ id: nid(), source: o, target: n.id, kind: "derived_from", label: "inspired" });
        }
        snapshotBefore("ideation");
        get().set((cur) => ({ ...cur, ideas: r.data, generatedWith: { ...cur.sliders }, evaluation: null, nodes: [...keep, ...placeNew(keep, add)], edges, stage: "ideation" }), "ai.ideate");
      });
    },

    evaluate: async () => {
      const p = get().p!;
      if (!p.ideas) return;
      await run("Scoring options transparently…", async () => {
        const r = await callAI<EvaluationResult>("evaluate", { thought: p.thought, ideas: p.ideas!.ideas, constraints: p.interpretation?.constraints.map((c) => c.text) }, p.id);
        get().set((cur) => ({ ...cur, evaluation: r.data, stage: "evaluation" }), "ai.evaluate");
      });
    },

    decide: (rec, ideaId) => {
      get().set((cur) => {
        const ideaNode = cur.nodes.find((n) => n.tags.includes(`idea:${ideaId}`));
        const dn = makeNode({ type: "decision", title: `Decision: ${rec.chosenOption}`.slice(0, 140), description: rec.rationale, parentId: ideaNode?.id ?? null, status: "approved" }, { source: "user", op: "decide", at: now(), claim: "user_fact" });
        const nodes = cur.nodes.filter((n) => n.provenance.op !== "decide");
        const edges = cur.edges.filter((e) => nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target));
        const placed = placeNew(nodes, [dn]);
        return {
          ...cur, decision: rec, selectedIdeaId: ideaId, stage: "solution",
          nodes: [...nodes.map((n) => n.tags.some((t) => t.startsWith("idea:")) ? { ...n, status: n.tags.includes(`idea:${ideaId}`) ? "selected" : "not selected" } : n), ...placed],
          edges: ideaNode ? [...edges, { id: nid(), source: ideaNode.id, target: dn.id, kind: "child" as const }] : edges,
        };
      }, "decision.recorded");
    },

    designSolution: async () => {
      const p = get().p!;
      const idea = p.ideas?.ideas.find((i) => i.id === p.selectedIdeaId);
      if (!idea) { set({ error: "Select and decide on an option first." }); return; }
      await run("Designing the solution blueprint…", async () => {
        const evaluation = p.evaluation?.evaluations.find((e) => e.ideaId === idea.id);
        const r = await callAI<Blueprint>("blueprint", { thought: p.thought, interpretation: p.interpretation, idea, evaluation, decisionRationale: p.decision?.rationale }, p.id);
        const bp: Blueprint = { ...r.data, ideaId: idea.id };
        get().set((cur) => {
          const parent = cur.nodes.find((n) => n.provenance.op === "decide") ?? cur.nodes.find((n) => n.tags.includes(`idea:${idea.id}`));
          const old = new Set(cur.nodes.filter((n) => n.provenance.op === "blueprint" || n.provenance.op === "roadmap").map((n) => n.id));
          const nodes = cur.nodes.filter((n) => !old.has(n.id));
          const edges = cur.edges.filter((e) => !old.has(e.source) && !old.has(e.target));
          const prov = { source: (r.mode === "live" ? "ai" : "dev") as "ai" | "dev", op: "blueprint", at: now(), claim: "ai_inference" as const };
          const sol = makeNode({ type: "solution", title: `Solution: ${idea.title}`.slice(0, 140), description: bp.executiveSummary.slice(0, 700), parentId: parent?.id ?? null, tags: ["blueprint"] }, prov);
          const risks = bp.risks.slice(0, 3).map((x) => makeNode({ type: "risk", title: x.risk.slice(0, 120), description: `Mitigation: ${x.mitigation}`, parentId: sol.id }, prov));
          const deps = bp.dependencies.slice(0, 3).map((d) => makeNode({ type: "dependency", title: d.slice(0, 120), description: "", parentId: sol.id }, prov));
          const exps = bp.validationApproach.slice(0, 3).map((v) => makeNode({ type: "experiment", title: v.hypothesis.slice(0, 120), description: `${v.experiment} — success: ${v.successMetric} (${v.threshold})`, parentId: sol.id }, { ...prov, claim: "unvalidated_hypothesis" }));
          const placedSol = placeNew(nodes, [sol]);
          const kids = placeNew([...nodes, ...placedSol], [...risks, ...deps, ...exps]);
          const newEdges: NEdge[] = [
            ...(parent ? [{ id: nid(), source: parent.id, target: sol.id, kind: "implements" as const }] : []),
            ...[...risks, ...deps, ...exps].map((n) => ({ id: nid(), source: sol.id, target: n.id, kind: "child" as const })),
          ];
          return { ...cur, blueprint: bp, roadmap: null, tasks: [], stage: "solution", nodes: [...nodes, ...placedSol, ...kids], edges: [...edges, ...newEdges] };
        }, "ai.blueprint");
      });
    },

    planRoadmap: async (approach, startISO, teamNote) => {
      const p = get().p!;
      if (!p.blueprint) { set({ error: "Generate a solution blueprint first." }); return; }
      await run("Building the delivery roadmap…", async () => {
        const r = await callAI<Roadmap>("roadmap", { thought: p.thought, blueprint: p.blueprint, approach, teamNote }, p.id);
        const { roadmap, fixes } = sanitizeRoadmap(r.data);
        if (fixes.length) roadmap.planningAssumptions = [...roadmap.planningAssumptions, `Platform corrections: ${fixes.join("; ")}`].slice(0, 12);
        roadmap.planningAssumptions.push(`Dates computed from start ${startISO} using calendar days and task estimates; no holidays or parallel-capacity limits modelled.`);
        const sch = schedule(roadmap, startISO);
        get().set((cur) => {
          const sol = cur.nodes.find((n) => n.provenance.op === "blueprint" && n.type === "solution");
          const old = new Set(cur.nodes.filter((n) => n.provenance.op === "roadmap").map((n) => n.id));
          const nodes = cur.nodes.filter((n) => !old.has(n.id));
          const edges = cur.edges.filter((e) => !old.has(e.source) && !old.has(e.target));
          const prov = { source: (r.mode === "live" ? "ai" : "dev") as "ai" | "dev", op: "roadmap", at: now(), claim: "forecast" as const };
          const msNodes = new Map<string, NNode>();
          for (const ph of roadmap.phases) for (const m of ph.milestones) {
            const due = sch.items.filter((i) => roadmap.tasks.find((t) => t.id === i.id)?.milestoneId === m.id).map((i) => i.due).sort().pop();
            msNodes.set(m.id, makeNode({ type: "milestone", title: m.title, description: `${ph.name} — exit: ${m.exitCriteria}${due ? ` (planned ${due})` : ""}`, parentId: sol?.id ?? null, tags: [`ms:${m.id}`] }, prov));
          }
          const placed = placeNew(nodes, [...msNodes.values()]);
          const newEdges: NEdge[] = sol ? placed.map((n) => ({ id: nid(), source: sol.id, target: n.id, kind: "child" as const })) : [];
          const tasks: Task[] = roadmap.tasks.map((t) => ({
            id: t.id, title: t.title, description: t.description, assignee: t.role, priority: t.priority, status: "todo",
            dependsOn: t.dependsOn, acceptanceCriteria: t.acceptanceCriteria, milestoneId: t.milestoneId,
            dueDate: sch.items.find((i) => i.id === t.id)?.due ?? null,
            relatedNodeId: placed.find((n) => n.tags.includes(`ms:${t.milestoneId}`))?.id,
          }));
          return { ...cur, roadmap, tasks, stage: "implementation", nodes: [...nodes, ...placed], edges: [...edges, ...newEdges] };
        }, "ai.roadmap");
      });
    },

    saveVersion: async (label) => {
      const p = get().p;
      if (p) await run("Saving version…", () => getRepo().snapshot(p, label));
    },
  };
});

// ---------- Helpers used by components ----------
export function deleteNodes(p: ProjectState, ids: string[]): ProjectState {
  const all = new Set(ids);
  for (const id of ids) for (const d of descendants(p.nodes, id)) all.add(d);
  return { ...p, nodes: p.nodes.filter((n) => !all.has(n.id)), edges: p.edges.filter((e) => !all.has(e.source) && !all.has(e.target)) };
}

/** Trace a node back to the root thought (for traceability views). */
export function traceToRoot(p: ProjectState, nodeId?: string): NNode[] {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const out: NNode[] = [];
  let cur = nodeId ? byId.get(nodeId) : undefined;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}
