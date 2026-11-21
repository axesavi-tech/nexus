"use client";
import { create } from "zustand";
import type {
  Approach, Blueprint, ClusterResult, DecisionRecord, DesignState, Empathy, EvaluationResult, IdeasResult, Interpretation, NEdge, NNode, NodeAction,
  NodePatch, ProjectState, Roadmap, SparksResult, Spark, Task, Technique, TestPlan, TestStatus,
} from "./schemas";
import { emptyDesign, isDuplicate, mergeHmws, techniqueById, topSparks } from "./design";
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
  // design thinking
  design: (fn: (d: DesignState) => DesignState, label?: string) => void;
  empathize: () => Promise<void>;
  spark: (technique: Technique, opts?: { seedId?: string; count?: number; wildness?: number }) => Promise<void>;
  clusterSparks: () => Promise<void>;
  developSparks: () => Promise<boolean>;
  planTests: (ideaId: string) => Promise<void>;
  recordTest: (ideaId: string, assumptionId: string, status: TestStatus, learning: string) => void;
  toMap: (item: { kind: "persona" | "hmw" | "spark" | "insight"; id: string }) => string | null;
}

const personaBrief = (e: Empathy | null | undefined) =>
  (e?.personas ?? []).map((p) => ({ name: p.name, role: p.role, goals: p.goals, pains: p.pains, lowPoint: [...p.journey].sort((a, b) => a.emotion - b.emotion)[0]?.pain }));

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


    design: (fn, label) => get().set((cur) => ({ ...cur, design: fn(cur.design ?? emptyDesign()) }), label),

    empathize: async () => {
      const p = get().p!;
      const d = p.design ?? emptyDesign();
      const stakeholders = p.nodes.filter((n) => n.type === "stakeholder").slice(0, 12).map((n) => ({ title: n.title, description: n.description.slice(0, 200) }));
      await run("Building empathy — personas, journeys, How Might We…", async () => {
        const r = await callAI<Empathy>("empathize", { thought: p.thought, interpretation: p.interpretation, notes: d.notes, stakeholders }, p.id);
        snapshotBefore("empathize");
        get().design((cur) => {
          const hmws = mergeHmws(cur.hmws, r.data.hmws, r.mode === "live" ? "ai" : "dev");
          return { ...cur, empathy: r.data, hmws, activeHmwId: hmws.some((h) => h.id === cur.activeHmwId) ? cur.activeHmwId : hmws[0]?.id ?? null };
        }, "ai.empathize");
      });
    },

    spark: async (technique, opts) => {
      const p = get().p!;
      const d = p.design ?? emptyDesign();
      const hmw = d.hmws.find((h) => h.id === d.activeHmwId);
      const question = hmw?.question ?? p.interpretation?.problemOrOpportunity ?? p.thought;
      const seed = opts?.seedId ? d.sparks.find((s) => s.id === opts.seedId) : undefined;
      const info = techniqueById(technique)!;
      await run(`${info.name}: sparking ideas…`, async () => {
        const r = await callAI<SparksResult>("spark", {
          thought: p.thought, hmw: question, technique, count: opts?.count ?? info.count, wildness: opts?.wildness ?? p.sliders.creativity,
          existing: d.sparks.filter((s) => s.hmwId === (hmw?.id ?? null)).map((s) => s.title.slice(0, 120)).slice(-60),
          seed: seed ? { title: seed.title, description: seed.description } : undefined,
          personas: personaBrief(d.empathy),
        }, p.id);
        const t = now();
        get().design((cur) => {
          const fresh: Spark[] = [];
          for (const x of r.data.sparks) {
            if (isDuplicate(x.title, [...cur.sparks, ...fresh])) continue;
            fresh.push({ id: nid(), hmwId: hmw?.id ?? null, title: x.title, description: x.description, lens: x.lens, technique, source: r.mode === "live" ? "ai" : "dev", votes: 0, parentId: seed?.id, createdAt: t });
          }
          return { ...cur, sparks: [...cur.sparks, ...fresh] };
        }, `ai.spark.${technique}`);
      });
    },

    clusterSparks: async () => {
      const p = get().p!;
      const d = p.design ?? emptyDesign();
      const pool = d.sparks.filter((s) => s.hmwId === d.activeHmwId);
      if (pool.length < 3) { set({ error: "Add at least 3 sparks for this question before clustering." }); return; }
      const hmw = d.hmws.find((h) => h.id === d.activeHmwId)?.question;
      await run("Finding themes in your sparks…", async () => {
        const r = await callAI<ClusterResult>("cluster", { hmw, sparks: pool.slice(0, 60).map((s) => ({ id: s.id, title: s.title, description: s.description.slice(0, 200) })) }, p.id);
        get().design((cur) => {
          const clusters = r.data.clusters.map((c) => ({ id: nid(), name: c.name, theme: c.theme, sparkIds: c.sparkIds }));
          const owner = new Map<string, string>();
          for (const c of clusters) for (const sid of c.sparkIds) if (!owner.has(sid)) owner.set(sid, c.id);
          const others = cur.clusters.filter((c) => cur.sparks.some((s) => s.clusterId === c.id && s.hmwId !== cur.activeHmwId));
          return {
            ...cur, whitespace: r.data.whitespace,
            clusters: [...others, ...clusters.map(({ id, name, theme }) => ({ id, name, theme }))],
            sparks: cur.sparks.map((s) => (s.hmwId === cur.activeHmwId ? { ...s, clusterId: owner.get(s.id) } : s)),
          };
        }, "ai.cluster");
      });
    },

    developSparks: async () => {
      const p = get().p!;
      const d = p.design ?? emptyDesign();
      const top = topSparks(d.sparks, 6);
      if (!top.length) { set({ error: "Dot-vote for the sparks you want to develop first." }); return false; }
      const hq = new Map(d.hmws.map((h) => [h.id, h.question]));
      const focus = p.nodes.filter((n) => ["problem", "opportunity", "insight", "stakeholder"].includes(n.type)).slice(0, 15).map((n) => ({ id: n.id, type: n.type, title: n.title, description: n.description.slice(0, 160) }));
      let ok = false;
      await run("Developing voted sparks into concepts…", async () => {
        const r = await callAI<IdeasResult>("ideate", {
          thought: p.thought, interpretation: p.interpretation, focus, sliders: p.sliders,
          sparks: top.map((s) => ({ title: s.title, description: s.description, votes: s.votes, hmw: s.hmwId ? hq.get(s.hmwId) : undefined })),
          personas: personaBrief(d.empathy),
        }, p.id);
        const root = p.nodes.find((n) => !n.parentId) ?? p.nodes[0];
        const prevIdeaNodes = p.nodes.filter((n) => n.tags.some((t) => t.startsWith("idea:")) && n.provenance.op === "ideate");
        const keep = p.nodes.filter((n) => !prevIdeaNodes.includes(n));
        const edges: NEdge[] = p.edges.filter((e) => !prevIdeaNodes.some((n) => n.id === e.source || n.id === e.target));
        const add = r.data.ideas.map((idea) => makeNode({ type: "idea", title: idea.title, description: idea.summary, parentId: root?.id ?? null, tags: [`idea:${idea.id}`, idea.tier, "from-sparks"] }, { source: r.mode === "live" ? "ai" : "dev", op: "ideate", at: now(), claim: "ai_inference" }));
        if (root) for (const n of add) edges.push({ id: nid(), source: root.id, target: n.id, kind: "child" });
        snapshotBefore("develop sparks");
        get().set((cur) => ({ ...cur, ideas: r.data, generatedWith: { ...cur.sliders }, evaluation: null, nodes: [...keep, ...placeNew(keep, add)], edges, stage: "ideation" }), "ai.ideate.sparks");
        ok = true;
      });
      return ok;
    },

    planTests: async (ideaId) => {
      const p = get().p!;
      const idea = p.ideas?.ideas.find((i) => i.id === ideaId);
      if (!idea) return;
      await run("Mapping assumptions and designing cheap tests…", async () => {
        const r = await callAI<TestPlan>("testplan", { thought: p.thought, idea, personas: personaBrief(p.design?.empathy) }, p.id);
        const valid = new Set(r.data.assumptions.map((a) => a.id));
        const plan = { ...r.data, tests: r.data.tests.filter((t) => valid.has(t.assumptionId)) };
        get().design((cur) => ({
          ...cur,
          tests: [...cur.tests.filter((t) => t.ideaId !== ideaId), { ...plan, ideaId, results: Object.fromEntries(plan.assumptions.map((a) => [a.id, { status: "untested" as TestStatus, learning: "" }])), createdAt: now() }],
        }), "ai.testplan");
      });
    },

    recordTest: (ideaId, assumptionId, status, learning) => {
      get().set((cur) => {
        const d = cur.design ?? emptyDesign();
        const rec = d.tests.find((t) => t.ideaId === ideaId);
        if (!rec) return cur;
        const prev = rec.results[assumptionId];
        let nodes = cur.nodes, edges = cur.edges, nodeId = prev?.nodeId, evidenceId = prev?.evidenceId;
        const a = rec.assumptions.find((x) => x.id === assumptionId);
        // Learning loop: a decided test result lands on the map as an assumption with evidence,
        // linked to the concept — so an invalidated assumption flags everything downstream.
        if (a && (status === "validated" || status === "invalidated")) {
          const ideaNode = cur.nodes.find((n) => n.tags.includes(`idea:${ideaId}`));
          const prov = { source: "user" as const, op: "test", at: now(), claim: "user_fact" as const };
          if (nodeId && nodes.some((n) => n.id === nodeId)) {
            nodes = nodes.map((n) => (n.id === nodeId ? { ...n, status, updatedAt: now() } : n));
          } else {
            const an = makeNode({ type: "assumption", title: a.statement.slice(0, 140), description: `${a.lens} assumption, tested in the Design Studio.`, parentId: ideaNode?.id ?? null, status }, { ...prov, claim: "working_assumption" });
            const placed = placeNew(nodes, [an])[0];
            nodes = [...nodes, placed];
            if (ideaNode) edges = [...edges, { id: nid(), source: ideaNode.id, target: placed.id, kind: "child" }];
            nodeId = placed.id;
          }
          const evTitle = `${status === "validated" ? "Supported" : "Contradicted"}: ${learning}`.slice(0, 140);
          if (learning.trim() && evidenceId && nodes.some((n) => n.id === evidenceId)) {
            nodes = nodes.map((n) => (n.id === evidenceId ? { ...n, title: evTitle, description: learning, updatedAt: now() } : n));
          } else if (learning.trim()) {
            const ev = makeNode({ type: "evidence", title: evTitle, description: learning, parentId: nodeId }, prov);
            const placedEv = placeNew(nodes, [ev])[0];
            nodes = [...nodes, placedEv];
            evidenceId = placedEv.id;
            edges = [...edges, { id: nid(), source: nodeId!, target: placedEv.id, kind: status === "validated" ? "supports" : "child" }];
          }
        } else if (nodeId) {
          nodes = nodes.map((n) => (n.id === nodeId ? { ...n, status: "open", updatedAt: now() } : n));
        }
        const tests = d.tests.map((t) => (t.ideaId === ideaId ? { ...t, results: { ...t.results, [assumptionId]: { status, learning, nodeId, evidenceId } } } : t));
        return { ...cur, nodes, edges, design: { ...d, tests } };
      }, `test.${status}`);
    },

    toMap: (item) => {
      const p = get().p;
      if (!p) return null;
      const d = p.design ?? emptyDesign();
      const root = p.nodes.find((n) => !n.parentId);
      const prov = { source: "user" as const, op: "design.to_map", at: now() };
      let made: NNode[] = [];
      if (item.kind === "persona") {
        const ps = d.empathy?.personas.find((x) => x.id === item.id);
        if (!ps) return null;
        const pn = makeNode({ type: "stakeholder", title: `${ps.name} — ${ps.role}`.slice(0, 140), description: `${ps.context}\nGoals: ${ps.goals.join("; ")}`, parentId: root?.id ?? null, tags: ["persona"] }, { ...prov, claim: ps.basis === "user_research" ? "research_interpretation" : "unvalidated_hypothesis" });
        made = [pn, ...ps.pains.slice(0, 3).map((x) => makeNode({ type: "problem" as const, title: x.slice(0, 140), description: `Pain for ${ps.name}`, parentId: pn.id }, { ...prov, claim: "unvalidated_hypothesis" as const }))];
      } else if (item.kind === "hmw") {
        const h = d.hmws.find((x) => x.id === item.id);
        if (!h) return null;
        made = [makeNode({ type: "question", title: h.question.slice(0, 140), description: "How Might We — from the Design Studio", parentId: root?.id ?? null, tags: ["hmw"] }, { ...prov, claim: "user_fact" })];
      } else if (item.kind === "insight") {
        const ins = d.empathy?.insights.find((x) => x.id === item.id);
        if (!ins) return null;
        made = [makeNode({ type: "insight", title: ins.text.slice(0, 140), description: ins.text, parentId: root?.id ?? null }, { ...prov, claim: ins.claim })];
      } else {
        const sp = d.sparks.find((x) => x.id === item.id);
        if (!sp) return null;
        const hmwQ = sp.hmwId ? d.hmws.find((h) => h.id === sp.hmwId)?.question : undefined;
        const parent = (hmwQ && p.nodes.find((n) => n.type === "question" && n.title === hmwQ.slice(0, 140))) || root;
        made = [makeNode({ type: "idea", title: sp.title.slice(0, 140), description: sp.description, parentId: parent?.id ?? null, tags: ["spark"] }, { ...prov, claim: "unvalidated_hypothesis" })];
      }
      const placed = placeNew(p.nodes, made);
      const newEdges: NEdge[] = placed.filter((n) => n.parentId).map((n) => ({ id: nid(), source: n.parentId!, target: n.id, kind: "child" }));
      get().set((cur) => ({ ...cur, nodes: [...cur.nodes, ...placed], edges: [...cur.edges, ...newEdges] }), `design.to_map.${item.kind}`);
      return placed[0]?.id ?? null;
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
