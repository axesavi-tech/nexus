# NEXUS — the thought-to-execution intelligence engine

**Phase 1 MVP.** One unstructured thought → an editable mind map → divergent options → transparent evaluation → a recorded human decision → a solution blueprint → a scheduled delivery roadmap with traceable tasks. Everything runs end-to-end in the browser against Supabase.

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for product architecture, data model, AI orchestration and the implemented-vs-deferred matrix.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 4 · React Flow 12 · zustand · zod 4 · Supabase (Postgres + Auth + RLS) · Anthropic Claude via a provider-independent gateway · Vitest.

## Run locally

```bash
npm install
cp .env.example .env.local      # Supabase values are pre-filled; add ANTHROPIC_API_KEY
npm run dev                     # http://localhost:3000
```

| Configuration | Behaviour |
|---|---|
| Supabase vars set | Sign-in required; projects saved to Postgres with row-level security |
| Supabase vars empty | No sign-in; projects saved in this browser (`localStorage`) — development mode |
| `ANTHROPIC_API_KEY` set | Live AI (`ANTHROPIC_MODEL`, default `claude-sonnet-5-5`) |
| No AI key | **Dev templates** — deterministic placeholder output, labelled “Dev templates — not AI” in the header. Lets you exercise and test the whole workflow without spending tokens; it is not analysis. |

## Tests

```bash
npm test            # 18 tests: scoring maths, graph patching, cycle-breaking & scheduling,
                    # assumption propagation, framework metadata & recommendation, JSON-schema
                    # generation, and the full thought→roadmap pipeline for all five sample scenarios
npm run typecheck
npm run lint
```

Acceptance checks run during the build (headless Chrome against a production build, both local-storage and Supabase modes): sample B from home → interpretation → canvas → *Challenge this* preview → accept → undo/redo → Idea Lab → evaluate → decision → blueprint → roadmap → task traceability (task → milestone → solution → decision → idea → original thought) → reload persistence. Zero console errors. A second Supabase user was verified to see zero rows (RLS).

## Database

Supabase project **`nexus`** (ref `pnxuwejrdfgumtxmhxoi`, region ap-south-1). Schema: `supabase/migrations/20261116000000_nexus_core_schema.sql` (already applied). Tables: `projects, nodes, edges, artifacts, tasks, versions, audit_events, ai_runs` — all with RLS.

Before inviting real users, in the Supabase dashboard → Authentication:
1. **URL configuration** → set Site URL to your Vercel URL (sign-up confirmation links use it).
2. **Providers → Email** → keep “Confirm email” on (recommended) or turn it off for frictionless testing.
3. **Attack protection** → enable *Leaked password protection* (the only open security advisory).

## Deploy to Vercel

```bash
npm i -g vercel
vercel link                          # create project "nexus"
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add ANTHROPIC_API_KEY production
vercel env add AI_DAILY_LIMIT production      # optional, default 200
vercel --prod
```

The AI route sets `maxDuration = 60`; blueprint and roadmap calls typically take 15–40 s.

## Operational notes

* **Cost control:** per-user daily cap (`AI_DAILY_LIMIT`) enforced from `ai_runs`; per-minute burst limit; each operation sends only the focused sub-graph, not the whole map; max tokens are set per operation.
* **Failure handling:** invalid model output gets one corrective retry with the validation errors; if it still fails nothing is changed and the user sees the error. Failures are logged in `ai_runs`.
* **Data:** deleting a project cascades to all its nodes, edges, artifacts, tasks, versions and audit events. Export any project as Markdown from the header.
* **Model swap:** implement the `Provider` interface in `src/lib/ai/gateway.ts` (one method) to add OpenAI, Gemini or a local model.

## Project layout

```
src/
  app/                 page.tsx (Thought Room + Knowledge Vault), p/[id] (workspace), api/ai/[op] (AI gateway route)
  components/          Workspace shell, AuthGate, views/ (Thought, Canvas, IntelligencePanel, IdeaLab,
                       ConsultingBoard, SolutionStudio, ExecutionCockpit)
  lib/
    schemas.ts         domain types + zod schemas for every AI output
    graph.ts           patch application, layouts, traversal, roadmap sanitising & scheduling, assumption propagation
    scoring.ts         weighted scoring, provisional handling, sensitivity, Pareto, idea quality gate
    frameworks.ts      27-framework library with metadata + explainable recommender
    ai/                gateway (provider abstraction, validation, retry), prompts, dev templates
    store.ts           project aggregate, undo/redo, AI workflows
    repo.ts            Supabase and local persistence behind one interface
    export.ts          Markdown export / executive narrative
supabase/migrations/   SQL schema
tests/                 Vitest suites
docs/                  ARCHITECTURE.md
```
