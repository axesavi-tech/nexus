"use client";
import { useMemo, useState } from "react";
import { useNexus } from "@/lib/store";
import {
  TECHNIQUES_INFO, HMW_ANGLE_LABEL, PROTOTYPE_LABEL, dotBudget, dotsUsed, emptyDesign, quadrant, rankAssumptions, riskScore,
  techniqueById, testProgress, topSparks, designPhase,
} from "@/lib/design";
import type { DesignState, Persona, Spark, TestRecord, TestStatus } from "@/lib/schemas";
import { nid, now } from "@/lib/graph";
import { ClaimTag, Empty, Section } from "../ui";
import type { ViewId } from "../Workspace";

type Tab = "empathize" | "define" | "ideate" | "test";
const TABS: { id: Tab; n: number; name: string; q: string }[] = [
  { id: "empathize", n: 1, name: "Empathize", q: "Who is this for, really?" },
  { id: "define", n: 2, name: "Define", q: "What problem is worth solving?" },
  { id: "ideate", n: 3, name: "Ideate", q: "How many ways could we solve it?" },
  { id: "test", n: 4, name: "Prototype & Test", q: "What must be true — and how do we find out cheaply?" },
];
const LENS_COLOR: Record<string, string> = { desirability: "var(--t-stakeholder)", feasibility: "var(--t-experiment)", viability: "var(--t-idea)" };

export function DesignStudio({ go, initial }: { go: (v: ViewId) => void; initial?: Tab }) {
  const { p } = useNexus();
  const phase = designPhase(p?.design ?? null, !!p?.ideas);
  const [tab, setTab] = useState<Tab>(() => initial ?? (["empathize", "define", "ideate", "test", "test"] as Tab[])[phase]);
  if (!p) return null;
  const d = p.design ?? emptyDesign();
  const done: Record<Tab, boolean> = {
    empathize: !!d.empathy, define: d.hmws.length > 0, ideate: d.sparks.some((s) => s.votes > 0), test: d.tests.length > 0,
  };

  return (
    <div className="h-full overflow-auto scroll-thin">
      <div className="max-w-6xl mx-auto px-8 pt-8 pb-16 fade-in">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <div className="label mb-1">{tab === "empathize" || tab === "define" ? "Problem Discovery" : tab === "ideate" ? "Ideation Studio" : "Validation Lab"} · human-centred design thinking</div>
            <h1 className="serif text-3xl">{TABS.find((t) => t.id === tab)!.q}</h1>
          </div>
          <nav className="card flex p-1 gap-1" role="tablist" aria-label="Design thinking phases">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 ${tab === t.id ? "bg-panel2 text-ink" : "text-ink3 hover:text-ink"}`}>
                <span className={`h-5 w-5 grid place-items-center rounded-full text-[11px] ${done[t.id] ? "bg-accent2 text-bg" : "border border-line2"}`}>{done[t.id] ? "✓" : t.n}</span>{t.name}
              </button>
            ))}
          </nav>
        </div>
        {tab === "empathize" && <EmpathizeTab d={d} next={() => setTab("define")} />}
        {tab === "define" && <DefineTab d={d} ideate={() => setTab("ideate")} back={() => setTab("empathize")} />}
        {tab === "ideate" && <IdeateTab d={d} go={go} define={() => setTab("define")} test={() => setTab("test")} />}
        {tab === "test" && <TestTab d={d} go={go} ideate={() => setTab("ideate")} />}
      </div>
    </div>
  );
}

// ================================ EMPATHIZE ================================
function EmpathizeTab({ d, next }: { d: DesignState; next: () => void }) {
  const { p, setQuiet, checkpoint, empathize, busy } = useNexus();
  const E = d.empathy;
  return (
    <>
      <div className="grid lg:grid-cols-[1fr_300px] gap-5 mb-10">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="nx-notes" className="label">Research notes (optional, recommended)</label>
            <span className="text-[11px] text-ink3">{d.notes.length.toLocaleString()} / 20,000</span>
          </div>
          <textarea id="nx-notes" className="input min-h-[140px] text-sm leading-relaxed" maxLength={20000} value={d.notes}
            onFocus={checkpoint}
            onChange={(e) => setQuiet((c) => ({ ...c, design: { ...(c.design ?? emptyDesign()), notes: e.target.value } }))}
            placeholder={"Paste interview notes, customer quotes, survey answers, support tickets, observations…\n\n“I spend Sunday evenings re-doing the onboarding forms because the portal times out.” — Ops lead, interview 3"} />
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button className="btn btn-primary" disabled={!!busy || !p} onClick={empathize}>{E ? "Rebuild personas & journeys" : "Build personas & journeys"}</button>
            <span className="text-xs text-ink3">{d.notes.trim() ? "Personas will be grounded in your notes." : "Without notes you get proto-personas: hypotheses to go and validate."}</span>
          </div>
        </div>
        <div className="card p-5 text-sm text-ink2 leading-relaxed">
          <div className="label mb-2">Why start here</div>
          Great ideas come from understanding people, not from the solution you already had in mind. NEXUS drafts personas, empathy maps and journeys, then turns the pain points into <em>How Might We</em> questions you can ideate on.
          {E && E.researchGaps.length > 0 && (
            <>
              <div className="label mt-4 mb-1">Go and find out</div>
              <ul className="list-disc pl-4 space-y-1">{E.researchGaps.map((g) => <li key={g}>{g}</li>)}</ul>
            </>
          )}
        </div>
      </div>

      {!E ? (
        <Empty title="No personas yet" body="Build personas from your thought — or paste research notes first for personas grounded in real evidence." />
      ) : (
        <>
          <div className="space-y-6">{E.personas.map((ps) => <PersonaCard key={ps.id} ps={ps} />)}</div>
          <div className="flex justify-end mt-8"><button className="btn btn-primary" onClick={next}>Define the problem →</button></div>
        </>
      )}
    </>
  );
}

function PersonaCard({ ps }: { ps: Persona }) {
  const { toMap } = useNexus();
  const [added, setAdded] = useState(false);
  const quad: [string, string[], string][] = [["Says", ps.empathy.says, "var(--t-question)"], ["Thinks", ps.empathy.thinks, "var(--t-insight)"], ["Does", ps.empathy.does, "var(--t-action)"], ["Feels", ps.empathy.feels, "var(--t-problem)"]];
  return (
    <article className="card p-6" aria-label={`Persona ${ps.name}`}>
      <header className="flex flex-wrap items-start gap-4 mb-5">
        <div className="h-14 w-14 rounded-full grid place-items-center serif text-2xl shrink-0" style={{ background: "color-mix(in oklab, var(--t-stakeholder) 25%, transparent)", color: "var(--t-stakeholder)" }} aria-hidden>{ps.name.charAt(0)}</div>
        <div className="flex-1 min-w-[220px]">
          <div className="flex flex-wrap items-center gap-2"><h3 className="serif text-2xl">{ps.name}</h3><span className="text-ink2">· {ps.role}</span>
            <span className="chip !text-[10.5px]" style={ps.basis === "proto_persona" ? { borderColor: "var(--warn)", color: "var(--warn)" } : { borderColor: "var(--ok)", color: "var(--ok)" }}
              title={ps.basis === "proto_persona" ? "Built from assumptions, not research — validate with real people" : "Grounded in the research notes you provided"}>
              {ps.basis === "proto_persona" ? "Proto-persona · assumption" : "Grounded in your research"}
            </span>
          </div>
          <p className="text-sm text-ink2 mt-1 leading-relaxed">{ps.context}</p>
          {ps.quote && <p className="serif text-lg mt-2 text-ink">“{ps.quote.replace(/^["“]|["”]$/g, "")}”</p>}
        </div>
        <button className="btn !py-1 text-xs" disabled={added} onClick={() => { toMap({ kind: "persona", id: ps.id }); setAdded(true); }}>{added ? "✓ On the map" : "Add to map"}</button>
      </header>

      <div className="grid md:grid-cols-[1.1fr_1fr] gap-5">
        <div>
          <div className="label mb-2">Empathy map</div>
          <div className="grid grid-cols-2 gap-px bg-line rounded-xl overflow-hidden border border-line">
            {quad.map(([k, items, c]) => (
              <div key={k} className="bg-panel p-3 min-h-[96px]">
                <div className="text-[11px] uppercase tracking-wider font-semibold mb-1" style={{ color: c }}>{k}</div>
                <ul className="text-sm space-y-1 text-ink2">{items.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {([["Goals", ps.goals, "var(--t-outcome)"], ["Pains", ps.pains, "var(--t-problem)"], ["Gains", ps.gains, "var(--t-opportunity)"]] as [string, string[], string][]).map(([k, items, c]) => (
            <div key={k}><div className="label mb-2" style={{ color: c }}>{k}</div><ul className="space-y-1.5 text-ink2">{items.map((x) => <li key={x}>{x}</li>)}</ul></div>
          ))}
        </div>
      </div>
      <JourneyMap journey={ps.journey} />
    </article>
  );
}

function JourneyMap({ journey }: { journey: Persona["journey"] }) {
  const n = journey.length;
  const W = 1000, H = 120, pad = 1000 / n / 2;
  const pts = journey.map((j, i) => ({ x: pad + (i * (W - 2 * pad)) / Math.max(1, n - 1), y: H / 2 - j.emotion * 24, e: j.emotion }));
  const path = pts.map((q, i) => (i === 0 ? `M${q.x},${q.y}` : `C${(pts[i - 1].x + q.x) / 2},${pts[i - 1].y} ${(pts[i - 1].x + q.x) / 2},${q.y} ${q.x},${q.y}`)).join(" ");
  const low = journey.reduce((m, j, i) => (j.emotion < journey[m].emotion ? i : m), 0);
  return (
    <div className="mt-6">
      <div className="label mb-2">Journey · emotional curve</div>
      <div className="rounded-xl border border-line bg-bg2 overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[110px] block" preserveAspectRatio="none" role="img" aria-label="Emotional journey curve">
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--line-2)" strokeDasharray="4 6" />
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
          {journey.map((j, i) => (
            <div key={i} className="px-3 pb-3 text-xs border-l border-line first:border-l-0 relative">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: pts[i].e < 0 ? "var(--danger)" : pts[i].e > 0 ? "var(--ok)" : "var(--ink-3)" }} />
                <span className="font-semibold text-ink text-[12.5px]">{j.stage}</span>
                {i === low && j.emotion < 0 && <span className="chip !py-0 !text-[10px] !border-danger !text-danger">low point</span>}
              </div>
              <p className="text-ink2 mb-1">{j.action}</p>
              <p><span style={{ color: "var(--t-problem)" }}>Pain:</span> <span className="text-ink2">{j.pain}</span></p>
              <p className="mt-0.5"><span style={{ color: "var(--t-opportunity)" }}>Opportunity:</span> <span className="text-ink2">{j.opportunity}</span></p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ================================ DEFINE ================================
function DefineTab({ d, ideate, back }: { d: DesignState; ideate: () => void; back: () => void }) {
  const { design, toMap } = useNexus();
  const [draft, setDraft] = useState("");
  const [onMap, setOnMap] = useState<Set<string>>(new Set());
  const E = d.empathy;
  const mark = (id: string) => setOnMap((s) => new Set(s).add(id));
  const addHmw = () => {
    const q = draft.trim();
    if (!q) return;
    const question = /^how might we/i.test(q) ? q : `How might we ${q.replace(/^\s*/, "").replace(/\?*$/, "")}?`;
    const id = `h_${nid()}`;
    design((c) => ({ ...c, hmws: [...c.hmws, { id, question, source: "user" }], activeHmwId: c.activeHmwId ?? id }), "design.hmw.added");
    setDraft("");
  };
  const sparkCount = (id: string) => d.sparks.filter((s) => s.hmwId === id).length;
  const sorted = [...d.hmws].sort((a, b) => Number(!!b.starred) - Number(!!a.starred));

  return (
    <>
      {!E && <div className="card p-4 mb-6 text-sm text-ink2 flex flex-wrap items-center gap-3">No personas yet — you can still write your own How Might We questions, or <button className="btn !py-1 text-xs" onClick={back}>← build empathy first</button></div>}
      {E && (
        <div className="grid lg:grid-cols-2 gap-6 mb-10">
          <Section title="Insights" kicker="Non-obvious truths about the people">
            <ul className="space-y-2">
              {E.insights.map((ins) => (
                <li key={ins.id} className="card p-3 text-sm flex gap-3 items-start">
                  <span className="text-accent mt-0.5" aria-hidden>✦</span>
                  <div className="flex-1"><p>{ins.text}</p><div className="mt-1.5 flex items-center gap-2"><ClaimTag claim={ins.claim} /><span className="text-[11px] text-ink3">{E.personas.find((x) => x.id === ins.personaId)?.name}</span></div></div>
                  <button className="btn btn-ghost !py-0.5 !px-2 text-xs" disabled={onMap.has(ins.id)} onClick={() => { toMap({ kind: "insight", id: ins.id }); mark(ins.id); }}>{onMap.has(ins.id) ? "✓" : "→ map"}</button>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Point of view" kicker="User · need · insight">
            <div className="space-y-3">
              {E.povs.map((v) => (
                <blockquote key={v.id} className="card p-4 serif text-[17px] leading-snug">
                  <span style={{ color: "var(--t-stakeholder)" }}>{v.user}</span> <span className="text-ink3">needs</span> <span>{v.need}</span> <span className="text-ink3">because</span> <span style={{ color: "var(--t-insight)" }}>{v.insight}</span>.
                </blockquote>
              ))}
            </div>
          </Section>
        </div>
      )}

      <Section title="How Might We…" kicker={`${d.hmws.length} questions · star the ones worth ideating on`}>
        <form className="card flex items-center gap-2 px-3 py-2 mb-4" onSubmit={(e) => { e.preventDefault(); addHmw(); }}>
          <span className="serif text-ink3 whitespace-nowrap">How might we</span>
          <input className="flex-1 bg-transparent outline-none text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="…make the first week feel like a win?" aria-label="New How Might We question" />
          <button className="btn !py-1" disabled={!draft.trim()}>Add</button>
        </form>
        {d.hmws.length === 0 ? <p className="text-sm text-ink3">No questions yet.</p> : (
          <ul className="space-y-2">
            {sorted.map((h) => (
              <li key={h.id} className={`card px-4 py-3 flex flex-wrap items-center gap-3 ${d.activeHmwId === h.id ? "!border-accent" : ""}`}>
                <button aria-label={h.starred ? "Unstar" : "Star"} aria-pressed={!!h.starred} className="text-lg" style={{ color: h.starred ? "var(--accent)" : "var(--ink-3)" }}
                  onClick={() => design((c) => ({ ...c, hmws: c.hmws.map((x) => (x.id === h.id ? { ...x, starred: !x.starred } : x)) }))}>★</button>
                <input className="flex-1 min-w-[240px] bg-transparent outline-none serif text-[17px] focus:bg-panel2 rounded px-1" value={h.question} aria-label="How Might We question"
                  onChange={(e) => design((c) => ({ ...c, hmws: c.hmws.map((x) => (x.id === h.id ? { ...x, question: e.target.value } : x)) }))} />
                {h.angle && <span className="chip !text-[10.5px]">{HMW_ANGLE_LABEL[h.angle]}</span>}
                {h.source === "user" && <span className="chip !text-[10.5px]">yours</span>}
                {sparkCount(h.id) > 0 && <span className="text-[11px] text-ink3">{sparkCount(h.id)} sparks</span>}
                <button className="btn btn-ghost !py-0.5 !px-2 text-xs" disabled={onMap.has(h.id)} onClick={() => { toMap({ kind: "hmw", id: h.id }); mark(h.id); }}>{onMap.has(h.id) ? "✓ on map" : "→ map"}</button>
                <button className="btn btn-ghost !py-0.5 !px-2 text-xs !text-danger" aria-label="Delete question" onClick={() => design((c) => ({ ...c, hmws: c.hmws.filter((x) => x.id !== h.id), activeHmwId: c.activeHmwId === h.id ? null : c.activeHmwId }), "design.hmw.deleted")}>✕</button>
                <button className="btn !py-1 text-xs" onClick={() => { design((c) => ({ ...c, activeHmwId: h.id })); ideate(); }}>Ideate on this →</button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

// ================================ IDEATE ================================
function IdeateTab({ d, go, define, test }: { d: DesignState; go: (v: ViewId) => void; define: () => void; test: () => void }) {
  const { p, design, spark, clusterSparks, developSparks, toMap, busy } = useNexus();
  const [own, setOwn] = useState("");
  const [wild, setWild] = useState(p?.sliders.creativity ?? 60);
  const [sort, setSort] = useState<"clusters" | "votes" | "new">("clusters");
  const [mapped, setMapped] = useState<Set<string>>(new Set());
  const hmw = d.hmws.find((h) => h.id === d.activeHmwId) ?? null;
  const pool = useMemo(() => d.sparks.filter((s) => s.hmwId === (hmw?.id ?? null)), [d.sparks, hmw]);
  const budget = dotBudget(d.sparks.length);
  const used = dotsUsed(d.sparks);
  const top = topSparks(d.sparks, 6);
  if (!p) return null;

  const vote = (id: string, delta: 1 | -1) => {
    if (delta > 0 && used >= budget) return;
    design((c) => ({ ...c, sparks: c.sparks.map((s) => (s.id === id ? { ...s, votes: Math.max(0, s.votes + delta) } : s)) }));
  };
  const addOwn = () => {
    const t = own.trim();
    if (!t) return;
    const [title, ...rest] = t.split(/\s[—–-]\s|:\s/);
    design((c) => ({ ...c, sparks: [...c.sparks, { id: nid(), hmwId: hmw?.id ?? null, title: title.slice(0, 100), description: rest.join(" — ").slice(0, 300), technique: "own", source: "user", votes: 0, createdAt: now() }] }), "design.spark.own");
    setOwn("");
  };

  const groups: { key: string; name: string; theme?: string; items: Spark[] }[] = (() => {
    if (sort === "votes") return [{ key: "all", name: "", items: [...pool].sort((a, b) => b.votes - a.votes) }];
    if (sort === "new") return [{ key: "all", name: "", items: [...pool].reverse() }];
    const byCluster = d.clusters.map((c) => ({ key: c.id, name: c.name, theme: c.theme, items: pool.filter((s) => s.clusterId === c.id) })).filter((g) => g.items.length);
    const rest = pool.filter((s) => !s.clusterId || !d.clusters.some((c) => c.id === s.clusterId));
    return [...byCluster, ...(rest.length ? [{ key: "rest", name: byCluster.length ? "Not yet clustered" : "", items: rest }] : [])];
  })();

  return (
    <>
      <div className="card p-4 mb-6 flex flex-wrap items-center gap-3">
        <span className="label">Challenge</span>
        {d.hmws.length ? (
          <select className="input !w-auto flex-1 min-w-[260px] serif !text-[16px]" value={hmw?.id ?? ""} aria-label="Active How Might We question"
            onChange={(e) => design((c) => ({ ...c, activeHmwId: e.target.value || null }))}>
            {!hmw && <option value="">— choose a How Might We question —</option>}
            {d.hmws.map((h) => <option key={h.id} value={h.id}>{h.starred ? "★ " : ""}{h.question}</option>)}
          </select>
        ) : <span className="text-sm text-ink2 flex-1">Sparks will answer your original thought. <button className="underline" onClick={define}>Write How Might We questions</button> for sharper ideas.</span>}
        <span className="text-xs text-ink3">{pool.length} sparks here · {d.sparks.length} total</span>
      </div>

      <Section title="Choose a technique" kicker="Diverge — go for quantity, defer judgement"
        right={<label className="flex items-center gap-2 text-xs text-ink3">Safe<input type="range" min={0} max={100} step={10} value={wild} onChange={(e) => setWild(Number(e.target.value))} aria-label="Wildness" className="w-28" />Wild</label>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TECHNIQUES_INFO.filter((t) => t.id !== "build" && (t.id !== "persona" || d.empathy)).map((t) => (
            <button key={t.id} disabled={!!busy} onClick={() => spark(t.id, { wildness: wild })}
              className="card p-4 text-left hover:!border-accent transition group disabled:opacity-50">
              <div className="flex items-center gap-2 mb-1"><span className="h-7 w-7 rounded-lg grid place-items-center text-sm font-semibold bg-panel2 text-accent" aria-hidden>{t.glyph}</span><span className="font-medium text-sm">{t.name}</span></div>
              <p className="text-xs text-ink2 leading-relaxed">{t.blurb}</p>
              <span className="text-[11px] text-ink3 group-hover:text-accent mt-2 inline-block">Spark {t.count} ideas →</span>
            </button>
          ))}
        </div>
      </Section>

      <form className="card flex items-center gap-2 px-3 py-2 mb-6" onSubmit={(e) => { e.preventDefault(); addOwn(); }}>
        <span className="text-accent" aria-hidden>✎</span>
        <input className="flex-1 bg-transparent outline-none text-sm" value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Add your own spark — “Title — what happens” (your ideas count most)" aria-label="Add your own spark" />
        <button className="btn !py-1" disabled={!own.trim()}>Add spark</button>
      </form>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="serif text-xl mr-auto">Spark board</h2>
        <div className="card flex p-1 gap-1 text-xs" role="radiogroup" aria-label="Arrange">
          {(["clusters", "votes", "new"] as const).map((k) => <button key={k} role="radio" aria-checked={sort === k} onClick={() => setSort(k)} className={`px-2.5 py-1 rounded-md ${sort === k ? "bg-panel2 text-ink" : "text-ink3"}`}>{k === "clusters" ? "Themes" : k === "votes" ? "Most voted" : "Newest"}</button>)}
        </div>
        <button className="btn !py-1.5 text-sm" disabled={!!busy || pool.length < 3} onClick={clusterSparks} title="Group sparks into themes and find unexplored angles">◎ Find themes</button>
        <span className="chip" title="Dot voting: spend your dots on the sparks you'd develop">
          {Array.from({ length: budget }, (_, i) => <span key={i} className="h-2 w-2 rounded-full" style={{ background: i < budget - used ? "var(--accent)" : "var(--line-2)" }} />)}
          <span className="ml-1">{budget - used} dots left</span>
        </span>
        <button className="btn btn-primary !py-1.5" disabled={!!busy || !top.length} onClick={async () => { if (await developSparks()) go("ideas"); }}>
          Develop top {top.length || ""} into concepts →
        </button>
      </div>

      {d.whitespace.length > 0 && sort === "clusters" && (
        <div className="card p-3 mb-5 text-sm flex flex-wrap items-center gap-2" style={{ borderStyle: "dashed" }}>
          <span className="label mr-1">Unexplored angles</span>
          {d.whitespace.map((w) => (
            <button key={w} className="chip hover:!border-accent hover:!text-accent" title="Turn into a How Might We question"
              onClick={() => { const id = `h_${nid()}`; design((c) => ({ ...c, hmws: [...c.hmws, { id, question: /^how might we/i.test(w) ? w : `How might we explore: ${w.replace(/[.?]$/, "")}?`, source: "user" }], activeHmwId: id, whitespace: c.whitespace.filter((x) => x !== w) }), "design.whitespace.hmw"); }}>
              ＋ {w}
            </button>
          ))}
        </div>
      )}

      {pool.length === 0 ? (
        <Empty title="Nothing sparked yet" body="Pick a technique above, or add your own idea. Aim for 20+ sparks across two or three techniques before you vote." />
      ) : groups.map((g) => (
        <div key={g.key} className="mb-7">
          {g.name && <div className="mb-3"><h3 className="font-semibold">{g.name} <span className="text-ink3 font-normal text-sm">· {g.items.length}</span></h3>{g.theme && <p className="text-xs text-ink3">{g.theme}</p>}</div>}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {g.items.map((s) => {
              const t = s.technique === "own" ? null : techniqueById(s.technique);
              const parent = s.parentId ? d.sparks.find((x) => x.id === s.parentId) : null;
              return (
                <article key={s.id} className="card p-4 flex flex-col fade-in" style={{ borderTop: s.votes ? "3px solid var(--accent)" : undefined, background: s.source === "user" ? "color-mix(in oklab, var(--t-idea) 6%, var(--panel))" : undefined }}>
                  <div className="flex items-center gap-2 text-[10.5px] text-ink3 mb-1.5">
                    <span className="uppercase tracking-wider font-semibold" style={{ color: s.source === "user" ? "var(--t-idea)" : "var(--ink-3)" }}>{t ? t.name : "Your idea"}</span>
                    {s.lens && <span className="truncate">· {s.lens}</span>}
                    {s.source !== "user" && <span className="ml-auto">{s.source === "dev" ? "dev" : "AI"}</span>}
                  </div>
                  <h4 className="font-medium leading-snug mb-1">{s.title}</h4>
                  {s.description && <p className="text-sm text-ink2 leading-relaxed">{s.description}</p>}
                  {parent && <p className="text-[11px] text-ink3 mt-1">builds on “{parent.title}”</p>}
                  <div className="mt-auto pt-3 flex items-center gap-1">
                    <button className="btn !py-0.5 !px-2 text-xs" aria-label={`Vote for ${s.title}`} disabled={used >= budget} onClick={() => vote(s.id, 1)}>● Vote</button>
                    {s.votes > 0 && <button className="btn btn-ghost !py-0.5 !px-1.5 text-xs" aria-label="Remove a vote" onClick={() => vote(s.id, -1)}>−</button>}
                    <span className="flex gap-0.5 ml-1" aria-label={`${s.votes} votes`}>{Array.from({ length: s.votes }, (_, i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-accent" />)}</span>
                    <span className="ml-auto flex gap-1">
                      <button className="btn btn-ghost !py-0.5 !px-2 text-xs" disabled={!!busy} onClick={() => spark("build", { seedId: s.id, wildness: wild })} title="Build on this idea">Yes, and…</button>
                      <button className="btn btn-ghost !py-0.5 !px-2 text-xs" disabled={mapped.has(s.id)} onClick={() => { toMap({ kind: "spark", id: s.id }); setMapped((m) => new Set(m).add(s.id)); }} title="Add to the canvas">{mapped.has(s.id) ? "✓" : "→ map"}</button>
                      <button className="btn btn-ghost !py-0.5 !px-1.5 text-xs !text-ink3" aria-label="Delete spark" onClick={() => design((c) => ({ ...c, sparks: c.sparks.filter((x) => x.id !== s.id) }), "design.spark.deleted")}>✕</button>
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ))}

      {p.ideas && <div className="flex justify-end gap-2 mt-4"><button className="btn" onClick={() => go("ideas")}>Open concepts in Idea Lab</button><button className="btn btn-primary" onClick={test}>Prototype & test concepts →</button></div>}
    </>
  );
}

// ================================ PROTOTYPE & TEST ================================
function TestTab({ d, go, ideate }: { d: DesignState; go: (v: ViewId) => void; ideate: () => void }) {
  const { p, planTests, busy } = useNexus();
  const ideas = p?.ideas?.ideas ?? [];
  const [ideaId, setIdeaId] = useState<string | null>(p?.selectedIdeaId ?? d.tests[0]?.ideaId ?? ideas[0]?.id ?? null);
  if (!p) return null;
  if (!ideas.length) return <Empty title="No concepts to test yet" body="Vote on sparks and develop them into concepts (or generate options in the Idea Lab). Then map their riskiest assumptions and design cheap tests." action={<button className="btn btn-primary" onClick={ideate}>← Back to Ideate</button>} />;
  const idea = ideas.find((i) => i.id === ideaId) ?? ideas[0];
  const rec = d.tests.find((t) => t.ideaId === idea.id);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="label mr-1">Concept</span>
        {ideas.map((i) => {
          const r = d.tests.find((t) => t.ideaId === i.id);
          const pr = r ? testProgress(r) : null;
          return (
            <button key={i.id} onClick={() => setIdeaId(i.id)} className={`chip ${i.id === idea.id ? "!border-accent !text-accent" : ""}`}>
              {i.title.slice(0, 48)}{pr && <span className="text-ink3">· {pr.done}/{pr.total}</span>}{pr && pr.invalidated > 0 && <span className="text-danger">· {pr.invalidated}✗</span>}
            </button>
          );
        })}
        <button className="btn btn-primary ml-auto" disabled={!!busy} onClick={() => planTests(idea.id)}>{rec ? "Re-plan tests" : "Map assumptions & plan tests"}</button>
      </div>

      {!rec ? (
        <div className="card p-6">
          <h3 className="serif text-xl mb-1">{idea.title}</h3>
          <p className="text-sm text-ink2 mb-4">{idea.summary}</p>
          <p className="text-sm text-ink3">NEXUS will list what must be true for this concept to work (desirability, feasibility, viability), plot them on an assumption map, and design the cheapest prototype that tests the riskiest ones first.</p>
        </div>
      ) : <TestBoard rec={rec} go={go} />}
    </>
  );
}

function TestBoard({ rec, go }: { rec: TestRecord; go: (v: ViewId) => void }) {
  const { recordTest } = useNexus();
  const ranked = rankAssumptions(rec);
  const pr = testProgress(rec);
  return (
    <>
      <div className="grid lg:grid-cols-[380px_1fr] gap-6 mb-10">
        <AssumptionMap rec={rec} />
        <div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat k="Assumptions tested" v={`${pr.done}/${pr.total}`} />
            <Stat k="Riskiest still open" v={String(pr.riskiestOpen)} tone={pr.riskiestOpen ? "warn" : "ok"} />
            <Stat k="Invalidated" v={String(pr.invalidated)} tone={pr.invalidated ? "danger" : undefined} />
          </div>
          {pr.invalidated > 0 && (
            <div className="card p-3 mb-4 !border-danger text-sm">
              An assumption failed. It is recorded on the canvas with your evidence, and everything that depends on this concept is flagged for re-evaluation.
              <button className="btn !py-0.5 text-xs ml-2" onClick={() => go("canvas")}>See on canvas</button>
            </div>
          )}
          <div className="label mb-2">Storyboard · paper prototype</div>
          <ol className="grid grid-cols-2 xl:grid-cols-3 gap-2">
            {rec.storyboard.map((f, i) => (
              <li key={i} className="card p-3 text-sm">
                <div className="rounded-lg border border-dashed border-line2 h-16 mb-2 grid place-items-center text-ink3 text-xs">frame {i + 1}</div>
                <div className="font-medium">{f.frame}</div><p className="text-ink2 text-xs mt-0.5">{f.caption}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <Section title="Test cards" kicker="Riskiest first — decide the success threshold before you run the test">
        <div className="space-y-3">
          {ranked.map((a) => {
            const tests = rec.tests.filter((t) => t.assumptionId === a.id);
            const r = rec.results[a.id] ?? { status: "untested" as TestStatus, learning: "" };
            return <TestCard key={a.id + rec.createdAt} a={a} tests={tests} r={r} onRecord={(status, learning) => recordTest(rec.ideaId, a.id, status, learning)} />;
          })}
        </div>
      </Section>
    </>
  );
}

function TestCard({ a, tests, r, onRecord }: {
  a: TestRecord["assumptions"][number]; tests: TestRecord["tests"]; r: { status: TestStatus; learning: string };
  onRecord: (s: TestStatus, l: string) => void;
}) {
  const [learning, setLearning] = useState(r.learning);
  const q = quadrant(a);
  const tone = r.status === "validated" ? "var(--ok)" : r.status === "invalidated" ? "var(--danger)" : r.status === "running" ? "var(--accent)" : "var(--line-2)";
  return (
    <article className="card p-4" style={{ borderLeft: `3px solid ${tone}` }}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[260px]">
          <div className="flex flex-wrap items-center gap-2 mb-1 text-[11px]">
            <span className="font-semibold uppercase tracking-wider" style={{ color: LENS_COLOR[a.lens] }}>{a.lens}</span>
            <span className="text-ink3">{a.id} · risk {riskScore(a)}/25 · importance {a.importance}/5 · evidence {a.evidence}/5</span>
            {q === "test_first" && <span className="chip !py-0 !text-[10px] !border-warn !text-warn">test first</span>}
          </div>
          <p className="text-[15px]"><span className="text-ink3">We believe that </span>{a.statement.replace(/^we believe( that)?\s*/i, "")}</p>
        </div>
        <label className="text-xs text-ink3 flex items-center gap-2">Result
          <select className="input !w-auto !py-1 text-sm" value={r.status} onChange={(e) => onRecord(e.target.value as TestStatus, learning)}>
            <option value="untested">Not tested</option><option value="running">Running</option><option value="validated">Validated</option><option value="invalidated">Invalidated</option><option value="inconclusive">Inconclusive</option>
          </select>
        </label>
      </div>
      {tests.map((t, i) => (
        <div key={i} className="mt-3 grid md:grid-cols-3 gap-3 text-sm rounded-xl bg-bg2 border border-line p-3">
          <div><div className="label mb-1">To verify, we will</div><span className="chip !text-[10.5px] mb-1">{PROTOTYPE_LABEL[t.prototype]}</span><p className="text-ink2">{t.description}</p></div>
          <div><div className="label mb-1">And measure</div><p className="text-ink2">{t.metric}</p></div>
          <div><div className="label mb-1">We are right if</div><p>{t.successCriteria}</p><p className="text-[11px] text-ink3 mt-1">≈ {t.effortDays} day{t.effortDays === 1 ? "" : "s"} · {t.cost} cost</p></div>
        </div>
      ))}
      {r.status !== "untested" && (
        <div className="mt-3">
          <label className="label block mb-1" htmlFor={`learn-${a.id}`}>We observed… therefore…</label>
          <input id={`learn-${a.id}`} className="input text-sm" value={learning} onChange={(e) => setLearning(e.target.value)}
            onBlur={() => { if (learning !== r.learning) onRecord(r.status, learning); }}
            placeholder="e.g. 4 of 5 people described the problem unprompted — we'll keep the core flow and cut the onboarding call" />
        </div>
      )}
    </article>
  );
}

function AssumptionMap({ rec }: { rec: TestRecord }) {
  return (
    <figure className="card p-4" aria-label="Assumption map: importance versus evidence">
      <div className="label mb-2">Assumption map</div>
      <div className="relative aspect-square rounded-xl overflow-hidden border border-line">
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
          <div className="p-2 text-[11px] font-semibold text-warn" style={{ background: "color-mix(in oklab, var(--warn) 10%, transparent)" }}>Test first</div>
          <div className="p-2 text-[11px] text-ink3 text-right border-l border-line">Safe bets</div>
          <div className="p-2 text-[11px] text-ink3 flex items-end border-t border-line">Monitor</div>
          <div className="p-2 text-[11px] text-ink3 flex items-end justify-end border-l border-t border-line">Deprioritise</div>
        </div>
        {rec.assumptions.map((a, i) => {
          const st = rec.results[a.id]?.status;
          const sameSpot = rec.assumptions.slice(0, i).filter((b) => b.importance === a.importance && b.evidence === a.evidence).length;
          return (
            <div key={a.id} className="absolute -translate-x-1/2 translate-y-1/2 h-7 w-7 rounded-full grid place-items-center text-[10px] font-semibold border-2"
              title={`${a.id}: ${a.statement}`}
              style={{
                left: `calc(${12 + ((a.evidence - 1) / 4) * 76}% + ${sameSpot * 22}px)`, bottom: `calc(${12 + ((a.importance - 1) / 4) * 76}% - ${sameSpot * 8}px)`,
                background: LENS_COLOR[a.lens], color: "#15161b",
                borderColor: st === "validated" ? "var(--ok)" : st === "invalidated" ? "var(--danger)" : "var(--panel)",
                textDecoration: st === "invalidated" ? "line-through" : undefined,
              }}>{a.id}</div>
          );
        })}
      </div>
      <figcaption className="flex justify-between text-[10.5px] text-ink3 mt-1.5"><span>← weak evidence</span><span>↑ importance</span><span>strong evidence →</span></figcaption>
      <div className="flex gap-3 text-[11px] mt-2">{Object.entries(LENS_COLOR).map(([k, c]) => <span key={k} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{k}</span>)}</div>
    </figure>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: "ok" | "warn" | "danger" }) {
  return <div className="card p-3"><div className="label">{k}</div><div className="serif text-2xl mt-1" style={{ color: tone ? `var(--${tone})` : undefined }}>{v}</div></div>;
}
