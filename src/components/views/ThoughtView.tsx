"use client";
import { useNexus } from "@/lib/store";
import { FRAMEWORKS, byId, recommendFrameworks } from "@/lib/frameworks";
import type { Mode } from "@/lib/schemas";
import { Section, Empty } from "../ui";
import type { ViewId } from "../Workspace";

export function ThoughtView({ go }: { go: (v: ViewId) => void }) {
  const { p, set, setQuiet, checkpoint, analyze, busy } = useNexus();
  if (!p) return null;
  const I = p.interpretation;
  const recs = I ? recommendFrameworks({ text: p.thought, category: I.category, maturity: I.maturity, mode: p.mode }) : [];

  return (
    <div className="h-full overflow-auto scroll-thin">
      <div className="max-w-4xl mx-auto px-8 py-10 fade-in">
        <div className="label mb-2">Original thought — preserved as you wrote it</div>
        <textarea
          className="w-full bg-transparent serif text-3xl leading-snug resize-none outline-none focus:bg-panel rounded p-1"
          rows={Math.min(6, Math.ceil(p.thought.length / 60) + 1)}
          value={p.thought}
          onFocus={checkpoint} onChange={(e) => setQuiet((c) => ({ ...c, thought: e.target.value }))}
          aria-label="Original thought"
        />
        <div className="flex flex-wrap items-center gap-2 mt-4 mb-10">
          <span className="label mr-1">Mode</span>
          {(["free", "guided", "strategic"] as Mode[]).map((m) => (
            <button key={m} onClick={() => set((c) => ({ ...c, mode: m }), "mode.changed")} className={`chip capitalize ${p.mode === m ? "!border-accent !text-accent" : ""}`}>{m === "free" ? "Free exploration" : m === "guided" ? "Guided thinking" : "Strategic deep dive"}</button>
          ))}
          <button className="btn ml-auto" disabled={!!busy} onClick={analyze}>{I ? "Re-interpret" : "Interpret"}</button>
        </div>

        {!I ? (
          <Empty title="Not interpreted yet" body="NEXUS will identify the underlying intention, possible problems, alternative readings and the few questions that matter most." action={<button className="btn btn-primary" onClick={analyze}>Interpret this thought</button>} />
        ) : (
          <>
            <Section title="How NEXUS understands it" kicker="AI interpretation · inference, not fact">
              <div className="grid md:grid-cols-2 gap-3">
                <Fact k="Underlying intention" v={I.intention} />
                <Fact k="Problem or opportunity" v={I.problemOrOpportunity} />
                <Fact k="Domain" v={`${I.domain} · ${I.category} · ${I.maturity} idea`} />
                <Fact k="Intended beneficiaries" v={I.beneficiaries.join(" · ") || "Not yet known"} />
                <Fact k="Desired outcomes" v={I.desiredOutcomes.join(" · ") || "Not yet known"} />
                <Fact k="Constraints" v={I.constraints.map((c) => `${c.text} (${c.kind})`).join(" · ") || "None stated"} />
              </div>
            </Section>

            <Section title="Other ways to read it" kicker="Diverge before converging">
              <div className="grid md:grid-cols-3 gap-3">
                {I.alternativeInterpretations.map((a) => (
                  <div key={a.label} className="card p-4"><div className="text-accent text-sm mb-1">{a.label}</div><p className="text-sm text-ink2 leading-relaxed">{a.description}</p></div>
                ))}
              </div>
            </Section>

            <Section title="Opportunity areas" right={<button className="btn" onClick={() => go("canvas")}>Explore on canvas →</button>}>
              <div className="grid md:grid-cols-3 gap-3">
                {I.opportunityAreas.map((o) => (
                  <div key={o.title} className="card p-4"><div className="font-medium mb-1">{o.title}</div><p className="text-sm text-ink2 leading-relaxed">{o.description}</p></div>
                ))}
              </div>
            </Section>

            {I.clarifyingQuestions.length > 0 && (
              <Section title="A few questions that would change the direction" kicker="All optional">
                <div className="space-y-3">
                  {I.clarifyingQuestions.map((q) => (
                    <div key={q.question} className="card p-4">
                      <div className="font-medium">{q.question}</div>
                      <div className="text-xs text-ink3 mb-2">{q.why}</div>
                      <input className="input" placeholder="Your answer (optional)" value={p.answers[q.question] ?? ""} onChange={(e) => setQuiet((c) => ({ ...c, answers: { ...c.answers, [q.question]: e.target.value } }))} />
                    </div>
                  ))}
                  <button className="btn" disabled={!!busy || !Object.values(p.answers).some(Boolean)} onClick={analyze}>Update understanding with my answers</button>
                </div>
              </Section>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              <Section title="Assumptions to watch">
                <ul className="space-y-1.5 text-sm text-ink2">{I.assumptions.map((a) => <li key={a}>≈ {a}</li>)}</ul>
              </Section>
              <Section title="Missing information">
                <ul className="space-y-1.5 text-sm text-ink2">{I.missingInformation.map((a) => <li key={a}>? {a}</li>)}</ul>
              </Section>
            </div>

            <Section title="Recommended thinking frameworks" kicker="Up to three, chosen for this problem — override freely">
              <div className="space-y-2">
                {recs.map((r) => {
                  const on = p.frameworks.includes(r.id);
                  return (
                    <div key={r.id} className="card p-4 flex gap-4 items-start">
                      <div className="flex-1">
                        <div className="font-medium">{r.name}</div>
                        <p className="text-sm text-ink2 mt-1">Why: {r.reason}</p>
                        <p className="text-xs text-ink3 mt-1">Limitation: {byId(r.id)?.limitations} · Avoid when: {byId(r.id)?.avoidWhen}</p>
                      </div>
                      <button className={`btn ${on ? "!border-accent !text-accent" : ""}`} onClick={() => set((c) => ({ ...c, frameworks: on ? c.frameworks.filter((f) => f !== r.id) : [...c.frameworks, r.id] }), "framework.toggled")}>{on ? "In use ✓" : "Use"}</button>
                    </div>
                  );
                })}
                <details className="card p-4">
                  <summary className="cursor-pointer text-sm text-ink2">Add from the full library ({FRAMEWORKS.length} frameworks)</summary>
                  <div className="grid md:grid-cols-2 gap-2 mt-3">
                    {FRAMEWORKS.map((f) => {
                      const on = p.frameworks.includes(f.id);
                      return (
                        <label key={f.id} className="flex gap-2 items-start text-sm p-2 rounded hover:bg-panel2 cursor-pointer">
                          <input type="checkbox" checked={on} onChange={() => set((c) => ({ ...c, frameworks: on ? c.frameworks.filter((x) => x !== f.id) : [...c.frameworks, f.id] }))} />
                          <span><span className="text-ink">{f.name}</span> <span className="text-ink3">· {f.family} · effort {f.effort}/3</span><br /><span className="text-xs text-ink3">{f.strengths}</span></span>
                        </label>
                      );
                    })}
                  </div>
                </details>
                <p className="text-xs text-ink3">Apply a framework to any node from the canvas — its output becomes editable nodes.</p>
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return <div className="card p-4"><div className="label mb-1">{k}</div><div className="text-sm leading-relaxed">{v}</div></div>;
}
