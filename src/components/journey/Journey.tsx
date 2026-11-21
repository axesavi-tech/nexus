"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { emptyGuide, useNexus } from "@/lib/store";
import { useProject } from "../useProject";
import { COUNTRIES, countryByCode } from "@/lib/countries";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/setup";
import { recommendAll, STATUS_LABEL, STATUS_TONE } from "@/lib/decision";
import { PROTOTYPE_LABEL, rankAssumptions, quadrant } from "@/lib/design";
import { FIN_DRIVERS, type FinDriver, type GuideState, type ProjectState, type TestStatus } from "@/lib/schemas";
import { DRIVER_META, fmtMoney, metrics, scenarioTable, validateInputs } from "@/lib/finance";
import { download, toMarkdown } from "@/lib/export";
import { Spinner } from "../ui";

// ------------------------------------------------------------------ steps
const STEPS = [
  { id: "idea", title: "Your idea" },
  { id: "understand", title: "What it's really about" },
  { id: "customers", title: "Your customers" },
  { id: "options", title: "Ways to do it" },
  { id: "validate", title: "Test before you spend" },
  { id: "numbers", title: "The numbers" },
  { id: "setup", title: "Set up the company" },
  { id: "plan", title: "Delivery plan" },
  { id: "summary", title: "Your plan on a page" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

const CURRENCY: Record<string, string> = { IN: "INR", US: "USD", GB: "GBP", SG: "SGD", AE: "AED", AU: "AUD", CA: "CAD", JP: "JPY", CH: "CHF" };
const EURO = new Set(["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES"]);
const currencyFor = (code: string) => CURRENCY[code] ?? (EURO.has(code) ? "EUR" : "USD");

function done(p: ProjectState, s: StepId): boolean {
  const sel = p.selectedIdeaId;
  switch (s) {
    case "idea": return !!p.interpretation;
    case "understand": return !!p.interpretation && STEPS.findIndex((x) => x.id === (p.guide?.step ?? "idea")) > 1;
    case "customers": return !!p.design?.empathy;
    case "options": return !!sel;
    case "validate": return !!sel && !!p.design?.tests.some((t) => t.ideaId === sel);
    case "numbers": return !!sel && !!p.os?.businessCases.some((b) => b.ideaId === sel);
    case "setup": return !!p.guide?.setup;
    case "plan": return !!p.roadmap;
    case "summary": return !!p.roadmap && !!p.guide?.setup;
  }
}

/** The AI guide's voice: deterministic, context-aware advice for the current step. */
function guideSays(p: ProjectState, s: StepId): string {
  const sel = p.ideas?.ideas.find((i) => i.id === p.selectedIdeaId);
  const country = countryByCode(p.guide?.country ?? "")?.name ?? "your country";
  switch (s) {
    case "idea": return p.interpretation ? "Got it. If you change the idea or the country, re-analyse — everything downstream follows from this." : "Tell me your idea in a sentence or two, where you'll set up, and how far along you are. I'll take you from here to a delivery plan, one step at a time.";
    case "understand": {
      const q = p.interpretation?.clarifyingQuestions.filter((x) => !p.answers[x.question]?.trim()).length ?? 0;
      return q ? `Here's how I read your idea. ${q} quick question${q > 1 ? "s" : ""} below would change the direction most — answer what you can, then update.` : "This is the problem I think you're solving. If anything is off, edit your idea in step 1 and re-analyse. Otherwise, let's look at who has this problem.";
    }
    case "customers": return p.design?.empathy ? `${p.design.empathy.personas.some((x) => x.basis === "proto_persona") ? "These profiles are educated guesses, not research. Talk to 5 real people like them this week — it is the cheapest way to avoid building the wrong thing." : "These profiles are grounded in what you told me."} Next: different ways to solve their problem.` : "Great businesses start with a painful problem for specific people. If you've spoken to customers, paste what they said — I'll use it. If not, I'll draft profiles you can check.";
    case "options": {
      if (!p.ideas) return "Let's widen the options before choosing. I'll suggest four genuinely different approaches — from safe to bold.";
      if (!p.evaluation) return "Here are different ways to do it. Ask me to compare them, or choose the one that feels right — you decide.";
      const top = recommendAll(p).sort((a, b) => (b.attractiveness ?? 0) - (a.attractiveness ?? 0))[0];
      return sel ? `You chose “${sel.title}”. Next, let's find the cheapest way to check it works before spending money.` : `On paper “${top?.title}” scores best (${top?.attractiveness}), but scores are judgements, not proof. Choose the one you'd bet on.`;
    }
    case "validate": {
      const rec = p.design?.tests.find((t) => t.ideaId === p.selectedIdeaId);
      if (!rec) return `Before spending on “${sel?.title ?? "your idea"}”, let's find what must be true and the cheapest test for each.`;
      const open = rankAssumptions(rec).find((a) => quadrant(a) === "test_first" && !["validated", "invalidated"].includes(rec.results[a.id]?.status ?? "untested"));
      const failed = Object.values(rec.results).some((r) => r.status === "invalidated");
      if (failed) return "A test failed — that's valuable. Consider adjusting the idea or choosing another direction before you invest.";
      return open ? `Start with the riskiest one: “${open.statement}”. Record what you learn here.` : "Your riskiest assumptions have results. Let's check the numbers.";
    }
    case "numbers": {
      const bc = p.os?.businessCases.find((b) => b.ideaId === p.selectedIdeaId);
      if (!bc) return "Let's sketch the money side: what you'd sell, for how much, what it costs, and what you need upfront. I can suggest starting numbers — you replace them with real ones.";
      const placeholders = Object.values(bc.sources).filter((x) => x && x.by !== "user").length;
      if (validateInputs(bc.inputs).length) return "Some numbers need fixing before I can calculate.";
      const m = metrics(bc.inputs, bc.scenarios.base), c = metrics(bc.inputs, bc.scenarios.conservative);
      return `${placeholders ? `${placeholders} number${placeholders > 1 ? "s are" : " is a"} placeholder${placeholders > 1 ? "s" : ""} — replace with your real figures. ` : ""}${m.npv >= 0 ? `On these assumptions it pays back in ${m.paybackYears?.toFixed(1) ?? "—"} years.` : "On these assumptions it doesn't pay back within the horizon."} ${c.npv < 0 ? "In the cautious scenario it loses money — keep upfront spend small and stage it." : ""}`;
    }
    case "setup": return p.guide?.setup ? `Here's what ${country} requires. Tick steps off as you go; links are checked automatically. This is guidance, not legal advice — confirm with a local professional.` : `Now the legal side. I'll research what it takes to set up this business in ${country}: legal form, registration, tax, banking, licences, hiring and ongoing filings — with official links.`;
    case "plan": return p.roadmap ? "Here's your plan. Start with the first task this week — momentum beats perfect plans." : "Finally, I'll turn everything into a step-by-step delivery plan with dates.";
    case "summary": return "Your whole plan on one page. Download it, share it with a co-founder or advisor, and come back to update it as you learn.";
  }
}

// ------------------------------------------------------------------ shell
export function Journey({ id }: { id: string }) {
  const p = useProject(id);
  const { busy, error, clearError, saveState, guide } = useNexus();
  const [theme, setTheme] = useState<"dark" | "light">("light");
  useEffect(() => { setTheme((document.documentElement.dataset.theme as "dark" | "light") ?? "light"); }, []);
  const step = (p?.guide?.step ?? "idea") as StepId;
  const idx = STEPS.findIndex((s) => s.id === step);
  const go = (s: StepId) => { guide((g) => ({ ...g, step: s })); document.getElementById("nx-main")?.scrollTo({ top: 0 }); };

  if (!p) return <div className="h-screen grid place-items-center">{error ? <div className="text-center"><p className="text-danger mb-4">{error}</p><Link className="btn" href="/">Back</Link></div> : <Spinner label="Opening…" />}</div>;
  const toggleTheme = () => { const t = theme === "dark" ? "light" : "dark"; setTheme(t); document.documentElement.dataset.theme = t; try { localStorage.setItem("nexus:theme", t); } catch {} };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="h-14 shrink-0 flex items-center gap-3 px-5 border-b border-line bg-bg2 print:hidden">
        <Link href="/" className="flex items-center gap-2 pr-3 border-r border-line"><span className="text-accent">◉</span><span className="tracking-[.3em] text-xs font-semibold">NEXUS</span></Link>
        <input className="bg-transparent serif text-lg flex-1 min-w-0 outline-none focus:bg-panel rounded px-2" value={p.title} aria-label="Project title"
          onChange={(e) => useNexus.getState().setQuiet((c) => ({ ...c, title: e.target.value }))} />
        {p.aiMode === "dev" && <span className="chip !border-warn !text-warn" title="No AI key configured">Offline templates</span>}
        <span className="text-xs text-ink3 w-16 text-right" aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "⚠ Not saved" : ""}</span>
        <Link href={`/p/${p.id}/workspace`} className="btn btn-ghost text-xs" title="Detailed analysis: evidence, scoring, gates and full models">Advanced</Link>
        <button className="btn btn-ghost !px-2" onClick={toggleTheme} aria-label="Toggle theme">{theme === "dark" ? "☀" : "☾"}</button>
      </header>
      <div className="flex flex-1 min-h-0">
        <nav className="w-64 shrink-0 border-r border-line bg-bg2 py-6 px-4 hidden md:block print:hidden" aria-label="Steps">
          <ol className="space-y-1">
            {STEPS.map((s, i) => {
              const d = done(p, s.id);
              return (
                <li key={s.id}>
                  <button onClick={() => go(s.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition ${step === s.id ? "bg-panel shadow-sm text-ink" : "text-ink2 hover:bg-panel"}`} aria-current={step === s.id ? "step" : undefined}>
                    <span className={`h-6 w-6 shrink-0 rounded-full grid place-items-center text-[11px] font-semibold ${d ? "bg-accent2 text-white" : step === s.id ? "bg-accent text-white" : "border border-line2 text-ink3"}`}>{d ? "✓" : i + 1}</span>
                    {s.title}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <main id="nx-main" className="flex-1 overflow-auto scroll-thin relative">
          <div className="max-w-3xl mx-auto px-6 py-10 fade-in" key={step}>
            <div className="label mb-2">Step {idx + 1} of {STEPS.length}</div>
            <h1 className="serif text-4xl mb-6">{STEPS[idx].title}</h1>
            <div className="flex gap-3 items-start mb-8 print:hidden" role="note" aria-label="Guide">
              <div className="h-9 w-9 shrink-0 rounded-full grid place-items-center bg-accent text-white text-sm" aria-hidden>◉</div>
              <div className="card px-4 py-3 text-[15px] leading-relaxed flex-1">{busy ? <Spinner label={busy} /> : guideSays(p, step)}</div>
            </div>
            {error && <div className="card p-3 mb-6 !border-danger text-sm flex gap-3" role="alert"><span className="flex-1 text-danger">{error}</span><button onClick={clearError} aria-label="Dismiss">✕</button></div>}
            {step === "idea" && <IdeaStep p={p} next={() => go("understand")} />}
            {step === "understand" && <UnderstandStep p={p} />}
            {step === "customers" && <CustomersStep p={p} />}
            {step === "options" && <OptionsStep p={p} />}
            {step === "validate" && <ValidateStep p={p} back={() => go("options")} />}
            {step === "numbers" && <NumbersStep p={p} />}
            {step === "setup" && <SetupStep p={p} />}
            {step === "plan" && <PlanStep p={p} back={() => go("options")} />}
            {step === "summary" && <SummaryStep p={p} />}
            <div className="flex justify-between items-center mt-12 pt-6 border-t border-line print:hidden">
              <button className="btn btn-ghost" disabled={idx === 0} onClick={() => go(STEPS[idx - 1].id)}>← Back</button>
              {idx < STEPS.length - 1 && <button className="btn btn-primary" disabled={!!busy || (step === "idea" && !p.interpretation)} onClick={() => go(STEPS[idx + 1].id)}>Continue to {STEPS[idx + 1].title.toLowerCase()} →</button>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ shared bits
const Box = ({ title, children, tone }: { title?: string; children: React.ReactNode; tone?: string }) => (
  <section className="card p-5 mb-4" style={tone ? { borderLeft: `3px solid ${tone}` } : undefined}>
    {title && <h2 className="text-[13px] uppercase tracking-wider font-semibold text-ink3 mb-2">{title}</h2>}
    {children}
  </section>
);
const List = ({ items, dot = "var(--ink-3)" }: { items: string[]; dot?: string }) => (
  <ul className="space-y-1.5">{items.map((x) => <li key={x} className="flex gap-2 text-[15px]"><span className="mt-2 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: dot }} />{x}</li>)}</ul>
);
const Big = ({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
  <button className="btn btn-primary !px-6 !py-3 text-base" onClick={onClick} disabled={disabled}>{children}</button>
);

// ------------------------------------------------------------------ 1. idea
export const STAGES: { id: GuideState["stage"]; label: string }[] = [
  { id: "idea", label: "Just an idea" }, { id: "prototype", label: "Building a prototype" }, { id: "customers", label: "Have first customers" }, { id: "revenue", label: "Making revenue" },
];
function IdeaStep({ p, next }: { p: ProjectState; next: () => void }) {
  const { setQuiet, checkpoint, guide, analyze, busy } = useNexus();
  const g = p.guide ?? emptyGuide();
  const run = async () => { await analyze(); if (!useNexus.getState().error) next(); };
  return (
    <>
      <label className="block mb-5"><span className="text-sm text-ink2">What do you want to build?</span>
        <textarea className="input mt-1 serif !text-xl leading-snug" rows={4} value={p.thought} onFocus={checkpoint} onChange={(e) => setQuiet((c) => ({ ...c, thought: e.target.value }))} />
      </label>
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <label className="block"><span className="text-sm text-ink2">Where will you set up the business?</span>
          <select className="input mt-1" value={g.country} onChange={(e) => guide((x) => ({ ...x, country: e.target.value, setup: null, setupDone: {}, linkStatus: {} }), "guide.country")}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
        </label>
        <div><span className="text-sm text-ink2">How far along are you?</span>
          <div className="flex flex-wrap gap-2 mt-1.5" role="radiogroup">
            {STAGES.map((s) => <button key={s.id} role="radio" aria-checked={g.stage === s.id} className={`chip ${g.stage === s.id ? "!border-accent !text-accent" : ""}`} onClick={() => guide((x) => ({ ...x, stage: s.id }))}>{s.label}</button>)}
          </div>
        </div>
        <label className="block"><span className="text-sm text-ink2">Who&apos;s on the team? <span className="text-ink3">(optional)</span></span>
          <input className="input mt-1" value={g.team} onChange={(e) => setQuiet((c) => ({ ...c, guide: { ...(c.guide ?? emptyGuide()), team: e.target.value } }))} placeholder="e.g. Me full-time, a designer friend part-time" /></label>
        <label className="block"><span className="text-sm text-ink2">Budget to start <span className="text-ink3">(optional)</span></span>
          <input className="input mt-1" value={g.budget} onChange={(e) => setQuiet((c) => ({ ...c, guide: { ...(c.guide ?? emptyGuide()), budget: e.target.value } }))} placeholder="e.g. ₹5 lakh savings" /></label>
      </div>
      <Big onClick={run} disabled={!!busy || !p.thought.trim()}>{p.interpretation ? "Re-analyse my idea" : "Analyse my idea →"}</Big>
    </>
  );
}

// ------------------------------------------------------------------ 2. understand
function UnderstandStep({ p }: { p: ProjectState }) {
  const { set, analyze, busy } = useNexus();
  const I = p.interpretation;
  const [ans, setAns] = useState<Record<string, string>>(p.answers);
  const [more, setMore] = useState(false);
  if (!I) return <p className="text-ink2">Analyse your idea in step 1 first.</p>;
  return (
    <>
      <Box title="The problem you're solving" tone="var(--accent)"><p className="serif text-xl leading-snug">{I.problemOrOpportunity}</p><p className="text-sm text-ink2 mt-2">{I.intention}</p></Box>
      <div className="grid sm:grid-cols-2 gap-4">
        <Box title="Who benefits"><List items={I.beneficiaries} dot="var(--t-stakeholder)" /></Box>
        <Box title="What success looks like"><List items={I.desiredOutcomes} dot="var(--ok)" /></Box>
        <Box title="What we're assuming"><List items={I.assumptions} dot="var(--warn)" /></Box>
        <Box title="What we don't know yet"><List items={I.missingInformation} dot="var(--t-question)" /></Box>
      </div>
      {I.clarifyingQuestions.length > 0 && (
        <Box title="A few quick questions">
          <div className="space-y-4">
            {I.clarifyingQuestions.map((q) => (
              <label key={q.question} className="block"><span className="font-medium">{q.question}</span><span className="block text-xs text-ink3 mb-1">{q.why}</span>
                <input className="input" value={ans[q.question] ?? ""} onChange={(e) => setAns({ ...ans, [q.question]: e.target.value })} /></label>
            ))}
            <button className="btn" disabled={!!busy || !Object.values(ans).some((v) => v.trim())} onClick={async () => { set((c) => ({ ...c, answers: ans }), "answers.updated"); await analyze(); }}>Update with my answers</button>
          </div>
        </Box>
      )}
      <button className="text-sm text-ink3 hover:text-ink" onClick={() => setMore(!more)}>{more ? "Hide" : "Show"} other ways to read your idea</button>
      {more && <div className="mt-3 space-y-2">{I.alternativeInterpretations.map((a) => <div key={a.label} className="card p-3 text-sm"><b>{a.label}:</b> {a.description}</div>)}</div>}
    </>
  );
}

// ------------------------------------------------------------------ 3. customers
function CustomersStep({ p }: { p: ProjectState }) {
  const { setQuiet, checkpoint, empathize, busy } = useNexus();
  const E = p.design?.empathy;
  const [showNotes, setShowNotes] = useState(!E);
  return (
    <>
      {showNotes && (
        <Box title="What customers have told you (optional)">
          <textarea className="input text-sm" rows={4} value={p.design?.notes ?? ""} onFocus={checkpoint} maxLength={20000}
            onChange={(e) => setQuiet((c) => ({ ...c, design: { ...(c.design ?? { notes: "", empathy: null, hmws: [], activeHmwId: null, sparks: [], clusters: [], whitespace: [], tests: [] }), notes: e.target.value } }))}
            placeholder="Paste quotes, reviews, messages, survey answers… e.g. “I never buy sarees online because I can't feel the fabric.”" />
          <div className="mt-3"><Big onClick={async () => { await empathize(); setShowNotes(false); }} disabled={!!busy}>{E ? "Rebuild customer profiles" : "Build customer profiles →"}</Big></div>
        </Box>
      )}
      {E && (
        <>
          {E.personas.map((ps) => {
            const low = [...ps.journey].sort((a, b) => a.emotion - b.emotion)[0];
            return (
              <Box key={ps.id}>
                <div className="flex flex-wrap items-baseline gap-2 mb-1"><h3 className="serif text-2xl">{ps.name}</h3><span className="text-ink2">{ps.role}</span>
                  {ps.basis === "proto_persona" ? <span className="chip !text-[11px] !border-warn !text-warn">educated guess — check with real people</span> : <span className="chip !text-[11px] !border-ok !text-ok">based on your notes</span>}</div>
                {ps.quote && <p className="serif text-lg text-ink2 mb-3">“{ps.quote.replace(/^["“]|["”]$/g, "")}”</p>}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div><div className="text-xs font-semibold uppercase tracking-wider text-danger mb-1">Frustrations</div><List items={ps.pains} dot="var(--danger)" /></div>
                  <div><div className="text-xs font-semibold uppercase tracking-wider text-ok mb-1">What they want</div><List items={ps.goals} dot="var(--ok)" /></div>
                </div>
                {low && <p className="text-sm mt-3 p-3 rounded-lg bg-bg2"><b>Hardest moment:</b> {low.stage} — {low.pain} <span className="text-ink3">→ opportunity: {low.opportunity}</span></p>}
              </Box>
            );
          })}
          <Box title="Problems worth solving" tone="var(--t-insight)">
            <ul className="space-y-2">{E.povs.map((v) => <li key={v.id} className="serif text-[17px] leading-snug">{v.user} needs {v.need} — because {v.insight}.</li>)}</ul>
          </Box>
          {E.researchGaps.length > 0 && <Box title="Go and find out this week"><List items={E.researchGaps} dot="var(--accent)" /></Box>}
          {!showNotes && <button className="text-sm text-ink3 hover:text-ink" onClick={() => setShowNotes(true)}>Add what customers told you and rebuild</button>}
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ 4. options
function OptionsStep({ p }: { p: ProjectState }) {
  const { ideate, evaluate, chooseConcept, busy } = useNexus();
  const recs = useMemo(() => recommendAll(p), [p]);
  const [open, setOpen] = useState<string | null>(null);
  if (!p.ideas) return <Big onClick={() => ideate()} disabled={!!busy || !p.interpretation}>Show me ways to do it →</Big>;
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-5">
        {!p.evaluation && <button className="btn" disabled={!!busy} onClick={evaluate}>Compare them for me</button>}
        <button className="btn btn-ghost" disabled={!!busy} onClick={() => { if (!p.selectedIdeaId || confirm("Generate a new set of options? Your current choice will need to be made again.")) ideate(); }}>Suggest different options</button>
      </div>
      <div className="space-y-3">
        {p.ideas.ideas.map((i) => {
          const r = recs.find((x) => x.ideaId === i.id);
          const chosen = p.selectedIdeaId === i.id;
          return (
            <article key={i.id} className={`card p-5 transition ${chosen ? "!border-accent shadow-md" : ""}`}>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-ink3">{i.tier === "conservative" ? "Safe" : i.tier === "practical" ? "Balanced" : i.tier === "disruptive" ? "Bold" : "Moonshot"}</span>
                {p.evaluation && r?.attractiveness != null && <span className="text-xs text-ink3">· score {r.attractiveness}/100</span>}
                {chosen && <span className="chip !text-[11px] !border-accent !text-accent ml-auto">Your choice</span>}
              </div>
              <h3 className="serif text-2xl leading-snug mb-1">{i.title}</h3>
              <p className="text-[15px] text-ink2 mb-2">{i.summary}</p>
              <p className="text-sm"><b>For:</b> {i.targetUsers}</p>
              <p className="text-sm"><b>Why they&apos;d care:</b> {i.valueProposition}</p>
              {open === i.id && (
                <div className="text-sm mt-2 space-y-1 fade-in">
                  <p><b>How it works:</b> {i.howItWorks}</p>
                  <p><b>What makes it different:</b> {i.differentiator}</p>
                  {i.keyAssumptions.length > 0 && <p className="text-warn"><b>Only works if:</b> {i.keyAssumptions.join("; ")}</p>}
                  {i.risks.length > 0 && <p><b>Risks:</b> {i.risks.join("; ")}</p>}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <button className={chosen ? "btn" : "btn btn-primary"} disabled={chosen} onClick={() => chooseConcept(i.id)}>{chosen ? "Chosen" : "Choose this"}</button>
                <button className="btn btn-ghost" onClick={() => setOpen(open === i.id ? null : i.id)}>{open === i.id ? "Less" : "More detail"}</button>
              </div>
            </article>
          );
        })}
      </div>
      {p.ideas.notes && <p className="text-sm text-ink3 mt-4">{p.ideas.notes}</p>}
    </>
  );
}

// ------------------------------------------------------------------ 5. validate
function ValidateStep({ p, back }: { p: ProjectState; back: () => void }) {
  const { planTests, recordTest, busy } = useNexus();
  const idea = p.ideas?.ideas.find((i) => i.id === p.selectedIdeaId);
  if (!idea) return <p className="text-ink2">Choose a direction first. <button className="underline" onClick={back}>Go to options</button></p>;
  const rec = p.design?.tests.find((t) => t.ideaId === idea.id);
  if (!rec) return <Big onClick={() => planTests(idea.id)} disabled={!!busy}>Plan cheap tests for “{idea.title}” →</Big>;
  return (
    <div className="space-y-3">
      {rankAssumptions(rec).map((a, k) => {
        const r = rec.results[a.id] ?? { status: "untested" as TestStatus, learning: "" };
        const tests = rec.tests.filter((t) => t.assumptionId === a.id);
        const tone = r.status === "validated" ? "var(--ok)" : r.status === "invalidated" ? "var(--danger)" : quadrant(a) === "test_first" ? "var(--warn)" : "var(--line-2)";
        return (
          <Box key={a.id} tone={tone}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-[220px]">
                <div className="text-xs text-ink3 mb-1">{k === 0 ? "Riskiest — test this first" : quadrant(a) === "test_first" ? "High risk" : "Lower risk"} · {a.lens}</div>
                <p className="font-medium text-[16px]">{a.statement}</p>
              </div>
              <select className="input !w-auto !py-1.5 text-sm" value={r.status} aria-label="Result" onChange={(e) => recordTest(rec.ideaId, a.id, e.target.value as TestStatus, r.learning)}>
                <option value="untested">Not tested yet</option><option value="running">Testing now</option><option value="validated">✓ Turned out true</option><option value="invalidated">✗ Turned out false</option><option value="inconclusive">Unclear</option>
              </select>
            </div>
            {tests.map((t, j) => (
              <div key={j} className="mt-3 text-sm rounded-lg bg-bg2 p-3">
                <b>{PROTOTYPE_LABEL[t.prototype]}:</b> {t.description}
                <div className="text-ink2 mt-1">Success if: <b className="text-ink">{t.successCriteria}</b> · about {t.effortDays} day{t.effortDays === 1 ? "" : "s"}, {t.cost} cost</div>
              </div>
            ))}
            {r.status !== "untested" && <Learning key={a.id + r.status} initial={r.learning} onSave={(l) => recordTest(rec.ideaId, a.id, r.status, l)} />}
          </Box>
        );
      })}
    </div>
  );
}
function Learning({ initial, onSave }: { initial: string; onSave: (s: string) => void }) {
  const [v, setV] = useState(initial);
  return <input className="input mt-3 text-sm" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== initial && onSave(v)} placeholder="What did you learn? e.g. 4 of 5 said they'd pay ₹500 more for a video consultation" aria-label="What you learned" />;
}

// ------------------------------------------------------------------ 6. numbers
const KEY_DRIVERS: FinDriver[] = ["volumeY1", "price", "volumeGrowth", "variableCostPct", "fixedOpex", "capex"];
function NumbersStep({ p }: { p: ProjectState }) {
  const { suggestFinancials, setQuiet, checkpoint, busy } = useNexus();
  const idea = p.ideas?.ideas.find((i) => i.id === p.selectedIdeaId);
  if (!idea) return <p className="text-ink2">Choose a direction in step 4 first.</p>;
  const bc = p.os?.businessCases.find((b) => b.ideaId === idea.id);
  const cur = currencyFor(p.guide?.country ?? "IN");
  if (!bc) return <Big onClick={() => suggestFinancials(idea.id, cur)} disabled={!!busy}>Estimate starting numbers →</Big>;
  const i = bc.inputs;
  const errs = validateInputs(i);
  const m = (n: number) => fmtMoney(n, i.currency);
  const setD = (k: FinDriver, v: number) => setQuiet((c) => ({ ...c, os: c.os && { ...c.os, businessCases: c.os.businessCases.map((b) => (b.ideaId === idea.id ? { ...b, inputs: { ...b.inputs, [k]: v }, sources: { ...b.sources, [k]: { by: "user", rationale: "Entered by you" } } } : b)) } }));
  const table = errs.length ? [] : scenarioTable(bc);
  const base = table.find((t) => t.key === "base"), cons = table.find((t) => t.key === "conservative"), opt = table.find((t) => t.key === "optimistic");
  return (
    <>
      <Box title="Your assumptions">
        <div className="grid sm:grid-cols-2 gap-4" onFocus={checkpoint}>
          {KEY_DRIVERS.map((k) => {
            const src = bc.sources[k];
            const meta = DRIVER_META[k];
            return (
              <label key={k} className="block">
                <span className="text-sm flex justify-between"><span>{meta.label}{k === "volumeY1" ? ` (${i.unitLabel})` : meta.unit === "pct" ? " (%)" : ` (${i.currency})`}</span>{src && src.by !== "user" && <span className="text-[11px] text-warn" title={src.rationale}>placeholder</span>}</span>
                <input type="number" className="input mt-1 tabular-nums" value={Number.isFinite(i[k]) ? i[k] : ""} onChange={(e) => setD(k, e.target.value === "" ? 0 : Number(e.target.value))} />
                {src && src.by !== "user" && <span className="text-[11px] text-ink3">{src.rationale}</span>}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-ink3 mt-3">{FIN_DRIVERS.length - KEY_DRIVERS.length} more settings (growth in price and costs, savings, discount rate, years) are in the <Link className="underline" href={`/p/${p.id}/workspace`}>detailed model</Link>.</p>
      </Box>
      {errs.length ? <Box tone="var(--danger)"><List items={errs} dot="var(--danger)" /></Box> : base && (
        <Box title={`What this means over ${i.horizonYears} years`} tone={base.npv >= 0 ? "var(--ok)" : "var(--danger)"}>
          <div className="grid sm:grid-cols-3 gap-4 mb-4">
            <div><div className="text-sm text-ink3">You need upfront</div><div className="serif text-3xl">{m(Math.max(base.peakFunding, i.capex))}</div><div className="text-xs text-ink3">peak cash before it pays back</div></div>
            <div><div className="text-sm text-ink3">Pays back in</div><div className="serif text-3xl">{base.paybackYears === null ? "Not within " + i.horizonYears + " yrs" : `${base.paybackYears.toFixed(1)} yrs`}</div></div>
            <div><div className="text-sm text-ink3">Worth today (NPV)</div><div className="serif text-3xl" style={{ color: base.npv >= 0 ? "var(--ok)" : "var(--danger)" }}>{m(base.npv)}</div><div className="text-xs text-ink3">at {i.discountRate}% a year</div></div>
          </div>
          <p className="text-sm text-ink2">Cautious case: <b>{m(cons!.npv)}</b> · Optimistic case: <b>{m(opt!.npv)}</b>. These are calculations on your assumptions — not forecasts.</p>
        </Box>
      )}
    </>
  );
}

// ------------------------------------------------------------------ 7. setup
function SetupStep({ p }: { p: ProjectState }) {
  const { guide, setupGuide, checkLinks, busy } = useNexus();
  const g = p.guide ?? emptyGuide();
  const G = g.setup;
  const country = countryByCode(g.country);
  const mandatory = G?.steps.filter((s) => s.mandatory) ?? [];
  const doneCount = mandatory.filter((s) => g.setupDone[s.id]).length;
  return (
    <>
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <label className="block"><span className="text-sm text-ink2">Country</span>
          <select className="input mt-1 !w-72" value={g.country} onChange={(e) => guide((x) => ({ ...x, country: e.target.value, setup: null, setupDone: {}, linkStatus: {} }), "guide.country")}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
        </label>
        <Big onClick={setupGuide} disabled={!!busy}>{G ? "Research again" : `Research ${country?.name ?? ""} requirements →`}</Big>
      </div>
      {!G ? (
        <p className="text-sm text-ink3">Covers: legal structure · company registration · tax · banking · licences · hiring · trademarks · data protection · sector rules · ongoing filings — with links to official sources.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
            <span className="chip" style={{ borderColor: G.mode === "live" ? "var(--ok)" : "var(--warn)", color: G.mode === "live" ? "var(--ok)" : "var(--warn)" }}>
              {G.mode === "live" ? `Live research · ${new Date(G.generatedAt).toLocaleDateString()} · ${G.sources.length} sources` : G.mode === "curated" ? "Curated official portals (offline)" : "Generic checklist — run live research for country specifics"}
            </span>
            {G.removedLinks > 0 && <span className="chip" title="Links the AI suggested that were not in its search results">{G.removedLinks} unverified link{G.removedLinks > 1 ? "s" : ""} removed</span>}
            <button className="text-ink3 hover:text-ink underline" onClick={checkLinks}>Re-check links</button>
          </div>
          <Box tone="var(--accent)">
            <p className="text-[15px] mb-3">{G.summary}</p>
            <div className="rounded-lg bg-bg2 p-3"><div className="text-xs text-ink3 uppercase tracking-wider">Suggested legal form</div><div className="serif text-xl">{G.recommendedForm.form}</div><p className="text-sm text-ink2">{G.recommendedForm.why}</p>
              {G.recommendedForm.alternatives.length > 0 && <ul className="text-sm mt-2 text-ink2">{G.recommendedForm.alternatives.map((a) => <li key={a.form}>• <b>{a.form}</b> — {a.when}</li>)}</ul>}
            </div>
          </Box>
          <div className="mb-3">
            <div className="flex justify-between text-sm mb-1"><span>Mandatory steps done</span><span className="tabular-nums">{doneCount} / {mandatory.length}</span></div>
            <div className="h-2 rounded-full bg-line overflow-hidden"><div className="h-full bg-accent2 transition-all" style={{ width: `${mandatory.length ? (doneCount / mandatory.length) * 100 : 0}%` }} /></div>
          </div>
          {CATEGORY_ORDER.filter((c) => G.steps.some((s) => s.category === c)).map((cat) => (
            <section key={cat} className="mb-6">
              <h2 className="serif text-2xl mt-6 mb-3">{CATEGORY_LABEL[cat]}</h2>
              {G.steps.filter((s) => s.category === cat).map((s) => (
                <article key={s.id} className={`card p-4 mb-3 ${g.setupDone[s.id] ? "opacity-60" : ""}`}>
                  <label className="flex gap-3 items-start cursor-pointer">
                    <input type="checkbox" className="mt-1.5 h-4 w-4 accent-[var(--accent-2)]" checked={!!g.setupDone[s.id]} onChange={() => guide((x) => ({ ...x, setupDone: { ...x.setupDone, [s.id]: !x.setupDone[s.id] } }), "setup.step.toggled")} />
                    <span className="flex-1">
                      <span className="font-semibold text-[16px]">{s.title}</span>
                      {s.mandatory ? <span className="ml-2 text-[11px] text-danger uppercase tracking-wider">required</span> : <span className="ml-2 text-[11px] text-ink3 uppercase tracking-wider">if applicable</span>}
                    </span>
                  </label>
                  <div className="pl-7">
                    {s.what && <p className="text-sm text-ink2 mt-1">{s.what}</p>}
                    {s.documents.length > 0 && <div className="mt-2"><div className="text-xs font-semibold text-ink3 uppercase tracking-wider mb-1">Documents</div><List items={s.documents} /></div>}
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink3 mt-2">
                      {s.authority && s.authority !== "—" && <span>🏛 {s.authority}</span>}
                      {s.timeEstimate && s.timeEstimate !== "—" && <span>⏱ {s.timeEstimate} <i>(estimate)</i></span>}
                      {s.costEstimate && s.costEstimate !== "—" && <span>₹$ {s.costEstimate} <i>(estimate — check current fee)</i></span>}
                    </div>
                    {s.links.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {s.links.map((l) => {
                          const st = g.linkStatus[l.url];
                          return (
                            <li key={l.url} className="text-sm flex flex-wrap items-center gap-2">
                              <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">{l.title}</a>
                              <span className="text-[11px] text-ink3">{new URL(l.url).hostname}</span>
                              <span className="text-[11px]" style={{ color: st === "ok" ? "var(--ok)" : st === "missing" ? "var(--danger)" : "var(--ink-3)" }} title={l.source === "official" ? "Curated official portal" : "Retrieved during research"}>
                                {st === "ok" ? "✓ opens" : st === "missing" ? "✗ page not found" : st === "unknown" ? "couldn't auto-check" : ""} · {l.source === "official" ? "official portal" : "from research"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </article>
              ))}
            </section>
          ))}
          {G.ongoing.length > 0 && (
            <Box title="Ongoing compliance once you're running">
              <table className="w-full text-sm"><tbody>{G.ongoing.map((o) => <tr key={o.obligation} className="border-b border-line/60"><td className="py-2 pr-3">{o.obligation}</td><td className="py-2 pr-3 text-ink2 whitespace-nowrap">{o.frequency}</td><td className="py-2 text-ink3">{o.authority}</td></tr>)}</tbody></table>
            </Box>
          )}
          {G.sources.length > 0 && (
            <details className="mb-4"><summary className="text-sm text-ink3 cursor-pointer">All {G.sources.length} sources the research used</summary>
              <ul className="mt-2 space-y-1 text-sm">{G.sources.map((s) => <li key={s.url}><a className="underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> <span className="text-ink3 text-xs">{new URL(s.url).hostname}</span></li>)}</ul>
            </details>
          )}
          <p className="text-xs text-ink3 leading-relaxed">{G.caveats} This is general guidance, not legal, tax or financial advice. Rules, fees and thresholds change — confirm with the official authority or a qualified local professional before acting.</p>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ 8. plan
function PlanStep({ p, back }: { p: ProjectState; back: () => void }) {
  const { buildPlan, set, busy } = useNexus();
  if (!p.selectedIdeaId) return <p className="text-ink2">Choose a direction first. <button className="underline" onClick={back}>Go to options</button></p>;
  const r = p.roadmap;
  const pendingSetup = (p.guide?.setup?.steps ?? []).filter((s) => s.mandatory && !p.guide?.setupDone[s.id]);
  if (!r) return <Big onClick={buildPlan} disabled={!!busy}>Build my delivery plan →</Big>;
  const tasksFor = (mid: string) => p.tasks.filter((t) => t.milestoneId === mid);
  const doneN = p.tasks.filter((t) => t.status === "done").length;
  return (
    <>
      <Box title="Your first version (MVP)" tone="var(--accent)"><p className="text-[15px]">{r.mvpDefinition}</p></Box>
      <div className="mb-3 text-sm text-ink2">{doneN} of {p.tasks.length} tasks done</div>
      {pendingSetup.length > 0 && (
        <Box title={`Before launch — company setup (${pendingSetup.length} required steps left)`} tone="var(--warn)">
          <List items={pendingSetup.map((s) => s.title)} dot="var(--warn)" />
        </Box>
      )}
      <ol className="relative border-l-2 border-line ml-3">
        {r.phases.map((ph) => (
          <li key={ph.id} className="ml-6 mb-8">
            <span className="absolute -left-[9px] h-4 w-4 rounded-full bg-accent" style={{ marginTop: 6 }} />
            <h3 className="serif text-2xl">{ph.name}</h3>
            <p className="text-sm text-ink2 mb-3">{ph.goal}</p>
            {ph.milestones.map((m) => (
              <div key={m.id} className="mb-4">
                <div className="font-semibold">{m.title}</div>
                <div className="text-xs text-ink3 mb-2">Done when: {m.exitCriteria}</div>
                <ul className="space-y-1.5">
                  {tasksFor(m.id).map((t) => (
                    <li key={t.id} className="card px-3 py-2 flex items-center gap-3 text-sm">
                      <input type="checkbox" className="h-4 w-4" checked={t.status === "done"} aria-label={`Mark ${t.title} done`} onChange={() => set((c) => ({ ...c, tasks: c.tasks.map((x) => (x.id === t.id ? { ...x, status: x.status === "done" ? "todo" : "done" } : x)) }), "task.toggled")} />
                      <span className={`flex-1 ${t.status === "done" ? "line-through text-ink3" : ""}`}>{t.title}</span>
                      {t.assignee && <span className="text-xs text-ink3">{t.assignee}</span>}
                      {t.dueDate && <span className="text-xs tabular-nums text-ink2">{new Date(t.dueDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </li>
        ))}
      </ol>
      {r.kpis.length > 0 && <Box title="How you'll know it's working"><List items={r.kpis.map((k) => `${k.name}: ${k.target}`)} dot="var(--ok)" /></Box>}
      <button className="text-sm text-ink3 hover:text-ink" disabled={!!busy} onClick={() => { if (confirm("Rebuild the plan? Task progress will be reset.")) buildPlan(); }}>Rebuild plan</button>
    </>
  );
}

// ------------------------------------------------------------------ 9. summary
function SummaryStep({ p }: { p: ProjectState }) {
  const I = p.interpretation;
  const idea = p.ideas?.ideas.find((i) => i.id === p.selectedIdeaId);
  const bc = idea ? p.os?.businessCases.find((b) => b.ideaId === idea.id) : undefined;
  const base = bc && !validateInputs(bc.inputs).length ? metrics(bc.inputs, bc.scenarios.base) : null;
  const rec = idea ? recommendAll(p).find((r) => r.ideaId === idea.id) : undefined;
  const G = p.guide?.setup;
  const tests = idea ? p.design?.tests.find((t) => t.ideaId === idea.id) : undefined;
  return (
    <>
      <div className="flex gap-2 mb-6 print:hidden">
        <button className="btn btn-primary" onClick={() => download(`${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "plan"}.md`, toMarkdown(p))}>Download plan</button>
        <button className="btn" onClick={() => window.print()}>Print / save as PDF</button>
      </div>
      <Box title="The idea"><p className="serif text-xl">{p.thought}</p>{I && <p className="text-sm text-ink2 mt-2">{I.problemOrOpportunity}</p>}</Box>
      {p.design?.empathy && <Box title="For"><List items={p.design.empathy.personas.map((x) => `${x.name} — ${x.role}${x.basis === "proto_persona" ? " (to validate)" : ""}`)} /></Box>}
      {idea && <Box title="Chosen direction"><div className="serif text-2xl">{idea.title}</div><p className="text-sm text-ink2">{idea.valueProposition}</p>{rec && <p className="text-xs mt-2" style={{ color: STATUS_TONE[rec.status] }}>Decision engine: {STATUS_LABEL[rec.status]}</p>}</Box>}
      {tests && <Box title="Validation"><List items={rankAssumptions(tests).slice(0, 4).map((a) => `${a.statement} — ${({ untested: "not tested", running: "testing", validated: "✓ true", invalidated: "✗ false", inconclusive: "unclear" } as Record<string, string>)[tests.results[a.id]?.status ?? "untested"]}`)} /></Box>}
      {base && bc && <Box title="Numbers"><p className="text-[15px]">Upfront {fmtMoney(bc.inputs.capex, bc.inputs.currency)} · payback {base.paybackYears === null ? "not within horizon" : `${base.paybackYears.toFixed(1)} yrs`} · NPV {fmtMoney(base.npv, bc.inputs.currency)} <span className="text-ink3 text-sm">(on stated assumptions)</span></p></Box>}
      {G && <Box title={`Company setup — ${G.country}`}><p className="text-sm mb-2"><b>{G.recommendedForm.form}</b> · {G.steps.filter((s) => s.mandatory && p.guide?.setupDone[s.id]).length}/{G.steps.filter((s) => s.mandatory).length} required steps done</p><List items={G.steps.filter((s) => s.mandatory).map((s) => `${p.guide?.setupDone[s.id] ? "✓ " : ""}${s.title}`)} /></Box>}
      {p.roadmap && <Box title="Delivery plan"><List items={p.roadmap.phases.map((ph) => `${ph.name}: ${ph.milestones.map((m) => m.title).join(", ")}`)} dot="var(--accent)" /></Box>}
    </>
  );
}
