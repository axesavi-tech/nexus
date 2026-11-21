# Implementation checklist — Idea → Outcome OS

Legend: ✅ coded & tested · 🟡 partial · ⏳ deferred (backlog) · ⛔ blocked

“Tested” means an automated test covers it (`npm test`), a headless-browser walkthrough has exercised it, or both. Last update: 2026-11-21.

## Phase 0 — Foundation
| Capability | Status | Notes |
|---|---|---|
| Next.js + TS app shell, design system, dark/light | ✅ | |
| Auth (Supabase) + RLS on every table | ✅ | Verified with a second user |
| AI abstraction (provider interface, schema-forced output, validation, retry) | ✅ | Anthropic Claude; dev provider when no key |
| Audit events, versions, AI usage accounting | ✅ | `audit_events`, `versions`, `ai_runs` |
| Organisations, memberships, roles, RBAC | ⏳ | Phase 4 |

## Phase 1 — Idea → decision
| Capability | Status | Notes |
|---|---|---|
| Idea capture (text, modes, brain dump) | ✅ | Voice, files, URLs ⏳ |
| Knowledge map: typed nodes and edges, collapse, cross-links, versions | ✅ | Comments ⏳ |
| Problem discovery: personas as hypotheses, journeys, POV, HMW | ✅ | |
| Problem Confidence Indicator (evidence-based) | ✅ | `problemConfidence` |
| JTBD / Five Whys / Fishbone / Issue tree / OST via the framework engine | ✅ | Applied as node actions |
| Interview guide generation | ⏳ | |
| Ideation: 9 spark techniques, 4-tier concepts, clustering, dot voting, convergence | ✅ | TRIZ, Blue Ocean etc. available as frameworks on nodes |
| AI Challenge mode | ✅ | `challenge`, `missing`, `different` node actions |
| Concept merge / reject / compare | 🟡 | Reject and compare ✅; merge on the canvas ✅; concept split ⏳ |
| Evidence register (typed, dated, reliability, verification, links) | ✅ | |
| Duplicate-source, freshness, contradiction detection | ✅ | |
| Research-gap tasks (no invented findings) | ✅ | Live retrieval and RAG ⏳ |
| Weighted scoring, overrides, custom criteria, sensitivity, Pareto | ✅ | |
| Attractiveness vs evidence confidence, kept separate | ✅ | Quadrant chart |
| Mandatory risk & policy gates (human-confirmed) | ✅ | |
| 7-status recommendation with reasons, blockers, next action | ✅ | |
| Explainable 8-question decision report with citation integrity | ✅ | Unknown citations stripped and flagged |
| Human approval / reject / validate / hold / rework, decision history | ✅ | Override needs a justification; gates are never overridable |
| Impact analysis: stale approvals, reports, blueprint, roadmap | ✅ | Input fingerprinting |
| Independent multi-stakeholder scoring | ⏳ | Needs organisations |
| Persist and reopen the complete project | ✅ | |

## Phase 2 — Commercial & validation
| Capability | Status | Notes |
|---|---|---|
| Business case: NPV, IRR, payback, ROI, gross margin, TCO, cost of delay, peak funding | ✅ | Deterministic, formulas inspectable |
| Scenarios (conservative / base / optimistic / custom), tornado | ✅ | |
| AI-suggested drivers labelled as placeholders; approval blocked until replaced | ✅ | |
| Tax, depreciation, working capital, EBITDA vs cash | ⏳ | Stated as simplifications in the UI |
| Monte-Carlo simulation | ⏳ | Only with user-supplied distributions |
| Experiment design (assumption map, test cards, prototypes, thresholds) | ✅ | Validation Lab |
| Result capture → assumption and evidence nodes → confidence and decision updates | ✅ | |
| Persevere / pivot / stop outcome on experiments | 🟡 | Captured as results and learning; explicit pivot outcome ⏳ |
| Investment memo export | 🟡 | Markdown export includes the report, case and history; DOCX/PDF ⏳ |

## Phase 3 — Solution & delivery
| Capability | Status | Notes |
|---|---|---|
| Category-specific solution blueprint | ✅ | PRD-style sections for software |
| Architecture diagrams, BPMN editor | ⏳ | |
| Roadmap: phases, milestones, tasks, dependencies, RACI, KPIs | ✅ | |
| Deterministic scheduling + cycle breaking | ✅ | Working calendar, capacity, 3-point estimates ⏳ |
| Outcome → initiative → epic → feature → story → task hierarchy | 🟡 | Milestone → task today |
| Traceability task → milestone → solution → decision → idea → thought | ✅ | |
| Jira / Azure DevOps export | ⏳ | |

## Phase 4 — Enterprise maturity
| Capability | Status | Notes |
|---|---|---|
| Portfolio home, executive dashboard | ⏳ | Project vault only |
| Benefits realisation (baseline / target / actual) | ⏳ | |
| Admin console, templates, feature flags | ⏳ | |
| SSO, tenant isolation across organisations | ⏳ | |
| Relational tables for evidence, approvals, business cases | ⏳ | Stored as JSON in `projects.settings` today; the migration needs DB-change approval |

## Reference scenarios
| Scenario | Status |
|---|---|
| Premium handloom sarees online (D2C) — idea → evidence → gates → business case → report → approval → impact alert | ✅ Browser walkthrough in dev mode |
| Customer onboarding 12 → 3 days (enterprise transformation) | ✅ AI operation tests; available as Sample B |

## Guided founder journey (Nov 2026)
| Capability | Status | Notes |
|---|---|---|
| Clean 9-step AI-guided journey (default `/p/[id]`); no node/mind-map visuals | ✅ | Advanced workspace at `/p/[id]/workspace` |
| Country selection — all 249 ISO 3166 countries and territories | ✅ | |
| Company-setup guide: legal form, registration, tax, banking, licences, hiring, IP, data, sector, ongoing | ✅ | Live web research with Claude; curated offline baseline for IN, GB, US, SG, AE, AU, CA; generic checklist otherwise |
| Link integrity: only search-retrieved or curated official URLs kept; removed count shown | ✅ | Unit-tested |
| Server-side link checker (https only, no IP/localhost, redirects not followed) | ✅ | “opens / not found / couldn't auto-check” |
| Setup steps tracked as a checklist and carried into the delivery plan and summary | ✅ | |
| One-page plan: download (Markdown) and print to PDF | ✅ | |
| Caching shared research per country across users | ⏳ | Needs a shared table (migration approval) |
| Regional variation (US state, Indian state, UAE emirate) as a selectable sub-region | ⏳ | Currently noted in caveats and research prompt |
