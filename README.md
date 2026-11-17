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

The AI route sets `maxDuration = 300` (Fluid compute). Blueprint and roadmap calls can take 30–120 s. **Charging users requires Vercel Pro and Supabase Pro** (Vercel Hobby is non-commercial only; Supabase Free pauses after a week of inactivity and has no backups).

## Operational notes

* **Cost control:** per-user daily cap (`AI_DAILY_LIMIT`) enforced from `ai_runs`; per-minute burst limit; each operation sends only the focused sub-graph, not the whole map; max tokens are set per operation.
* **Failure handling:** invalid model output gets one corrective retry with the validation errors; if it still fails nothing is changed and the user sees the error. Failures are logged in `ai_runs`.
* **Data:** deleting a project cascades to all its nodes, edges, artifacts, tasks, versions and audit events. Export any project as Markdown from the header.
* **Model swap:** implement the `Provider` interface in `src/lib/ai/gateway.ts` (one method) to add OpenAI, Gemini or a local model.

## SaaS: workspace, billing, exports, security

**Private workspace.** Every account has its own Library (`/library`) of projects, isolated by Postgres row-level security. Account page (`/account`) shows credits, usage history, purchases, full data download (JSON), password change, sign-out-everywhere and permanent account deletion (DPDP Act / GDPR erasure).

**Pricing — prepaid credits at ≥ 3× fully loaded cost** (`src/lib/billing/pricing.ts`, tested in `tests/pricing.test.ts`):

```
cost(₹)  = (input_tokens × $2 + output_tokens × $10) / 1M × COST_USD_INR  +  COST_INFRA_MONTHLY_INR / COST_EXPECTED_REQUESTS_PER_MONTH
credits  = ceil( PRICING_MARGIN × cost / (1 − COST_GATEWAY_FEE) )      — charged on actual tokens, retries included
```

Credits are never sold below ₹1, so every request nets ≥ 3× its cost after gateway fees. Packs: Spark ₹299 / 250 cr (3.59×), Builder ₹999 / 900 cr (3.33×), Studio ₹2,999 / 2,850 cr (3.16×). New accounts get 75 welcome credits. Failed AI steps are not charged. Balance is checked before each step (HTTP 402 if short).

**Payments — Cashfree** (individual onboarding with PAN + Aadhaar + bank account; zero setup fee). Flow: `POST /api/billing/checkout` creates the order server-side (price from the server pack table) → Cashfree JS checkout → `POST /api/billing/webhook` (HMAC-SHA256 signature over timestamp + raw body, then re-fetches the order from Cashfree and checks the exact amount) → `nexus_complete_order()` grants credits idempotently. `/api/billing/verify` repeats the same check when the buyer returns, so credits appear even if the webhook is late. In the Cashfree dashboard: whitelist your domain and set the webhook URL to `https://<your-domain>/api/billing/webhook`.

**Ledger integrity.** `billing_wallets`, `billing_ledger`, `billing_orders` are read-only to users (RLS select-own). Credits move only through `nexus_charge` / `nexus_complete_order` (SECURITY DEFINER, executable by `service_role` only). Migration: `supabase/migrations/20261117100000_billing_and_privacy.sql` (applied).

**Exports** (`src/lib/exporters/`): one document model rendered as a designed PDF (cover, contents, page numbers), Word (styled headings/tables), PowerPoint (16:9 brand deck), Markdown, CSV task list (formula-injection safe) and JSON — all generated in the browser.

**Security headers** (`next.config.ts`): CSP, HSTS (preload), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy. Functions pinned to Mumbai (`vercel.json` → `bom1`). Policies at `/legal/*`, linked from every page footer.

**Required environment for billing:** `SUPABASE_SERVICE_ROLE_KEY`, `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV`, `APP_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`. Without the service key, billing is off and AI use is unmetered (development). See `.env.example`.

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
