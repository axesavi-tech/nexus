"use client";
import { useNexus } from "@/lib/store";
import { download, toMarkdown } from "@/lib/export";
import type { Blueprint } from "@/lib/schemas";
import { ClaimTag, Empty, Section } from "../ui";
import { slug, type ViewId } from "../Workspace";

export function SolutionStudio({ go }: { go: (v: ViewId) => void }) {
  const { p, setQuiet, checkpoint, designSolution, busy } = useNexus();
  if (!p) return null;
  const idea = p.ideas?.ideas.find((i) => i.id === p.selectedIdeaId);
  if (!idea) return <Empty title="No direction chosen yet" body="Record a decision in the Consulting Board, then NEXUS designs a blueprint suited to the kind of problem — business, software, operational, physical or personal." action={<button className="btn btn-primary" onClick={() => go("board")}>Go to Consulting Board</button>} />;
  const b = p.blueprint;
  if (!b) return <Empty title={`Design “${idea.title}”`} body="Generate a structured solution blueprint: concept, users, functional design, operating model, risks, assumptions, alternatives rejected, validation approach and measures of success." action={<button className="btn btn-primary" disabled={!!busy} onClick={designSolution}>Generate blueprint</button>} />;
  const edit = <K extends keyof Blueprint>(k: K, v: Blueprint[K]) => setQuiet((c) => ({ ...c, blueprint: c.blueprint && { ...c.blueprint, [k]: v } }));
  const stale = b.ideaId !== p.selectedIdeaId;

  return (
    <div className="h-full overflow-auto scroll-thin">
      <div className="max-w-4xl mx-auto px-8 py-10 fade-in">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="label mb-1">Solution Studio · {b.category} blueprint</div>
            <h1 className="serif text-3xl">{idea.title}</h1>
            {p.decision && <p className="text-sm text-ink3 mt-1">Decided by {p.decision.decisionMaker} on {p.decision.date}: {p.decision.rationale}</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            <button className="btn" disabled={!!busy} onClick={() => { if (confirm("Regenerate the blueprint? The current one stays in version history.")) designSolution(); }}>Regenerate</button>
            <button className="btn" onClick={() => download(`${slug(p.title)}-blueprint.md`, toMarkdown(p, ["blueprint"]))}>Export</button>
            <button className="btn btn-primary" onClick={() => go("execution")}>Plan delivery →</button>
          </div>
        </div>
        {stale && <p className="card !border-warn p-3 text-sm text-warn mb-6">This blueprint was designed for a different option than the one now chosen. Regenerate it.</p>}

        <Section title="Executive summary"><Editable value={b.executiveSummary} onFocus={checkpoint} onChange={(v) => edit("executiveSummary", v)} serif /></Section>
        <Section title="Problem and desired outcome"><Editable value={b.problemAndOutcome} onFocus={checkpoint} onChange={(v) => edit("problemAndOutcome", v)} /></Section>
        <Section title="Solution concept"><Editable value={b.solutionConcept} onFocus={checkpoint} onChange={(v) => edit("solutionConcept", v)} /></Section>

        <div className="grid md:grid-cols-2 gap-6">
          <Section title="Users and stakeholders"><ul className="space-y-2 text-sm">{b.usersAndStakeholders.map((u) => <li key={u.name}><b>{u.name}</b> — <span className="text-ink2">{u.need}</span></li>)}</ul></Section>
          <Section title="Functional design"><ul className="space-y-2 text-sm">{b.functionalDesign.map((u) => <li key={u.component}><b>{u.component}</b> — <span className="text-ink2">{u.description}</span></li>)}</ul></Section>
        </div>
        <Section title="Operating / technical model"><Editable value={b.operatingModel} onFocus={checkpoint} onChange={(v) => edit("operatingModel", v)} /></Section>

        {b.categorySections.map((s) => (
          <Section key={s.heading} title={s.heading} kicker={`${b.category} design`}><ul className="list-disc pl-5 space-y-1 text-sm text-ink2">{s.items.map((x) => <li key={x}>{x}</li>)}</ul></Section>
        ))}

        <div className="grid md:grid-cols-2 gap-6">
          <Section title="Dependencies"><ul className="list-disc pl-5 text-sm text-ink2 space-y-1">{b.dependencies.map((x) => <li key={x}>{x}</li>)}</ul></Section>
          <Section title="Constraints"><ul className="list-disc pl-5 text-sm text-ink2 space-y-1">{b.constraints.length ? b.constraints.map((x) => <li key={x}>{x}</li>) : <li>None stated</li>}</ul></Section>
        </div>

        <Section title="Risks and mitigations">
          <div className="card divide-y divide-line">
            {b.risks.map((r) => <div key={r.risk} className="p-3 text-sm grid grid-cols-[1fr_auto] gap-2"><div><div>{r.risk}</div><div className="text-ink2 text-xs mt-0.5">Mitigation: {r.mitigation}</div></div><div className="text-xs text-ink3 text-right">likelihood {r.likelihood}<br />impact {r.impact}</div></div>)}
          </div>
        </Section>

        <Section title="Cost and benefit assumptions" kicker="Each labelled with its evidence status">
          <ul className="space-y-2 text-sm">{b.costBenefitAssumptions.map((c) => <li key={c.item} className="flex gap-2 items-start"><span className="flex-1"><b>{c.item}:</b> <span className="text-ink2">{c.assumption}</span></span><ClaimTag claim={c.claim} /></li>)}</ul>
        </Section>

        <Section title="Alternatives rejected"><ul className="space-y-1 text-sm">{b.alternativesRejected.map((a) => <li key={a.option}><b>{a.option}</b> — <span className="text-ink2">{a.reason}</span></li>)}</ul></Section>

        <Section title="Validation approach" kicker="Test before you scale">
          <div className="grid md:grid-cols-2 gap-3">
            {b.validationApproach.map((v) => (
              <div key={v.hypothesis} className="card p-4 text-sm">
                <div className="label mb-1">Hypothesis</div><p className="mb-2">{v.hypothesis}</p>
                <div className="text-ink2 text-xs space-y-1"><p><b>Experiment:</b> {v.experiment}</p><p><b>Metric:</b> {v.successMetric}</p><p><b>Decision threshold:</b> {v.threshold}</p></div>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink3 mt-2">No experiment has been run. Results only count as validation once real participants are involved.</p>
        </Section>

        <Section title="Measures of success">
          <ul className="space-y-1 text-sm">{b.measuresOfSuccess.map((m) => <li key={m.metric}><b>{m.metric}</b> — {m.target} <span className="text-ink3 text-xs">({m.kind})</span></li>)}</ul>
        </Section>
      </div>
    </div>
  );
}

function Editable({ value, onChange, onFocus, serif }: { value: string; onChange: (v: string) => void; onFocus: () => void; serif?: boolean }) {
  return <textarea className={`w-full bg-transparent resize-none outline-none rounded p-1 -m-1 focus:bg-panel leading-relaxed ${serif ? "serif text-lg" : "text-[15px] text-ink2"}`}
    rows={Math.max(2, Math.ceil(value.length / 90))} value={value} onFocus={onFocus} onChange={(e) => onChange(e.target.value)} />;
}
