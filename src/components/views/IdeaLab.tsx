"use client";
import { useNexus } from "@/lib/store";
import { SLIDERS, type SliderKey } from "@/lib/schemas";
import { qualityCheck } from "@/lib/scoring";
import { Empty, Section } from "../ui";
import type { ViewId } from "../Workspace";

const SLIDER_LABEL: Record<SliderKey, [string, string, string]> = {
  creativity: ["Creativity", "Familiar", "Unconventional"],
  practicality: ["Practicality", "Visionary", "Grounded"],
  commercialFocus: ["Commercial focus", "Impact-led", "Revenue-led"],
  costSensitivity: ["Cost sensitivity", "Invest freely", "Frugal"],
  technicalAmbition: ["Technical ambition", "Proven tech", "Frontier tech"],
  timeToMarket: ["Time-to-market", "Long game", "Ship fast"],
  sustainability: ["Sustainability", "Not a factor", "Core requirement"],
  riskTolerance: ["Risk tolerance", "Cautious", "Bold"],
};
const TIER_STYLE: Record<string, string> = { conservative: "var(--t-evidence)", practical: "var(--t-opportunity)", disruptive: "var(--t-insight)", moonshot: "var(--t-idea)" };

export function IdeaLab({ go }: { go: (v: ViewId) => void }) {
  const { p, set, setQuiet, checkpoint, ideate, evaluate, busy, select } = useNexus();
  if (!p) return null;
  const flags = p.ideas ? qualityCheck(p.ideas.ideas, p.interpretation?.constraints.map((c) => c.text) ?? []) : [];
  const changed = p.generatedWith ? SLIDERS.filter((k) => p.generatedWith![k] !== p.sliders[k]) : [];

  return (
    <div className="h-full overflow-auto scroll-thin">
      <div className="max-w-6xl mx-auto px-8 py-10 fade-in grid lg:grid-cols-[280px_1fr] gap-10">
        <aside>
          <div className="label mb-1">Idea Lab</div>
          <h2 className="serif text-2xl mb-4">Creativity controls</h2>
          <div className="space-y-4" onPointerDown={checkpoint}>
            {SLIDERS.map((k) => (
              <label key={k} className="block">
                <div className="flex justify-between text-sm"><span>{SLIDER_LABEL[k][0]}</span><span className="text-ink3 tabular-nums">{p.sliders[k]}</span></div>
                <input type="range" min={0} max={100} step={5} value={p.sliders[k]} className="w-full" aria-label={SLIDER_LABEL[k][0]}
                  onChange={(e) => setQuiet((c) => ({ ...c, sliders: { ...c.sliders, [k]: Number(e.target.value) } }))} />
                <div className="flex justify-between text-[10.5px] text-ink3"><span>{SLIDER_LABEL[k][1]}</span><span>{SLIDER_LABEL[k][2]}</span></div>
              </label>
            ))}
          </div>
          {changed.length > 0 && p.ideas && (
            <div className="card p-3 mt-4 !border-accent text-sm" role="status">
              <div className="font-medium mb-1">Controls changed since these options were generated</div>
              <ul className="text-xs text-ink2 mb-2">{changed.map((k) => <li key={k}>{SLIDER_LABEL[k][0]}: {p.generatedWith![k]} → {p.sliders[k]}</li>)}</ul>
              <p className="text-xs text-ink3 mb-2">Current options and scores reflect the old settings. Regenerate to reassess.</p>
              <button className="btn btn-primary !py-1 text-xs" disabled={!!busy} onClick={() => ideate()}>Regenerate with new controls</button>
            </div>
          )}
          <button className="btn btn-primary w-full justify-center mt-5" disabled={!!busy || !p.interpretation} onClick={() => ideate()}>{p.ideas ? "Generate a fresh set" : "Generate options"}</button>
          <p className="text-[11px] text-ink3 mt-2">Draws on the problem, opportunity, insight and stakeholder nodes on your map. Select nodes on the canvas first to focus it.</p>
        </aside>

        <div>
          {!p.ideas ? (
            <Empty title="No options yet" body="NEXUS generates four deliberately different directions — conservative, practical, disruptive and moonshot — then checks them for duplicates, missing users and conflicts with your constraints." action={<button className="btn btn-primary" disabled={!!busy || !p.interpretation} onClick={() => ideate()}>Generate options</button>} />
          ) : (
            <>
              <Section title="Divergent options" kicker={`${p.ideas.ideas.length} directions across ${new Set(p.ideas.ideas.map((i) => i.tier)).size} risk tiers`}
                right={<button className="btn btn-primary" disabled={!!busy} onClick={async () => { await evaluate(); go("board"); }}>Evaluate & compare →</button>}>
                {flags.filter((f) => f.ideaId === "*").map((f) => <p key={f.issue} className="text-sm text-warn mb-3">⚠ {f.issue}</p>)}
                <div className="grid md:grid-cols-2 gap-4">
                  {p.ideas.ideas.map((i) => {
                    const fl = flags.filter((f) => f.ideaId === i.id);
                    const origins = p.nodes.filter((n) => i.originNodeIds.includes(n.id));
                    const node = p.nodes.find((n) => n.tags.includes(`idea:${i.id}`));
                    return (
                      <article key={i.id} className="card p-5 flex flex-col" style={{ borderTop: `3px solid ${TIER_STYLE[i.tier]}` }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: TIER_STYLE[i.tier] }}>{i.tier}</span>
                          <span className="text-[11px] text-ink3">{i.id}{p.selectedIdeaId === i.id && <span className="text-accent ml-2">● chosen</span>}</span>
                        </div>
                        <h3 className="serif text-xl leading-snug mb-2">{i.title}</h3>
                        <p className="text-sm text-ink2 mb-3 leading-relaxed">{i.summary}</p>
                        <dl className="text-sm space-y-1.5 mb-3">
                          <div><dt className="label inline">For </dt><dd className="inline">{i.targetUsers}</dd></div>
                          <div><dt className="label inline">Value </dt><dd className="inline">{i.valueProposition}</dd></div>
                          <div><dt className="label inline">How </dt><dd className="inline text-ink2">{i.howItWorks}</dd></div>
                          <div><dt className="label inline">Edge </dt><dd className="inline text-ink2">{i.differentiator}</dd></div>
                        </dl>
                        {i.keyAssumptions.length > 0 && <div className="text-xs text-ink2 mb-1"><span className="text-warn">≈ Assumes:</span> {i.keyAssumptions.join(" · ")}</div>}
                        {i.risks.length > 0 && <div className="text-xs text-ink2 mb-2"><span style={{ color: "var(--t-risk)" }}>△ Risks:</span> {i.risks.join(" · ")}</div>}
                        {fl.map((f) => <div key={f.issue} className={`text-xs ${f.severity === "warn" ? "text-warn" : "text-ink3"}`}>⚠ {f.issue}</div>)}
                        {origins.length > 0 && <div className="text-[11px] text-ink3 mt-2">Lineage: {origins.map((o) => o.title).join(" · ")}</div>}
                        <div className="mt-auto pt-3 flex gap-2">
                          {node && <button className="btn !py-1 text-xs" onClick={() => { select(node.id); go("canvas"); }}>Show on canvas</button>}
                          <button className="btn !py-1 text-xs" onClick={() => set((c) => ({ ...c, ideas: c.ideas && { ...c.ideas, ideas: c.ideas.ideas.filter((x) => x.id !== i.id) }, evaluation: null, nodes: c.nodes.map((n) => (n.tags.includes(`idea:${i.id}`) ? { ...n, status: "rejected" } : n)) }), "idea.rejected")}>Reject</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </Section>
              {p.ideas.notes && <div className="card p-4 text-sm text-ink2"><span className="label block mb-1">Reframing check</span>{p.ideas.notes}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
