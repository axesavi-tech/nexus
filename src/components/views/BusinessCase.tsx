"use client";
import { useMemo, useState } from "react";
import { useNexus } from "@/lib/store";
import { FIN_DRIVERS, type BusinessCase as BC, type FinDriver, type ScenarioMult } from "@/lib/schemas";
import { DEFAULT_INPUTS, DRIVER_META, FORMULAS, SCENARIO_DEFAULTS, cashflows, fmtMoney, scenarioTable, tornado, validateInputs } from "@/lib/finance";
import { recommendAll } from "@/lib/decision";
import { now } from "@/lib/graph";
import { Empty, Section } from "../ui";
import { StatusBadge } from "./DecisionCockpit";
import type { ViewId } from "../Workspace";

const CURRENCIES = ["INR", "USD", "GBP", "EUR", "SGD", "AED"];
const pct = (n: number | null) => (n === null || !Number.isFinite(n) ? "—" : `${n.toFixed(1)}%`);
const yrs = (n: number | null) => (n === null ? "never (in horizon)" : `${n.toFixed(1)} yrs`);

export function BusinessCase({ go }: { go: (v: ViewId) => void }) {
  const { p, os, suggestFinancials, busy } = useNexus();
  const ideas = p?.ideas?.ideas ?? [];
  const recs = useMemo(() => (p ? recommendAll(p) : []), [p]);
  const [ideaId, setIdeaId] = useState<string | null>(p?.selectedIdeaId ?? recs.find((r) => r.status === "PROCEED_TO_BUSINESS_CASE")?.ideaId ?? ideas[0]?.id ?? null);
  const [currency, setCurrency] = useState("INR");
  const [notes, setNotes] = useState("");
  const [showFormulas, setShowFormulas] = useState(false);
  if (!p) return null;
  if (!ideas.length) return <Empty title="No concepts to model yet" body="Develop concepts in the Ideation Studio first; the business case models one concept at a time." action={<button className="btn btn-primary" onClick={() => go("design")}>Ideation Studio</button>} />;
  const idea = ideas.find((i) => i.id === ideaId) ?? ideas[0];
  const bc = p.os?.businessCases.find((b) => b.ideaId === idea.id);
  const rec = recs.find((r) => r.ideaId === idea.id);

  const upd = (fn: (b: BC) => BC, label = "business_case.edited") =>
    os((o) => ({ ...o, businessCases: o.businessCases.map((b) => (b.ideaId === idea.id ? { ...fn(b), updatedAt: now() } : b)) }), label);
  const startBlank = () => os((o) => ({ ...o, businessCases: [...o.businessCases.filter((b) => b.ideaId !== idea.id), { ideaId: idea.id, inputs: { ...DEFAULT_INPUTS, currency }, sources: {}, scenarios: { ...SCENARIO_DEFAULTS }, updatedAt: now() }] }), "business_case.created");

  return (
    <div className="h-full overflow-auto scroll-thin">
      <div className="max-w-6xl mx-auto px-8 py-10 fade-in">
        <div className="label mb-1">Business Case</div>
        <h1 className="serif text-3xl mb-1">Does the investment make sense?</h1>
        <p className="text-ink2 mb-6 max-w-3xl">A transparent model you control. The AI can suggest starting assumptions (always labelled), but every number is calculated by the platform with formulas you can inspect — and invented assumptions are never presented as forecasts.</p>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="label mr-1">Concept</span>
          {ideas.map((i) => <button key={i.id} className={`chip ${i.id === idea.id ? "!border-accent !text-accent" : ""}`} onClick={() => setIdeaId(i.id)}>{i.title.slice(0, 48)}{p.os?.businessCases.some((b) => b.ideaId === i.id) && " · modelled"}</button>)}
          {rec && <span className="ml-auto"><StatusBadge s={rec.status} /></span>}
        </div>

        {!bc ? (
          <div className="card p-6 grid md:grid-cols-[1fr_auto] gap-4 items-end">
            <div>
              <h3 className="serif text-xl mb-1">{idea.title}</h3>
              <p className="text-sm text-ink2 mb-3">{idea.valueProposition}</p>
              <label className="text-sm block">Anything the model should know? (optional)<input className="input mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. current AOV ₹9,500, ~1,000 orders/yr, 2 people" /></label>
            </div>
            <div className="flex flex-col gap-2">
              <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
              <button className="btn btn-primary" disabled={!!busy} onClick={() => suggestFinancials(idea.id, currency, notes || undefined)}>Suggest starting assumptions</button>
              <button className="btn" onClick={startBlank}>Start with a blank model</button>
            </div>
          </div>
        ) : <Model bc={bc} upd={upd} showFormulas={showFormulas} setShowFormulas={setShowFormulas} go={go} />}
      </div>
    </div>
  );
}

function Model({ bc, upd, showFormulas, setShowFormulas, go }: { bc: BC; upd: (fn: (b: BC) => BC, label?: string) => void; showFormulas: boolean; setShowFormulas: (v: boolean) => void; go: (v: ViewId) => void }) {
  const { checkpoint, setQuiet } = useNexus();
  const i = bc.inputs;
  const errors = validateInputs(i);
  const quiet = (fn: (b: BC) => BC) => setQuiet((c) => ({ ...c, os: c.os && { ...c.os, businessCases: c.os.businessCases.map((b) => (b.ideaId === bc.ideaId ? { ...fn(b), updatedAt: now() } : b)) } }));
  const setDriver = (k: FinDriver, v: number) => quiet((b) => ({ ...b, inputs: { ...b.inputs, [k]: v }, sources: { ...b.sources, [k]: { by: "user", rationale: "Entered by you" } } }));
  const table = errors.length ? [] : scenarioTable(bc);
  const base = table.find((t) => t.key === "base");
  const rows = errors.length ? [] : cashflows(i, bc.scenarios.base);
  const tor = errors.length ? [] : tornado(i);
  const aiCount = FIN_DRIVERS.filter((k) => bc.sources[k] && bc.sources[k]!.by !== "user").length;
  const m = (n: number) => fmtMoney(n, i.currency);

  return (
    <>
      {aiCount > 0 && <div className="card p-3 mb-5 !border-warn text-sm">⚠ {aiCount} driver(s) are <b>AI-suggested placeholders</b>, not estimates you have verified. Replace them with your own figures — each one turns to “yours” when you edit it.</div>}
      <div className="grid lg:grid-cols-[340px_1fr] gap-6">
        <aside className="card p-4 h-fit" onFocus={checkpoint}>
          <div className="label mb-3">Assumptions</div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <label className="text-xs">Currency<select className="input mt-1 !py-1 text-sm" value={i.currency} onChange={(e) => quiet((b) => ({ ...b, inputs: { ...b.inputs, currency: e.target.value } }))}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="text-xs">Years<input type="number" min={1} max={15} className="input mt-1 !py-1 text-sm" value={i.horizonYears} onChange={(e) => quiet((b) => ({ ...b, inputs: { ...b.inputs, horizonYears: Number(e.target.value) } }))} /></label>
            <label className="text-xs">Discount %<input type="number" step={0.5} className="input mt-1 !py-1 text-sm" value={i.discountRate} onChange={(e) => quiet((b) => ({ ...b, inputs: { ...b.inputs, discountRate: Number(e.target.value) } }))} /></label>
          </div>
          <label className="text-xs block mb-3">Unit<input className="input mt-1 !py-1 text-sm" value={i.unitLabel} onChange={(e) => quiet((b) => ({ ...b, inputs: { ...b.inputs, unitLabel: e.target.value } }))} /></label>
          <div className="space-y-2.5">
            {FIN_DRIVERS.map((k) => {
              const src = bc.sources[k];
              const meta = DRIVER_META[k];
              return (
                <label key={k} className="block">
                  <div className="flex items-center justify-between text-xs">
                    <span title={meta.help}>{meta.label}{k === "volumeY1" ? ` (${i.unitLabel})` : ""}{meta.unit === "pct" ? " %" : meta.unit === "money" ? ` (${i.currency})` : ""}</span>
                    {src && <span className="text-[10px]" style={{ color: src.by === "user" ? "var(--ok)" : "var(--warn)" }} title={src.rationale}>{src.by === "user" ? "yours" : src.by === "ai" ? "AI placeholder" : "dev placeholder"}</span>}
                  </div>
                  <input type="number" className="input !py-1 mt-0.5 text-sm tabular-nums" value={Number.isFinite(i[k]) ? i[k] : ""} onChange={(e) => setDriver(k, e.target.value === "" ? 0 : Number(e.target.value))} aria-label={meta.label} />
                  {src && src.by !== "user" && <div className="text-[10.5px] text-ink3 mt-0.5 leading-snug">{src.rationale}</div>}
                </label>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0">
          {errors.length > 0 ? (
            <div className="card p-4 !border-danger" role="alert"><div className="font-medium text-danger mb-1">The model cannot be calculated until these inputs are fixed:</div><ul className="text-sm list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <Tile k="NPV (base)" v={m(base!.npv)} tone={base!.npv >= 0 ? "ok" : "danger"} sub={`at ${i.discountRate}% over ${i.horizonYears} yrs`} />
                <Tile k="IRR" v={pct(base!.irr)} sub="discount rate where NPV = 0" />
                <Tile k="Payback" v={yrs(base!.paybackYears)} sub={`peak funding ${m(base!.peakFunding)}`} />
                <Tile k="ROI" v={base!.roi === null ? "—" : `${(base!.roi * 100).toFixed(0)}%`} sub={`cost of 1-yr delay ${m(base!.costOfDelay)}`} />
              </div>

              <Section title="Scenarios" kicker="Multipliers on volume, price and cost — edit to make your own">
                <div className="card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-line text-left text-ink3"><th className="p-2.5 font-normal">Scenario</th><th className="p-2.5 font-normal">Volume ×</th><th className="p-2.5 font-normal">Price ×</th><th className="p-2.5 font-normal">Cost ×</th><th className="p-2.5 font-normal text-right">Revenue</th><th className="p-2.5 font-normal text-right">NPV</th><th className="p-2.5 font-normal text-right">IRR</th><th className="p-2.5 font-normal text-right">Payback</th><th className="p-2.5 font-normal text-right">Gross margin</th></tr></thead>
                    <tbody>
                      {table.map((s) => (
                        <tr key={s.key} className="border-b border-line/60">
                          <td className="p-2.5 capitalize">{s.key}{s.key === "custom" && <button className="ml-2 text-xs text-ink3 hover:text-danger" onClick={() => upd((b) => { const sc = { ...b.scenarios }; delete sc.custom; return { ...b, scenarios: sc }; })}>remove</button>}</td>
                          {(["volume", "price", "cost"] as (keyof ScenarioMult)[]).map((f) => (
                            <td key={f} className="p-2"><input type="number" step={0.05} min={0} className="input !py-0.5 !px-2 !w-16 text-sm tabular-nums" value={s.m[f]} aria-label={`${s.key} ${f} multiplier`}
                              onChange={(e) => quiet((b) => ({ ...b, scenarios: { ...b.scenarios, [s.key]: { ...s.m, [f]: Math.max(0, Number(e.target.value)) } } }))} /></td>
                          ))}
                          <td className="p-2.5 text-right tabular-nums whitespace-nowrap">{m(s.totalRevenue)}</td>
                          <td className="p-2.5 text-right tabular-nums whitespace-nowrap" style={{ color: s.npv >= 0 ? "var(--ok)" : "var(--danger)" }}>{m(s.npv)}</td>
                          <td className="p-2.5 text-right tabular-nums">{pct(s.irr)}</td>
                          <td className="p-2.5 text-right tabular-nums">{s.paybackYears === null ? "—" : s.paybackYears.toFixed(1)}</td>
                          <td className="p-2.5 text-right tabular-nums">{pct(s.grossMarginPct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!bc.scenarios.custom && <button className="btn btn-ghost !py-1 text-xs mt-2" onClick={() => upd((b) => ({ ...b, scenarios: { ...b.scenarios, custom: { volume: 1, price: 1, cost: 1 } } }))}>＋ Custom scenario</button>}
              </Section>

              <Section title="Cash flow — base scenario" kicker={`Bars = annual cash flow · line = cumulative (${i.currency})`}>
                <CashChart rows={rows} m={m} />
                <div className="card overflow-x-auto mt-3">
                  <table className="w-full text-xs tabular-nums">
                    <thead><tr className="border-b border-line text-ink3"><th className="p-2 text-left font-normal">Year</th>{rows.map((r) => <th key={r.t} className="p-2 text-right font-normal">{r.t}</th>)}</tr></thead>
                    <tbody>
                      {([["Volume", (r) => (r.t ? Math.round(r.volume).toLocaleString("en-IN") : "")], ["Revenue", (r) => m(r.revenue)], ["Variable cost", (r) => m(-r.variableCost)], ["Contribution", (r) => m(r.contribution)], ["Fixed opex", (r) => m(-r.fixed)], ["Savings", (r) => m(r.savings)], ["Cash flow", (r) => m(r.cash)], ["Cumulative", (r) => m(r.cumulative)], ["Discounted", (r) => m(r.discounted)]] as [string, (r: (typeof rows)[number]) => string][]).map(([k, f]) => (
                        <tr key={k} className="border-b border-line/50"><td className="p-2 text-ink2">{k}</td>{rows.map((r) => <td key={r.t} className="p-2 text-right">{f(r)}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section title="Sensitivity" kicker="NPV change when each driver moves ±20% — the top bars are what to validate first">
                <div className="card p-4 space-y-1.5">
                  {tor.length === 0 ? <p className="text-sm text-ink3">Enter non-zero drivers to see sensitivity.</p> : tor.map((t) => {
                    const max = Math.max(...tor.map((x) => Math.max(Math.abs(x.low), Math.abs(x.high)))) || 1;
                    const w = (v: number) => `${(Math.abs(v) / max) * 50}%`;
                    return (
                      <div key={t.driver} className="grid grid-cols-[160px_1fr_90px] items-center gap-2 text-xs">
                        <span className="text-ink2 truncate">{DRIVER_META[t.driver].label}</span>
                        <div className="relative h-4 bg-bg2 rounded">
                          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-line2" />
                          {[t.low, t.high].map((v, k) => <div key={k} className="absolute top-0.5 bottom-0.5 rounded-sm" style={{ background: v < 0 ? "var(--danger)" : "var(--ok)", opacity: 0.75, width: w(v), left: v < 0 ? `calc(50% - ${w(v)})` : "50%" }} />)}
                        </div>
                        <span className="text-right tabular-nums text-ink3">±{m(t.swing / 2)}</span>
                      </div>
                    );
                  })}
                </div>
              </Section>

              <div className="flex flex-wrap items-center gap-2">
                <button className="btn btn-ghost text-sm" onClick={() => setShowFormulas(!showFormulas)}>{showFormulas ? "Hide" : "Inspect"} formulas</button>
                <button className="btn btn-primary ml-auto" onClick={() => go("board")}>Back to the decision →</button>
              </div>
              {showFormulas && (
                <div className="card p-4 mt-3 text-sm">
                  <dl className="space-y-2">{FORMULAS.map((f) => <div key={f.name}><dt className="font-medium">{f.name}</dt><dd className="font-mono text-xs text-ink2">{f.formula}</dd></div>)}</dl>
                  <p className="text-xs text-ink3 mt-3">Simplifications: EBITDA used as cash flow; tax, depreciation, financing and working capital are not modelled. Add them before using this for a funding decision.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Tile({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: "ok" | "danger" }) {
  return <div className="card p-3"><div className="label">{k}</div><div className="serif text-2xl mt-1 tabular-nums" style={{ color: tone ? `var(--${tone})` : undefined }}>{v}</div>{sub && <div className="text-[11px] text-ink3 mt-0.5">{sub}</div>}</div>;
}

function CashChart({ rows, m }: { rows: ReturnType<typeof cashflows>; m: (n: number) => string }) {
  const W = 720, H = 220, pad = 40;
  const vals = rows.flatMap((r) => [r.cash, r.cumulative]);
  const max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const y = (v: number) => pad / 2 + ((max - v) / (max - min)) * (H - pad);
  const bw = (W - pad * 2) / rows.length;
  const x = (t: number) => pad + bw * t + bw / 2;
  return (
    <figure className="card p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Annual and cumulative cash flow">
        <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="var(--line-2)" />
        {rows.map((r) => <rect key={r.t} x={x(r.t) - bw * 0.3} width={bw * 0.6} y={Math.min(y(0), y(r.cash))} height={Math.abs(y(r.cash) - y(0))} fill={r.cash >= 0 ? "var(--accent-2)" : "var(--danger)"} opacity={0.7} rx={3}><title>Year {r.t}: {m(r.cash)}</title></rect>)}
        <polyline fill="none" stroke="var(--accent)" strokeWidth={2} points={rows.map((r) => `${x(r.t)},${y(r.cumulative)}`).join(" ")} />
        {rows.map((r) => <circle key={r.t} cx={x(r.t)} cy={y(r.cumulative)} r={3} fill="var(--accent)"><title>Cumulative after year {r.t}: {m(r.cumulative)}</title></circle>)}
        {rows.map((r) => <text key={r.t} x={x(r.t)} y={H - 4} fontSize="10" fill="var(--ink-3)" textAnchor="middle">Y{r.t}</text>)}
        <text x={4} y={y(max) + 4} fontSize="9" fill="var(--ink-3)">{m(max)}</text>
        {min < 0 && <text x={4} y={y(min)} fontSize="9" fill="var(--ink-3)">{m(min)}</text>}
      </svg>
    </figure>
  );
}
