"use client";
import { useMemo, useState } from "react";
import { useNexus } from "@/lib/store";
import { DIMENSIONS, type DimensionScore } from "@/lib/schemas";
import { DEFAULT_WEIGHTS, normalizeWeights, paretoFrontier, scoreIdeas, weightSensitivity } from "@/lib/scoring";
import { makeNode, nid, now, placeNew } from "@/lib/graph";
import { Empty, Section } from "../ui";
import type { ViewId } from "../Workspace";
import { DecisionCockpit } from "./DecisionCockpit";

const label = (k: string) => DIMENSIONS.find((d) => d.key === k)?.label ?? k.replace(/^custom:/, "");

export function ConsultingBoard({ go }: { go: (v: ViewId) => void }) {
  const { p, set, setQuiet, checkpoint, evaluate, busy, select } = useNexus();
  const [open, setOpen] = useState<string | null>(null);
  const [newCrit, setNewCrit] = useState("");
  const ideas = useMemo(() => p?.ideas?.ideas ?? [], [p?.ideas]);
  const ev = p?.evaluation;
  const rows = useMemo(() => (p && ev ? scoreIdeas(ideas, ev, p.weights) : []), [p, ev, ideas]);
  const sens = useMemo(() => (p && ev ? weightSensitivity(ideas, ev, p.weights) : []), [p, ev, ideas]);
  const pareto = useMemo(() => paretoFrontier(rows), [rows]);

  if (!p) return null;
  if (!p.ideas) return <Empty title="Nothing to compare yet" body="Generate options in the Idea Lab first, then bring them here to evaluate, challenge and decide." action={<button className="btn btn-primary" onClick={() => go("ideas")}>Go to Idea Lab</button>} />;
  if (!ev) return <Empty title="Options not evaluated yet" body="NEXUS will judge each option on eight dimensions with stated rationale, evidence status and confidence. The arithmetic is done deterministically — and missing evidence stays visibly missing." action={<button className="btn btn-primary" disabled={!!busy} onClick={evaluate}>Evaluate options</button>} />;

  const norm = normalizeWeights(p.weights);
  const dims = Object.keys(p.weights);
  const cell = (ideaId: string, dim: string): DimensionScore | undefined => ev.evaluations.find((e) => e.ideaId === ideaId)?.scores.find((s) => s.dimension === dim);
  const override = (ideaId: string, dim: string, score: number | null) => {
    set((c) => ({
      ...c, evaluation: c.evaluation && {
        ...c.evaluation, evaluations: c.evaluation.evaluations.map((e) => e.ideaId !== ideaId ? e : {
          ...e, scores: e.scores.some((s) => s.dimension === dim)
            ? e.scores.map((s) => (s.dimension === dim ? { ...s, score, evidence: "user_provided" as const, rationale: `Set by you (was ${s.score ?? "unscored"}). ${s.rationale}`.slice(0, 500) } : s))
            : [...e.scores, { dimension: dim, score, rationale: "Set by you", evidence: "user_provided" as const, confidence: "medium" as const, assumptions: [], downside: "" }],
        }),
      },
    }), "score.overridden");
  };
  const assumptionNodes = p.nodes.filter((n) => n.type === "assumption");

  return (
    <div className="h-full overflow-auto scroll-thin">
      <div className="max-w-6xl mx-auto px-8 py-10 fade-in">
        <div className="label mb-1">Decision Intelligence</div>
        <h1 className="serif text-3xl mb-1">Is this idea worth pursuing — and can you prove it?</h1>
        <p className="text-ink2 mb-8 max-w-3xl">Attractiveness (weighted scores) and evidence confidence are kept apart. Mandatory risk gates can block any concept. The engine recommends; a named person decides — and the decision is flagged if its inputs change later.</p>
        <DecisionCockpit go={go} />
        <div className="label mt-4 mb-4 pt-6 border-t border-line">Scoring detail — weights, matrix, sensitivity, assumptions</div>

        <Section title="Weighted ranking" right={<button className="btn" disabled={!!busy} onClick={evaluate}>Re-evaluate</button>}>
          <div className="grid md:grid-cols-[1fr_320px] gap-6">
            <ol className="space-y-2">
              {rows.map((r) => (
                <li key={r.ideaId} className="card p-4 flex items-center gap-4">
                  <span className="serif text-2xl w-8 text-ink3">{r.rank || "–"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.title}</div>
                    <div className="text-xs text-ink3">Coverage {Math.round(r.coverage * 100)}% of weight · {Math.round(r.lowConfidenceShare * 100)}% rests on low-confidence or missing evidence{pareto.includes(r.ideaId) && <span className="text-accent2"> · on the Pareto frontier</span>}</div>
                  </div>
                  <div className="text-right">
                    <div className="serif text-2xl tabular-nums">{r.weighted ?? "—"}</div>
                    <div className={`text-[11px] ${r.provisional ? "text-warn" : "text-ok"}`}>{r.provisional ? "Provisional" : "Scored"}</div>
                  </div>
                </li>
              ))}
            </ol>
            <RiskImpact rows={rows} pareto={pareto} />
          </div>
          <p className="text-xs text-ink3 mt-3">{ev.caveats}</p>
        </Section>

        <Section title="Evaluation matrix" kicker="Click a score to see rationale, evidence and downside · edit to challenge it">
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="p-3 font-normal text-ink3 w-64">Criterion · weight</th>
                  {ideas.map((i) => <th key={i.id} className="p-3 font-medium">{i.title}<div className="text-[11px] text-ink3 font-normal">{i.tier}</div></th>)}
                </tr>
              </thead>
              <tbody>
                {dims.map((d) => (
                  <tr key={d} className="border-b border-line/60 align-top">
                    <td className="p-3">
                      <div>{label(d)}</div>
                      <div className="flex items-center gap-2 mt-1" onPointerDown={checkpoint}>
                        <input type="range" min={0} max={40} value={p.weights[d] ?? 0} className="w-28" aria-label={`Weight for ${label(d)}`} onChange={(e) => setQuiet((c) => ({ ...c, weights: { ...c.weights, [d]: Number(e.target.value) } }))} />
                        <span className="text-xs text-ink3 tabular-nums">{p.weights[d]} ({Math.round((norm[d] ?? 0) * 100)}%)</span>
                        {d.startsWith("custom:") && <button className="text-xs text-ink3 hover:text-danger" aria-label="Remove criterion" onClick={() => set((c) => { const w = { ...c.weights }; delete w[d]; return { ...c, weights: w }; }, "criterion.removed")}>✕</button>}
                      </div>
                    </td>
                    {ideas.map((i) => {
                      const s = cell(i.id, d);
                      const k = `${i.id}:${d}`;
                      return (
                        <td key={i.id} className="p-3">
                          <div className="flex items-center gap-2">
                            <input className="input !w-16 !py-1 tabular-nums" inputMode="numeric" value={s?.score ?? ""} placeholder="—" aria-label={`Score ${i.title} ${label(d)}`}
                              onChange={(e) => { const v = e.target.value.trim(); const n = Number(v); if (v === "") override(i.id, d, null); else if (Number.isFinite(n) && n >= 0 && n <= 100) override(i.id, d, n); }} />
                            {s && <button className="text-[11px] text-ink3 hover:text-ink" onClick={() => setOpen(open === k ? null : k)}>{s.evidence === "missing" ? "◌ no evidence" : s.evidence === "user_provided" ? "● yours" : "◐ supported"} · {s.confidence}</button>}
                          </div>
                          {s?.score === null && <div className="text-[11px] text-warn mt-1">Unscored — not enough basis</div>}
                          {open === k && s && (
                            <div className="mt-2 text-xs text-ink2 space-y-1 fade-in">
                              <p>{s.rationale}</p>
                              {s.assumptions.length > 0 && <p><span className="text-warn">Assumes:</span> {s.assumptions.join("; ")}</p>}
                              {s.downside && <p><span style={{ color: "var(--t-risk)" }}>Downside:</span> {s.downside}</p>}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <input className="input !w-64 !py-1.5" placeholder="Add your own criterion…" value={newCrit} onChange={(e) => setNewCrit(e.target.value)} />
            <button className="btn !py-1.5" disabled={!newCrit.trim()} onClick={() => { set((c) => ({ ...c, weights: { ...c.weights, [`custom:${newCrit.trim()}`]: 10 } }), "criterion.added"); setNewCrit(""); }}>Add criterion</button>
            <button className="btn btn-ghost !py-1.5" onClick={() => set((c) => ({ ...c, weights: { ...DEFAULT_WEIGHTS } }), "weights.reset")}>Reset weights</button>
          </div>
          <div className="mt-4 card p-4">
            <div className="label mb-2">Sensitivity to your weights (±10 points)</div>
            {sens.filter((s) => s.flipsLeader).length === 0
              ? <p className="text-sm text-ink2">The leading option stays on top under any single ±10 weight change — the ranking is fairly robust.</p>
              : <ul className="text-sm text-ink2 space-y-1">{sens.filter((s) => s.flipsLeader).map((s) => <li key={s.dimension}>Changing <b>{label(s.dimension)}</b> would make <b>{s.newLeader}</b> the leader.</li>)}</ul>}
          </div>
        </Section>

        <Section title="Assumption register" kicker="Every significant assumption, with how it will be tested">
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-ink3"><th className="p-3 font-normal">Assumption</th><th className="p-3 font-normal">Source</th><th className="p-3 font-normal">Confidence</th><th className="p-3 font-normal">Owner</th><th className="p-3 font-normal">Status</th><th className="p-3"></th></tr></thead>
              <tbody>
                {assumptionNodes.map((n) => (
                  <tr key={n.id} className="border-b border-line/60">
                    <td className="p-3">{n.title}<div className="text-xs text-ink3">{n.description}</div></td>
                    <td className="p-3 text-xs text-ink3">Map</td>
                    <td className="p-3 text-xs">{n.confidence ?? "—"}</td>
                    <td className="p-3 text-xs">{n.owner ?? "—"}</td>
                    <td className="p-3">
                      <select className="input !py-1 !w-36 text-xs" value={n.status} onChange={(e) => set((c) => ({ ...c, nodes: c.nodes.map((x) => (x.id === n.id ? { ...x, status: e.target.value } : x)) }), "assumption.status")}>
                        {["open", "testing", "validated", "invalidated"].map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="p-3"><button className="text-xs text-ink3 hover:text-accent" onClick={() => { select(n.id); go("canvas"); }}>Open</button></td>
                  </tr>
                ))}
                {ideas.flatMap((i) => i.keyAssumptions.map((a) => ({ i, a }))).filter(({ a }) => !assumptionNodes.some((n) => n.title === a.slice(0, 140))).map(({ i, a }) => (
                  <tr key={i.id + a} className="border-b border-line/60 text-ink2">
                    <td className="p-3">{a}</td><td className="p-3 text-xs text-ink3">{i.title}</td><td className="p-3 text-xs">—</td><td className="p-3 text-xs">—</td><td className="p-3 text-xs">not on map</td>
                    <td className="p-3"><button className="text-xs text-accent" onClick={() => set((c) => {
                      const parent = c.nodes.find((n) => n.tags.includes(`idea:${i.id}`));
                      const n = makeNode({ type: "assumption", title: a.slice(0, 140), description: "Validation method: ", parentId: parent?.id ?? null }, { source: "ai", op: "ideate", at: now(), claim: "working_assumption" });
                      return { ...c, nodes: [...c.nodes, ...placeNew(c.nodes, [n])], edges: parent ? [...c.edges, { id: nid(), source: parent.id, target: n.id, kind: "child" }] : c.edges };
                    }, "assumption.tracked")}>Track</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink3 mt-2">Mark an assumption <b>invalidated</b> and its downstream branch on the canvas shows the change; revisit the decision below if it mattered.</p>
        </Section>

      </div>
    </div>
  );
}

function RiskImpact({ rows, pareto }: { rows: ReturnType<typeof scoreIdeas>; pareto: string[] }) {
  const W = 320, H = 240, pad = 34;
  const x = (risk: number) => pad + ((risk - 1) / 4) * (W - pad * 2);
  const y = (impact: number) => H - pad - ((impact - 1) / 4) * (H - pad * 2);
  return (
    <figure className="card p-3">
      <figcaption className="label mb-1">Risk vs impact (bubble = cost)</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Risk versus impact chart">
        <rect x={pad} y={pad} width={(W - pad * 2) / 2} height={(H - pad * 2) / 2} fill="var(--accent-2)" opacity={0.07} />
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--line-2)" />
        <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="var(--line-2)" />
        <text x={W / 2} y={H - 8} fill="var(--ink-3)" fontSize="10" textAnchor="middle">Risk →</text>
        <text x={10} y={H / 2} fill="var(--ink-3)" fontSize="10" textAnchor="middle" transform={`rotate(-90 10 ${H / 2})`}>Impact →</text>
        <text x={pad + 4} y={pad + 12} fill="var(--accent-2)" fontSize="9">high impact, low risk</text>
        {rows.filter((r) => r.impact).map((r, i) => (
          <g key={r.ideaId}>
            <circle cx={x(r.riskLevel) + (i % 2) * 6} cy={y(r.impact)} r={5 + r.costLevel * 2.5} fill="var(--accent)" opacity={0.25} stroke={pareto.includes(r.ideaId) ? "var(--accent-2)" : "var(--accent)"} strokeWidth={pareto.includes(r.ideaId) ? 2 : 1} />
            <text x={x(r.riskLevel) + (i % 2) * 6} y={y(r.impact) + 3} fill="var(--ink)" fontSize="10" textAnchor="middle">{r.ideaId}</text>
          </g>
        ))}
      </svg>
      <p className="text-[11px] text-ink3">Green outline = Pareto-efficient (no option beats it on impact, risk and cost at once). Relative 1–5 estimates.</p>
    </figure>
  );
}
