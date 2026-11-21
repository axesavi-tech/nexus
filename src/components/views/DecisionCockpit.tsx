"use client";
import { useMemo, useState } from "react";
import { useNexus } from "@/lib/store";
import { GATES, type ApprovalRecord, type GateStatus } from "@/lib/schemas";
import { GATE_LABEL, STATUS_LABEL, STATUS_TONE, THRESHOLDS, fingerprint, impactAnalysis, recommendAll, type Recommendation } from "@/lib/decision";
import { emptyOS } from "@/lib/evidence";
import { fmtMoney } from "@/lib/finance";
import { Section } from "../ui";
import { ConfidenceMeter } from "./EvidenceLab";
import type { ViewId } from "../Workspace";

const GATE_TONE: Record<GateStatus, string> = { unassessed: "var(--ink-3)", pass: "var(--ok)", conditional: "var(--warn)", fail: "var(--danger)" };

export function StatusBadge({ s }: { s: Recommendation["status"] }) {
  return <span className="chip !text-[11px] font-semibold uppercase tracking-wider" style={{ borderColor: STATUS_TONE[s], color: STATUS_TONE[s] }}>{STATUS_LABEL[s]}</span>;
}

export function DecisionCockpit({ go }: { go: (v: ViewId) => void }) {
  const { p, assessGates, setGate, confirmGates, decisionReport, approve, busy } = useNexus();
  const recs = useMemo(() => (p ? recommendAll(p) : []), [p]);
  const impacts = useMemo(() => (p ? impactAnalysis(p) : []), [p]);
  const [focus, setFocus] = useState<string | null>(null);
  const [by, setBy] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  if (!p || !p.ideas) return null;
  const O = p.os ?? emptyOS();
  const cur = recs.find((r) => r.ideaId === (focus ?? recs[0]?.ideaId)) ?? recs[0];
  const report = O.reports.find((r) => r.ideaId === cur?.ideaId);
  const reportStale = report && cur && report.fingerprint !== fingerprint(p, cur.ideaId);
  const history = O.approvals.filter((a) => a.ideaId === cur?.ideaId).reverse();
  const evById = new Map(O.evidence.map((e) => [e.id, e]));

  const act = (action: ApprovalRecord["action"]) => {
    if (!cur) return;
    const err = approve(cur.ideaId, action, by, note);
    setMsg(err ?? `Recorded: ${action.replace("_", " ")} by ${by}.`);
    if (!err) { setNote(""); if (action === "approve") setTimeout(() => go("solution"), 600); }
  };

  return (
    <>
      {impacts.length > 0 && (
        <div className="card p-4 mb-6 !border-warn" role="alert">
          <div className="label !text-warn mb-1">Impact analysis — inputs changed after decisions were made</div>
          <ul className="text-sm space-y-1">{impacts.map((i, k) => <li key={k}>⚠ {i.message}</li>)}</ul>
        </div>
      )}

      <Section title="Recommendations" kicker="Deterministic rules on attractiveness, evidence, gates and economics — you approve">
        <div className="grid lg:grid-cols-[1fr_340px] gap-6">
          <div className="space-y-2">
            {recs.map((r) => (
              <button key={r.ideaId} onClick={() => setFocus(r.ideaId)} className={`card p-4 w-full text-left transition ${cur?.ideaId === r.ideaId ? "!border-accent" : "hover:!border-line2"}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="serif text-lg flex-1 min-w-[180px]">{r.title}</span>
                  <StatusBadge s={r.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 text-xs text-ink2">
                  <span>Attractiveness <b className="tabular-nums text-ink">{r.attractiveness ?? "—"}</b>{r.provisional && r.attractiveness !== null ? " (provisional)" : ""}</span>
                  <ConfidenceMeter c={r.evidence} label="Evidence" />
                  <span>Gates <b style={{ color: r.gates.failed.length ? "var(--danger)" : r.gates.unassessed.length + r.gates.unconfirmed.length ? "var(--warn)" : "var(--ok)" }}>{r.gates.failed.length ? `${r.gates.failed.length} failed` : r.gates.unassessed.length + r.gates.unconfirmed.length ? `${GATES.length - r.gates.unassessed.length - r.gates.unconfirmed.length}/${GATES.length} cleared` : "all cleared"}</b></span>
                  <span>NPV <b className="text-ink">{r.npv === null ? "—" : fmtMoney(r.npv, O.businessCases.find((b) => b.ideaId === r.ideaId)?.inputs.currency)}</b></span>
                </div>
                {r.blockers.map((b) => <p key={b} className="text-xs text-danger mt-1">⛔ {b}</p>)}
                <p className="text-xs text-ink3 mt-1">{r.reasons[0]}</p>
              </button>
            ))}
          </div>
          <Quadrant recs={recs} onPick={setFocus} current={cur?.ideaId} />
        </div>
      </Section>

      <Section title="Risk & policy gates" kicker="Mandatory. A failed gate blocks approval whatever the score. AI screens are provisional until a person confirms them."
        right={<button className="btn" disabled={!!busy} onClick={assessGates}>Screen with risk agent</button>}>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-ink3"><th className="p-3 font-normal">Concept</th>{GATES.map((g) => <th key={g} className="p-3 font-normal">{GATE_LABEL[g]}</th>)}<th /></tr></thead>
            <tbody>
              {p.ideas.ideas.map((i) => {
                const g = O.gates[i.id] ?? {};
                const pendingAi = GATES.some((k) => g[k] && !g[k]!.confirmed && g[k]!.status !== "unassessed");
                return (
                  <tr key={i.id} className="border-b border-line/60 align-top">
                    <td className="p-3 max-w-[200px]">{i.title}</td>
                    {GATES.map((k) => {
                      const a = g[k];
                      const st = a?.status ?? "unassessed";
                      return (
                        <td key={k} className="p-2">
                          <select className="input !py-1 !px-2 text-xs !w-[118px]" value={st} title={a?.note || "Not assessed"} aria-label={`${GATE_LABEL[k]} gate for ${i.title}`}
                            style={{ color: GATE_TONE[st], borderStyle: a && !a.confirmed && st !== "unassessed" ? "dashed" : "solid" }}
                            onChange={(e) => setGate(i.id, k, e.target.value as GateStatus, a?.note ?? "")}>
                            <option value="unassessed">unassessed</option><option value="pass">pass</option><option value="conditional">conditional</option><option value="fail">fail</option>
                          </select>
                          {a && a.status !== "unassessed" && <div className="text-[10.5px] text-ink3 mt-1 max-w-[118px] line-clamp-3" title={a.note}>{a.by === "user" ? "You" : a.by === "dev" ? "Dev" : "AI"}{!a.confirmed && " · unconfirmed"}{a.note ? ` — ${a.note}` : ""}</div>}
                        </td>
                      );
                    })}
                    <td className="p-2">{pendingAi && <button className="btn !py-1 text-xs whitespace-nowrap" onClick={() => confirmGates(i.id)} title="You take responsibility for these screens">Confirm AI screens</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {cur && (
        <Section title={`Decision report — ${cur.title}`} kicker="Explainable recommendation: every answer cites the evidence register or says it is an assumption"
          right={<button className="btn" disabled={!!busy} onClick={() => decisionReport(cur.ideaId)}>{report ? "Regenerate report" : "Generate report"}</button>}>
          <div className="card p-4 mb-3 grid md:grid-cols-[auto_1fr] gap-4 items-start">
            <StatusBadge s={cur.status} />
            <div className="text-sm">
              <ul className="space-y-1 text-ink2">{cur.reasons.map((r) => <li key={r}>• {r}</li>)}{cur.blockers.map((b) => <li key={b} className="text-danger">⛔ {b}</li>)}</ul>
              <p className="mt-2"><span className="label">Next best action </span>{cur.nextAction}</p>
              <p className="text-[11px] text-ink3 mt-2">Rules: attractive ≥ {THRESHOLDS.attractive}, marginal ≥ {THRESHOLDS.marginal}; evidence “validated” ≥ {THRESHOLDS.evidenceValidated}, “some” ≥ {THRESHOLDS.evidenceSome}; all six gates human-confirmed and none failed; positive base-case NPV.</p>
            </div>
          </div>
          {report ? (
            <div className="space-y-2">
              {reportStale && <p className="text-xs text-warn">⚠ Inputs changed since this report was generated — regenerate before relying on it.</p>}
              {report.unsupportedCitations.length > 0 && <p className="text-xs text-warn">⚠ The AI cited {report.unsupportedCitations.length} source id(s) not in your register ({report.unsupportedCitations.join(", ")}); they were removed.</p>}
              {report.mode === "dev" && <p className="text-xs text-warn">Dev templates — not an AI synthesis.</p>}
              <div className="grid md:grid-cols-2 gap-2">
                {report.answers.map((a) => (
                  <div key={a.q} className="card p-4">
                    <div className="font-medium text-sm mb-1">{a.q}</div>
                    <p className="text-sm text-ink2 leading-relaxed">{a.a}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {a.evidenceIds.length ? a.evidenceIds.map((id) => <span key={id} className="chip !text-[10.5px] !py-0 font-mono" title={evById.get(id)?.title}>{id}</span>) : <span className="text-[11px] text-warn">no registered evidence — assumption or inference</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-sm text-ink3">No report yet. It answers: why this idea, why now, why over the alternatives, which assumptions drive it, what evidence supports it, what could invalidate it, what would change the decision, and the next best action.</p>}
        </Section>
      )}

      {cur && (
        <Section title="Investment decision" kicker="Human accountability — the engine recommends, a named person decides">
          <div className="card p-5 grid md:grid-cols-[1fr_1fr] gap-4">
            <div className="space-y-3">
              <label className="text-sm block">Accountable decision-maker<input className="input mt-1" value={by} onChange={(e) => setBy(e.target.value)} placeholder="Name and role" /></label>
              <label className="text-sm block">Rationale / conditions<textarea className="input mt-1" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={cur.canApprove ? "Conditions attached to the approval (budget cap, stage gates…)" : "Approving against the recommendation? Justify it here — it is recorded as an override."} /></label>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary" disabled={!by.trim()} onClick={() => act("approve")}>Approve for delivery</button>
                <button className="btn" disabled={!by.trim()} onClick={() => act("request_validation")}>Request validation</button>
                <button className="btn" disabled={!by.trim()} onClick={() => act("rework")}>Rework</button>
                <button className="btn" disabled={!by.trim()} onClick={() => act("hold")}>Hold</button>
                <button className="btn !text-danger" disabled={!by.trim()} onClick={() => act("reject")}>Reject</button>
              </div>
              {msg && <p className="text-sm" role="status">{msg}</p>}
            </div>
            <div>
              <div className="label mb-2">Decision history — {cur.title}</div>
              {history.length === 0 ? <p className="text-sm text-ink3">No decisions recorded yet.</p> : (
                <ol className="space-y-2 text-sm">
                  {history.map((h) => (
                    <li key={h.id} className="border-l-2 pl-3" style={{ borderColor: h.action === "approve" ? "var(--ok)" : h.action === "reject" ? "var(--danger)" : "var(--line-2)" }}>
                      <div><b className="capitalize">{h.action.replace("_", " ")}</b> by {h.by} · <span className="text-ink3">{new Date(h.at).toLocaleString()}</span></div>
                      <div className="text-xs text-ink3">Engine recommended: {STATUS_LABEL[h.recommended]}{h.fingerprint !== fingerprint(p, h.ideaId) ? " · inputs have changed since" : ""}</div>
                      {h.note && <div className="text-xs text-ink2">{h.note}</div>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </Section>
      )}
    </>
  );
}

function Quadrant({ recs, onPick, current }: { recs: Recommendation[]; onPick: (id: string) => void; current?: string }) {
  const W = 340, H = 300, pad = 36;
  const x = (e: number) => pad + (e / 100) * (W - pad * 2);
  const y = (a: number) => H - pad - (a / 100) * (H - pad * 2);
  return (
    <figure className="card p-3">
      <figcaption className="label mb-1">Attractiveness × evidence confidence</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Attractiveness versus evidence confidence">
        <rect x={x(THRESHOLDS.evidenceValidated)} y={pad} width={x(100) - x(THRESHOLDS.evidenceValidated)} height={y(THRESHOLDS.attractive) - pad} fill="var(--ok)" opacity={0.08} />
        <rect x={pad} y={pad} width={x(THRESHOLDS.evidenceValidated) - pad} height={y(THRESHOLDS.attractive) - pad} fill="var(--warn)" opacity={0.07} />
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--line-2)" /><line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="var(--line-2)" />
        <text x={x(THRESHOLDS.evidenceValidated) + 4} y={pad + 12} fill="var(--ok)" fontSize="9">attractive & proven</text>
        <text x={pad + 4} y={pad + 12} fill="var(--warn)" fontSize="9">attractive bet — validate</text>
        <text x={W / 2} y={H - 8} fill="var(--ink-3)" fontSize="10" textAnchor="middle">Evidence confidence →</text>
        <text x={11} y={H / 2} fill="var(--ink-3)" fontSize="10" textAnchor="middle" transform={`rotate(-90 11 ${H / 2})`}>Attractiveness →</text>
        {recs.filter((r) => r.attractiveness !== null).map((r, i) => (
          <g key={r.ideaId} className="cursor-pointer" onClick={() => onPick(r.ideaId)}>
            <circle cx={x(r.evidence.score) + (i % 3) * 4} cy={y(r.attractiveness!)} r={current === r.ideaId ? 11 : 8} fill={STATUS_TONE[r.status]} opacity={0.85} stroke={current === r.ideaId ? "var(--ink)" : "none"} strokeWidth={2} />
            <text x={x(r.evidence.score) + (i % 3) * 4} y={y(r.attractiveness!) + 3} fontSize="9" textAnchor="middle" fill="#15161b" fontWeight={700}>{r.ideaId}</text>
          </g>
        ))}
      </svg>
      <p className="text-[11px] text-ink3">Colour = recommendation. A high dot on the left is a promising idea you have not proven yet.</p>
    </figure>
  );
}
