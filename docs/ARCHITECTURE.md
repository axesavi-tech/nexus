# NEXUS — Product & System Architecture

> *Every thought has potential. NEXUS turns potential into possibilities, possibilities into decisions, and decisions into outcomes.*

This document covers Deliverables 1 (product architecture), 3 (data model) and 4 (AI orchestration) of the master build prompt, and records what the Phase 1 MVP implements versus what is deliberately deferred.

---

## 1. Product vision in one paragraph

NEXUS is a visual thinking environment, not a chatbot. A user starts with any thought — a single word or a transformation programme — and NEXUS keeps every step of the journey on one living knowledge graph: interpretation → discovery map → divergent options → transparent evaluation → recorded decision → solution blueprint → delivery roadmap → tasks. Every AI contribution is structured, previewable, reversible and labelled with its evidence status. The human decides; NEXUS widens the options, challenges assumptions and does the arithmetic.

## 2. Design principles → concrete mechanisms

| Principle | How the MVP enforces it |
|---|---|
| Any thought is a valid start | One free-text box, three entry modes (Free / Guided / Strategic), category detection across business, software, operational, physical, personal and abstract. No industry templates. |
| Think before solving | The first AI step is *interpretation*: intention, problem, alternative readings, assumptions, missing information, ≤3 optional questions. No solutions are generated at this stage. |
| Diverge before converging | Ideation always returns four tiers (conservative / practical / disruptive / moonshot); a quality gate flags near-duplicates (Jaccard), missing users, constraint conflicts and low tier diversity. |
| Intelligence is visible | Reasoning lives on the graph as typed nodes (19 types) and typed edges (child, crosslink, supports, contradicts, depends_on, derived_from, implements). |
| Human agency | AI graph edits arrive as a **preview patch** — accept or discard. Undo/redo (80 steps), automatic version snapshot before every AI change, manual versions, restore. Decisions require a human rationale and decision-maker. |
| Explainable recommendations | Every score carries rationale, evidence status, confidence, assumptions and downside. Weighted totals are computed deterministically in code. Sensitivity analysis shows which weight change would flip the leader. |
| Path to execution | Decision → blueprint → roadmap → tasks, with computed schedule, RACI, KPIs, go-live criteria. |
| Execution generates learning | A task can report that an assumption failed: the assumption is marked *invalidated*, evidence is recorded on the map, and every downstream node (idea → decision → solution → milestones) is flagged for re-evaluation. |

## 3. User journey (iterative, not a gate sequence)

```
Thought ─► Discovery ─► Ideation ─► Evaluation ─► Solution ─► Implementation
   ▲            ▲            ▲            ▲             ▲              │
   └────────────┴────────────┴─── any view, any time ───┴──────────────┘
```

| Stage | Entry condition | Output | Where |
|---|---|---|---|
| Thought | Any text | Interpretation + root node | Thought Room |
| Discovery | Interpretation | Context & problem map | Infinity Canvas |
| Ideation | Map has problem/opportunity nodes | 4 divergent options + lineage | Idea Lab |
| Evaluation | Options exist | Matrix, ranking, sensitivity, assumption register | Consulting Board |
| Decision (gate) | Human rationale + decision-maker | Decision record + decision node | Consulting Board → Decision room |
| Solution design | Recorded decision | Category-specific blueprint | Solution Studio |
| Implementation | Blueprint | Roadmap, schedule, tasks, RACI, KPIs | Execution Cockpit |
| Measurement / Evolution | Task results | Invalidated assumptions propagate | Cockpit ↔ Canvas |

## 4. Information architecture

```
Knowledge Vault (home)
├── Thought Room — capture, modes, samples A–E, project list + search
└── Project workspace
    ├── Left: views · journey progress · counts
    ├── Centre: active view
    │   ├── Thought Room (interpretation, questions, frameworks)
    │   ├── Infinity Canvas (Mind map · Issue tree · Affinity views of the same graph)
    │   ├── Idea Lab (creativity controls, options, quality flags, lineage)
    │   ├── Consulting Board (ranking, matrix, weights, custom criteria, sensitivity,
    │   │                     risk-vs-impact + Pareto, assumption register, decision room)
    │   ├── Solution Studio (editable blueprint, export)
    │   └── Execution Cockpit (plan generator, timeline, Kanban, task detail + traceability)
    ├── Right (canvas): Intelligence panel — node editor, 11 AI actions, frameworks, relationships, trace
    └── Bottom (canvas): natural-language command bar
```

## 5. System architecture

```
┌──────────── Browser (Next.js App Router, React 19, Tailwind 4, React Flow 12) ────────────┐
│  Views ─► zustand store (project aggregate, undo/redo, pending AI patch)                    │
│              │ pure domain libs: graph.ts · scoring.ts · frameworks.ts · export.ts          │
│              ├─► Repo interface ─► SupabaseRepo (RLS)  |  LocalRepo (dev fallback)          │
│              └─► callAI(op) ──── bearer token ────┐                                         │
└───────────────────────────────────────────────────┼─────────────────────────────────────────┘
                                                    ▼
┌──────────── /api/ai/[op] (Node runtime) ─────────────────────────────────────────────────┐
│ auth (Supabase getUser) · daily cap (ai_runs) · burst limiter · zod input validation     │
│ AI gateway: op registry → prompt builder → Provider (Anthropic, tool-forced JSON)        │
│            → zod output validation → 1 corrective retry → validated structure only       │
│            → DevProvider (deterministic templates) when no key is configured             │
│ ai_runs logging (model, tokens, ok/error)                                                │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                                    ▼
                         Supabase Postgres (RLS on every table) + Auth
```

Layer separation follows §20 of the prompt: presentation (components) · project & graph management (store, graph.ts, repo.ts) · AI orchestration (gateway) · methodology engine (frameworks.ts) · evaluation & calculation (scoring.ts, schedule) · artifact generation (blueprint/roadmap ops, export.ts) · execution (tasks, cockpit) · security (RLS, auth, limits).

**AI prose never mutates the database.** The model returns a schema-validated structure; the client applies it as a *patch* (`applyPatch`) which rejects unknown references, never deletes existing nodes, places new nodes without moving the user's layout, and is shown as a preview first.

## 6. Data model

| Entity | Storage | Notes |
|---|---|---|
| User / Organization | `auth.users` | Organization & workspace tenancy deferred to Phase 3 (RBAC). |
| Project (Thought) | `projects` | Original thought preserved verbatim; `interpretation` jsonb; `settings` (mode, sliders, weights, answers, selected idea, frameworks). |
| Node | `nodes` (project_id, id) | 19 semantic types, status, tags, parent, x/y, `data` (collapsed, confidence, owner), `provenance` (source user/ai/dev, op, claim type, time). |
| Edge | `edges` | 7 relationship kinds incl. cross-links and dependencies. |
| Idea set, Evaluation, Decision, Blueprint, Roadmap | `artifacts` (one row per kind) | Structured JSON, validated by the same zod schemas used for AI output. |
| Task | `tasks` | owner, due, priority, status, dependencies, acceptance criteria, evidence of completion, milestone, related node (traceability). |
| Version | `versions` | Full project snapshot; auto before every AI change + manual. |
| Audit Event | `audit_events` | User/AI events (`ai.ideate`, `decision.recorded`, `node.deleted`, …). |
| Agent Run | `ai_runs` | Operation, model, tokens, success — also drives the daily cost cap. |

Hypotheses, assumptions, evidence, risks, experiments, milestones and metrics are **node types** in the graph (single source of truth, visible in every view) rather than separate tables in the MVP. They can be promoted to tables when Phase 2 needs cross-project querying.

### Evidence classification (every AI node is tagged)
`user_fact · verified_external · research_interpretation · ai_inference · working_assumption · unvalidated_hypothesis · forecast`

### Versioning strategy
Undo/redo in memory (80 steps) → automatic snapshot to `versions` before each accepted AI change → manual named versions → restore keeps the current state in undo history. Autosave diffs the aggregate against the last saved state and only writes changed collections.

## 7. AI orchestration (implemented services)

| Operation | Input | Output schema | Notes |
|---|---|---|---|
| `analyze` | thought, mode, optional answers | `InterpretationSchema` | ≤3 questions; alternative interpretations required |
| `node` | action (11 + framework + custom), focus subgraph only | `NodePatchSchema` | Only focus/ancestry/siblings/children are sent — never the whole map |
| `ideate` | interpretation, selected nodes, creativity sliders, previous titles | `IdeasSchema` | One idea per tier; lineage via `originNodeIds` |
| `evaluate` | ideas, constraints | `EvaluationSchema` | Model judges; code computes weights, totals, sensitivity, Pareto |
| `blueprint` | chosen idea, evaluation, decision rationale | `BlueprintSchema` | Category-specific sections for all 5 idea types |
| `roadmap` | blueprint, approach, team note | `RoadmapSchema` | Sanitised (dangling deps, cycles, orphan milestones) then scheduled deterministically |

The system prompt enforces research integrity (no invented sources, statistics, competitors, interviews), honest claim types, reframing checks, and treats all user content inside `<user_content>` tags as data (prompt-injection resistance). The **multi-agent** roles of §9 map onto these operations today (Discovery = analyze, Creative = ideate, Critical = challenge/missing, Strategy = frameworks/evaluate, Architect = blueprint, Implementation = roadmap); a true orchestrator with parallel agents and conflict recording is Phase 2.

**Framework engine:** 27 frameworks with machine-readable metadata (categories, signals, inputs, outputs, maturity, strengths, limitations, effort, evidence needs, when not to use, and an application recipe). The recommender is deterministic and explainable: category fit + wording signals + maturity + mode − effort, max three, at most one per family.

## 8. Security & trust

* Supabase Auth (email + password); RLS on every table restricts rows to `auth.uid()`; insert policies also verify project ownership. Verified: a second user sees 0 rows.
* AI route requires a valid session token when Supabase is configured; daily cap per user from `ai_runs`; per-minute burst limit; zod validation on input and output; 60 s max duration.
* The Anthropic key is server-side only. Uploaded content is not yet supported (see deferred list), so there is no file attack surface in the MVP.
* No compliance certifications are claimed.

## 9. What the Phase 1 MVP implements vs. defers

| Area | Implemented now | Deferred (phase) |
|---|---|---|
| Thought capture | Text, 3 modes, interpretation, alternative readings, ≤3 optional questions, re-interpret with answers | Voice, file/image/URL uploads (2) |
| Mind map | Infinite canvas, zoom/pan, mini-map, drag, typed nodes, cross-links (drag between nodes), collapse, multi-select, duplicate, merge, delete, search, keyboard shortcuts, auto radial layout, undo/redo, versions | Resizable nodes, touch gestures tuning, AI layout optimisation (2) |
| Views | Mind map, Issue tree, Affinity, Kanban, Timeline, Strategy/board view | Knowledge graph, systems map, journey, BPMN, architecture views (2) |
| AI node actions | All 11 + apply-framework + free-text commands, previewable & reversible | — |
| Frameworks | 27-framework library + recommender + apply-to-node | Full 50+ library (2) |
| Ideation | 4 tiers, 8 sliders with change explanation, quality gate, lineage, Idea Fusion (multi-select → generate) | Alternative Universe branches (4) |
| Evaluation | 8 weighted dimensions, overrides, custom criteria, provisional handling, sensitivity, risk-vs-impact, Pareto | Monte-Carlo scenarios (2) |
| Decision | Decision room + record + reopen (re-decide) | Stakeholder voting, approval workflow (3) |
| Solution | Category-aware blueprint, editable, exportable per section | PRD/wireframe generators, financial model (2) |
| Execution | Agile/waterfall/hybrid/personal plans, schedule, Kanban, task detail, node→task, traceability chain, learning loop | Jira/Azure DevOps sync (4) |
| Evidence | Claim classification on every AI node, assumption register | Live retrieval & citation (2 — needs search API) |
| Collaboration | — | Shared workspaces, real-time editing, comments, RBAC (3) |
| Export | Markdown (full or per artifact) | PDF/DOCX/PPTX, presentation mode (2) |
