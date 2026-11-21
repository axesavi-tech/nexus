# NEXUS · Idea → Outcome OS — Product & Technical Foundation

> **From a thought to a defensible investment decision. From an approved idea to an executable delivery plan.**
> The question the product exists to answer: *“Is this idea worth pursuing — and can you prove it?”*

This document covers Deliverables 1–5 of the master build prompt. It describes the system **as built** (Phase 0–1 complete, parts of Phases 2–3 complete) and the gaps that are still open. The live status of every capability is in [CHECKLIST.md](CHECKLIST.md). Component-level detail is in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Deliverable 1 — Product definition

**Vision.** NEXUS is an AI-native innovation, decision-intelligence and delivery-execution system. It is not a chatbot, a mind-mapping app or a project dashboard. It helps a person take an uncertain idea through these stages:

1. Discover the real problem.
2. Explore genuinely different solutions.
3. Gather evidence.
4. Make an explainable investment decision.
5. Leave with a plan that is traceable to the original problem.

**Value proposition.**
- *Better decisions, not more ideas.* Attractiveness and evidence confidence are scored separately. Mandatory risk gates cannot be bought off by a high score. Every recommendation shows its evidence and its uncertainty.
- *Honest AI.* AI generates, challenges and explains. Deterministic code scores, models finances, schedules and enforces policy. Humans approve. AI hypotheses carry zero evidential weight, and AI citations are checked against the evidence register.
- *Traceability.* The chain runs problem → opportunity → concept → assumption → evidence → decision → solution → milestone → task. When an assumption or a piece of evidence changes after approval, the approval is flagged as stale.

**Target personas.**

| Persona | Job to be done | Primary surfaces |
|---|---|---|
| Founder / business owner (e.g. D2C brand) | “Should I spend money on this, and what first?” | Idea Brief, Problem Discovery, Business Case |
| Product manager | Pick the right concept and turn it into a backlog | Ideation Studio, Decision Intelligence, Solution Studio |
| Innovation / strategy consultant | Run a defensible discovery-to-decision engagement | Evidence Lab, Decision report, Export |
| Transformation leader | Prioritise change initiatives and track benefits | Decision Intelligence, Business Case (savings mode), Delivery Planner |
| Executive approver | Approve or reject with a clear rationale and audit trail | Decision Intelligence (approval), Export |

**Core use cases.**
1. Thought → interpreted idea brief with assumptions, alternatives and questions.
2. Problem discovery: personas (as hypotheses), journeys, POV statements, How Might We questions, and a Problem Confidence Indicator.
3. Multi-method ideation: 9 spark techniques plus four-tier concept generation, with Challenge / Think-differently on any node.
4. Evidence register: typed, dated and verifiable sources linked to claims, with research tasks for the gaps.
5. Decision intelligence: weighted scoring, sensitivity, gates, a seven-status recommendation, an explainable report, and human approval.
6. Business case: deterministic NPV / IRR / payback / ROI, scenarios, tornado chart and inspectable formulas.
7. Validation: assumption map, test cards, and results that feed back into confidence and decisions.
8. Solution blueprint → delivery roadmap → tasks, with critical dependencies and traceability.

**Competitive differentiation.**
- Mind-map and whiteboard tools have no decision engine or evidence model.
- PPM and delivery tools start after the decision.
- Generic AI assistants produce persuasive prose with no audit trail.

NEXUS joins these on one graph and keeps AI judgement separate from computation.

**MVP definition (Phase 1 acceptance).** A user can do all of the following, with every step persisted:
1. Create an idea and define its problem.
2. Generate alternative concepts.
3. Capture evidence and assumptions.
4. Compare concepts on weighted criteria.
5. Review risks and uncertainty.
6. Inspect an explainable recommendation.
7. Approve, reject or request validation.
8. Reopen the project later.

**Deliberately out of scope for now** (recorded in the checklist backlog, not dropped):
- multi-tenant organisations and RBAC
- live web research and RAG over uploaded files
- PDF / DOCX / XLSX exports
- Jira / Azure DevOps sync
- portfolio dashboards
- benefits-realisation tracking
- probabilistic (Monte-Carlo) simulation
- BPMN / architecture diagram editors
- voice and file capture

---

## Deliverable 2 — Product architecture

```
Browser (Next.js 15 App Router · React 19 · Tailwind 4 · React Flow 12 · zustand)
 ├─ Views: Idea Brief · Knowledge Map · Problem Discovery · Ideation Studio · Concept Portfolio ·
 │         Evidence Lab · Decision Intelligence · Business Case · Validation Lab · Solution Studio · Delivery Planner
 ├─ Store: project aggregate, undo/redo, AI workflows, approvals          (lib/store.ts)
 ├─ Deterministic domain services — pure, unit-tested, no I/O:
 │    graph.ts (patches, layout, traceability, scheduling, cycle-breaking)
 │    scoring.ts (weights, provisional scoring, sensitivity, Pareto)
 │    evidence.ts (evidence weight, confidence, duplicates, freshness, contradictions)
 │    decision.ts (gates, 7-status classifier, fingerprints, impact analysis, citation integrity)
 │    finance.ts (cash flows, NPV, IRR, payback, ROI, cost of delay, scenarios, tornado)
 │    design.ts (techniques, dot voting, assumption map)
 └─ Repo interface → SupabaseRepo (Postgres + RLS) | LocalRepo (dev only, labelled)
                       │ bearer token
/api/ai/[op] (Node runtime, Vercel Fluid compute)
 ├─ auth (Supabase) · daily cap from ai_runs · per-minute burst limiter · zod input validation
 ├─ AI gateway: op registry → prompt → Provider (Anthropic Claude; provider interface for others)
 │     → JSON-schema tool output → fitToSchema → zod validation → one corrective retry
 │     → DevProvider (deterministic templates) when no key is set — always labelled “not AI”
 └─ ai_runs accounting (model, tokens, ok/error)
Supabase Postgres: projects, nodes, edges, artifacts, tasks, versions, audit_events, ai_runs (RLS on every table)
```

**Logical agents.** These are bounded workflows, not autonomous loops.

| Agent | Operation(s) |
|---|---|
| Discovery | `analyze`, `empathize` |
| Research | `research_gaps` (proposes research; never asserts findings) |
| Innovation | `ideate`, `spark`, `cluster` |
| Critic | node actions `challenge` / `missing` / `different` |
| Commercial | `fin_assumptions` (suggests placeholders; never calculates) |
| Risk | `gates` (provisional until a human confirms) |
| Product / Architecture | `blueprint` |
| Delivery planning | `roadmap` (dates computed deterministically) |
| Decision synthesis | `decision_report` (explains the engine's result; citations checked) |

**Domain model** (implemented as the project aggregate):
- **Project:** thought, interpretation, settings
- **Graph:** 19 node types, 7 typed edges, provenance on every node
- **Concepts:** ideas
- **Scorecard:** evaluation, weights
- **Design:** personas, HMWs, sparks, tests
- **OS state:**
  - evidence items with claim links
  - research tasks
  - gate assessments
  - approvals with input fingerprints
  - business cases
  - decision reports
- **Delivery:** roadmap, tasks
- **Platform records:** versions, audit_events, ai_runs

**Data architecture & trade-off.** Graph, tasks and artifacts are stored relationally with RLS. The design-studio and OS state are stored as typed JSON in `projects.settings`. This shipped without a schema migration, which the deployment environment did not permit at the time. It is versioned and audited the same way as the rest of the project. **Planned:** promote evidence, claims, approvals and business cases to their own tables once cross-project querying (the portfolio view) needs them. The prompt allows a relational graph model, so there is no graph database.

**Security model.** Implemented:
- Supabase Auth with RLS on every table (verified with a second user, who sees 0 rows)
- the model key held server-side only
- per-user daily AI cap and burst limits
- zod validation on all AI input and output
- user content wrapped in `<user_content>` tags and treated as data (prompt-injection resistance)
- AI output is applied as previewable patches and never writes to the database directly
- no compliance certifications claimed

Not yet: organisations / RBAC, SSO, file-upload scanning.

**Deployment.** GitHub → Vercel (git-connected; merging to `main` deploys to production) with Supabase Postgres in ap-south-1. Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_DAILY_LIMIT`.

**Major decisions.**
1. A modular monolith, not microservices.
2. All arithmetic, scoring, scheduling and policy run in tested TypeScript, outside the LLM.
3. Bounded single-call AI operations with schema-forced output, instead of an agent framework.
4. A deterministic dev provider, so the full workflow is testable offline and in CI.
5. Evidence confidence is computed from source type × reliability × verification × independence, never from model self-confidence.

---

## Deliverable 3 — UX blueprint

**Navigation** follows the lifecycle in four groups:
- **Discover:** Idea Brief · Knowledge Map · Problem Discovery
- **Create:** Ideation Studio · Concept Portfolio
- **Decide:** Evidence Lab · Decision Intelligence · Business Case · Validation Lab
- **Deliver:** Solution Studio · Delivery Planner

A lifecycle rail shows eleven stages: Thought → Discovery → Problem definition → Ideation → Evaluation → Validation → Investment decision → Solution design → Delivery planning → Execution → Value realisation. Each stage is marked complete from the data itself, not from a stored label. Any stage can be revisited.

**Critical journey (reference scenario):**
1. *“I want to improve the experience of purchasing premium handloom sarees online.”*
2. Idea brief.
3. Personas and journey low points.
4. HMW questions.
5. Sparks, voted and developed into concepts.
6. Evaluation.
7. Evidence logged: interviews and returns data.
8. Risk gates screened and confirmed.
9. Business case, with placeholders replaced by your own figures.
10. Decision report.
11. Named approval.
12. Blueprint, then roadmap.

Changing the evidence afterwards raises the impact-analysis alert.

**Interaction patterns:**
- every AI change is previewed or labelled, and can be undone
- AI vs dev vs user provenance is shown on every artefact
- confirmation before destructive actions
- empty, loading and error states on every view
- keyboard: ⌘Z / ⌘⇧Z for undo / redo, Alt+1…9 to switch views, ⌘F to search the map

**Design system:** warm-amber “thinking” and sage “execution” accents on a near-black canvas, with a light theme. Serif display type and sans UI type. Node-type colour tokens. Restrained motion that respects `prefers-reduced-motion`.

**Mobile:** read and review views work at narrow widths. The canvas and dense tables are desktop-first.

---

## Deliverable 4 — Functional specification (implemented core)

| Epic | Key stories & acceptance criteria | Business rules |
|---|---|---|
| Idea capture | Free-text thought → interpretation with ≤3 questions and alternative readings; brain dump → typed nodes as a preview patch | The original wording is preserved verbatim |
| Problem discovery | Personas marked *proto-persona* unless research notes support them; journeys with emotion; POV; HMW across 7 angles; Problem Confidence from linked evidence | Personas are hypotheses until evidence says otherwise |
| Ideation | 9 techniques; own sparks; clustering + whitespace; dot voting; converge top sparks into concepts; 4-tier generation; Challenge mode on any node | Near-duplicates dropped; the user's own ideas win ties |
| Evidence | Log typed, dated sources; link to problem / concept / assumption / node as supports or contradicts; duplicate check; freshness; contested-claim detection; research tasks | AI hypotheses have weight 0; one origin counts once |
| Decision intelligence | Weighted scoring with overrides, custom criteria and sensitivity; attractiveness × evidence quadrant; six mandatory gates; 7-status recommendation with reasons, blockers and next action; 8-question decision report; approve / reject / validate / hold / rework with a named person | See classifier rules below |
| Business case | 9 drivers with source labels; 3 scenarios + custom; NPV, IRR, payback, ROI, cost of delay, peak funding; tornado; formulas; input validation | Placeholder assumptions block approval |
| Validation | Assumption map (importance × evidence); test cards with pre-set thresholds; results write assumption and evidence nodes and change concept confidence | Invalidated major assumption = strong contradiction |
| Solution & delivery | Category-specific blueprint; roadmap with sanitised dependencies, computed dates, RACI, KPIs; tasks traceable to the root thought | A cycle is broken and reported, never silently kept |

**Classifier rules** (`lib/decision.ts`, thresholds exported and shown in the UI):
- Any failed gate → **REWORK**, which cannot be overridden.
- Unscored → **INVESTIGATE FURTHER**.
- Attractiveness < 35 with evidence → **REJECT**; < 45 → **HOLD**.
- Evidence < 25 → **VALIDATE**, or **INVESTIGATE FURTHER** if the problem itself is unevidenced.
- Evidence < 50 or attractiveness < 60 → **VALIDATE**.
- Gates unassessed or unconfirmed → **VALIDATE**.
- No business case, or AI placeholders still in it → **PROCEED TO BUSINESS CASE**.
- NPV ≤ 0 → **REWORK**.
- Otherwise → **APPROVE FOR DELIVERY**, which still needs a named human.

A human may approve against the recommendation only if every gate is confirmed and passed, and only with a written justification of at least 20 characters. That approval is recorded as an override.

**Exception scenarios covered by tests:**
- unsupported AI citations are stripped and reported
- invalid financial inputs are rejected
- dependency cycles are broken
- a failed gate blocks a top-scoring concept
- an unconfirmed AI gate does not count
- an assumption change after approval is flagged
- malformed AI requests are rejected before any model call
- AI output that fails the schema twice is not applied

**Role permissions:** single-owner projects enforced by RLS today. Organisation roles are a Phase 4 item.

---

## Deliverable 5 — Implementation plan

**Repository:** `src/app` (routes + the AI API), `src/components/views` (one file per workspace view), `src/lib` (pure domain services + store + repo + ai/), `supabase/migrations`, `tests`, `docs`.

**Build order:**
1. Done:
   - Phase 0 foundation
   - Phase 1 idea → decision slice (scoring, evidence, gates, report, approval, persistence)
   - Phase 2 business case and validation lab
   - Phase 3 blueprint and roadmap
2. Next:
   - relational tables for evidence, approvals and business cases, plus a migration
   - portfolio home
   - benefits register (baseline, target, actual)
   - three-point estimates and capacity-aware scheduling
3. Then:
   - organisations / RBAC
   - document uploads with RAG
   - live research with citations
   - DOCX / PDF / XLSX export
   - Jira / Azure DevOps connectors

**Testing strategy:**
- **Vitest:** scoring, finance, evidence, decision classifier, graph and scheduling, AI-schema contracts for every operation (dev provider), plus the adversarial cases above
- **Headless-Chrome walkthroughs:** the reference saree scenario end to end, and the design-studio loop
- **Every change:** typecheck, lint and build must pass

**Deployment strategy:** feature branch → PR → Vercel preview build → merge to `main` → production.

**MVP completion checklist:** see [CHECKLIST.md](CHECKLIST.md).
