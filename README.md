# NEXUS · Idea → Outcome OS

> From a thought to a defensible investment decision. From an approved idea to an executable delivery plan.

**Guided founder journey (default experience):** a clean, AI-guided, nine-step path with no mind maps or node diagrams:
1. Idea
2. What it's really about
3. Customers
4. Ways to do it
5. Cheap tests
6. The numbers
7. **Company setup for any country**
8. Delivery plan
9. One-page summary

Company setup works for all 249 ISO countries and territories. With an AI key, Claude researches official sources live with web search. Only links that came from those search results, or from curated official portals, are kept, and the app checks that each one opens. Curated baselines (IN, GB, US, SG, AE, AU, CA) work offline. The full analytical workspace is still one click away under **Advanced**.

**Privacy:** ideas are end-to-end encrypted in the browser with a vault passphrase and a recovery key, so the operator cannot read them. See [docs/SECURITY.md](docs/SECURITY.md).

**Business model:**
- **Founders (hybrid):** free taster, Plan Pass ₹999 per idea, Founder ₹999/month for 3 ideas, Pro ₹2,999/month for 8 ideas, extra ideas ₹349. Payments go through Razorpay.
- **Professionals directory:** Verified ₹2,999, Featured ₹9,999 and Premium partner ₹24,999 per year. Premium listings appear inside matching setup steps, labelled Sponsored.
- **Admin:** listings are reviewed at `/admin/directory`.

**Start here:** [docs/FOUNDATION.md](docs/FOUNDATION.md) (product, architecture, UX, functional spec, plan) · [docs/CHECKLIST.md](docs/CHECKLIST.md) (what's built, tested and deferred).

**Decision intelligence (new):**
- **Evidence Lab:** typed, dated, verifiable sources linked to claims; confidence is computed from evidence quality and independence; research tasks for the gaps.
- **Decision Intelligence:** attractiveness × evidence confidence; six mandatory risk and policy gates; a seven-status recommendation; an explainable eight-question report with citation checks; named human approval; stale-approval impact analysis.
- **Business Case:** deterministic NPV, IRR, payback, ROI and cost of delay, with scenarios, a tornado chart and inspectable formulas.



**Design Studio (new):** a full design-thinking loop on the same graph — **Empathize** (personas grounded in your research notes or flagged as proto-personas, empathy maps, emotional journey maps) → **Define** (insights, point-of-view statements, How Might We questions) → **Ideate** (spark board with 9 techniques — open brainstorm, SCAMPER, analogies, worst-possible-idea, extreme constraints, Crazy 8s, persona lens, trend mash-up, "Yes, and…" — your own sparks, theme clustering with unexplored angles, dot voting, convergence into concepts) → **Prototype & Test** (assumption map of importance × evidence, test cards with success thresholds set in advance, storyboard, results that write evidence to the map and flag downstream work when an assumption fails). **Brain dump** on the canvas turns messy notes into typed nodes for review.

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
npm test            # 53 tests (incl. finance, evidence, decision classifier, adversarial cases): scoring maths, graph patching, cycle-breaking & scheduling,
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

## Switching on payments and the directory

1. Apply `supabase/migrations/20261121100000_billing_directory.sql` in the Supabase SQL editor (or ask Claude to apply it).
2. In Vercel → Settings → Environment Variables (Production), add:

| Variable | What it is |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project settings → API → service_role. Server only; used to record verified payments and to moderate listings. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay Dashboard → Account & Settings → API keys. Start with **test** keys. |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay → Webhooks → add `https://<your-domain>/api/billing/webhook`, events `payment.captured` and `order.paid`. |
| `ADMIN_EMAILS` | Comma-separated emails allowed to approve listings. |
| `BILLING_ENFORCE` | Optional. Set to `0` to keep payments on but switch the paywall off. |

The paywall switches itself on only when the Razorpay keys and the service-role key are all set, so nobody is blocked from something they can't buy.

3. Move Vercel to **Pro** before taking money: Hobby is for non-commercial use only.

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

The AI route sets `maxDuration = 300` (Fluid compute; allowed on Hobby). Blueprint and roadmap calls can take 30–120 s.

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
    design.ts          design-thinking techniques, dot voting, convergence, assumption-map maths
    frameworks.ts      27-framework library with metadata + explainable recommender
    ai/                gateway (provider abstraction, validation, retry), prompts, dev templates
    store.ts           project aggregate, undo/redo, AI workflows
    repo.ts            Supabase and local persistence behind one interface
    export.ts          Markdown export / executive narrative
supabase/migrations/   SQL schema
tests/                 Vitest suites
docs/                  ARCHITECTURE.md
```
