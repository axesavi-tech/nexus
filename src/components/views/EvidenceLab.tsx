"use client";
import { useMemo, useState } from "react";
import { useNexus } from "@/lib/store";
import { EVIDENCE_TYPES, type EvidenceItem, type EvidenceLinkRef, type EvidenceTargetKind, type EvidenceType } from "@/lib/schemas";
import { TYPE_LABEL, TYPE_WEIGHT, conceptConfidence, contested, duplicateOf, emptyOS, evidenceFor, freshness, itemWeight, problemConfidence, confidenceFrom, type Confidence } from "@/lib/evidence";
import { nid, now } from "@/lib/graph";
import { Empty, Section } from "../ui";
import type { ViewId } from "../Workspace";

export function ConfidenceMeter({ c, label }: { c: Confidence; label?: string }) {
  const tone = c.label === "strong" ? "var(--ok)" : c.label === "moderate" ? "var(--accent)" : c.label === "weak" ? "var(--warn)" : "var(--ink-3)";
  return (
    <span className="inline-flex items-center gap-2 text-xs" title={`${c.supporting} supporting · ${c.contradicting} contradicting independent source(s)`}>
      {label && <span className="text-ink3">{label}</span>}
      <span className="w-16 h-1.5 rounded-full bg-line2 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${c.score}%`, background: tone }} /></span>
      <span className="tabular-nums" style={{ color: tone }}>{c.score}</span>
      <span className="text-ink3">{c.label}{c.aiOnly ? " · AI-only" : ""}</span>
    </span>
  );
}

type Target = { kind: EvidenceTargetKind; id: string; label: string; group: string };

export function EvidenceLab({ go }: { go: (v: ViewId) => void }) {
  const { p, os, researchGaps, busy } = useNexus();
  const [draft, setDraft] = useState<Partial<EvidenceItem> & { link?: string; stance?: "supports" | "contradicts" }>({ type: "customer_interview", reliability: "medium", verification: "unverified", stance: "supports" });
  const [filter, setFilter] = useState<string>("all");
  const [err, setErr] = useState<string | null>(null);
  const O = p?.os ?? emptyOS();

  const targets: Target[] = useMemo(() => {
    if (!p) return [];
    return [
      { kind: "problem", id: "root", label: p.interpretation?.problemOrOpportunity?.slice(0, 90) ?? "The core problem", group: "Problem" },
      ...(p.ideas?.ideas ?? []).map((i) => ({ kind: "concept" as const, id: i.id, label: i.title, group: "Concepts" })),
      ...p.nodes.filter((n) => n.type === "assumption").map((n) => ({ kind: "assumption" as const, id: n.id, label: n.title, group: "Assumptions" })),
      ...p.nodes.filter((n) => ["problem", "insight", "opportunity", "stakeholder", "hypothesis"].includes(n.type)).map((n) => ({ kind: "node" as const, id: n.id, label: `${n.type}: ${n.title}`, group: "Map nodes" })),
    ];
  }, [p]);
  const tLabel = (l: Pick<EvidenceLinkRef, "targetKind" | "targetId">) => targets.find((t) => t.kind === l.targetKind && t.id === l.targetId)?.label ?? "(removed target)";
  if (!p) return null;

  const pc = problemConfidence(p);
  const disputes = contested(O);
  const add = () => {
    setErr(null);
    if (!draft.title?.trim() || !draft.origin?.trim()) return setErr("Give the evidence a title and say where it came from.");
    if (draft.url && !/^https?:\/\//i.test(draft.url)) return setErr("URLs must start with http:// or https://");
    const link = draft.link ? (() => { const [kind, ...rest] = draft.link.split(":"); return { targetKind: kind as EvidenceTargetKind, targetId: rest.join(":"), stance: draft.stance ?? "supports" }; })() : null;
    const item: EvidenceItem = {
      id: `E${(O.evidence.length + 1).toString().padStart(2, "0")}-${nid().slice(0, 4)}`, title: draft.title.trim(), origin: draft.origin.trim(), url: draft.url?.trim() || undefined,
      excerpt: draft.excerpt?.trim() ?? "", type: draft.type as EvidenceType, publishedAt: draft.publishedAt || null, retrievedAt: now().slice(0, 10),
      reliability: draft.reliability ?? "medium", verification: draft.verification ?? "unverified", notes: draft.notes, links: link ? [link] : [], addedBy: "user", createdAt: now(),
    };
    const dup = duplicateOf(item, O.evidence);
    if (dup && !confirm(`This looks like a duplicate of “${dup.title}” (${dup.id}). Add anyway?`)) return;
    os((o) => ({ ...o, evidence: [...o.evidence, item] }), "evidence.added");
    setDraft({ type: draft.type, reliability: "medium", verification: "unverified", stance: "supports", link: draft.link });
  };
  const shown = O.evidence.filter((e) => filter === "all" || e.links.some((l) => `${l.targetKind}:${l.targetId}` === filter) || (filter === "unlinked" && !e.links.length));

  return (
    <div className="h-full overflow-auto scroll-thin">
      <div className="max-w-6xl mx-auto px-8 py-10 fade-in">
        <div className="label mb-1">Evidence Lab</div>
        <h1 className="serif text-3xl mb-1">What credible evidence supports — or challenges — this?</h1>
        <p className="text-ink2 mb-8 max-w-3xl">Every claim the decision rests on should trace to a source. Confidence here is computed from the <b>type, reliability, verification and independence</b> of the evidence you log — never from how confident the AI sounds. AI hypotheses count for nothing until something real backs them.</p>

        <div className="grid md:grid-cols-3 gap-3 mb-8">
          <div className="card p-4"><div className="label mb-2">Problem confidence</div><ConfidenceMeter c={pc} /><p className="text-xs text-ink3 mt-2">Is the problem real and does it matter? Link interviews, data and observations to “Problem”.</p></div>
          <div className="card p-4"><div className="label mb-2">Evidence register</div><div className="serif text-2xl">{O.evidence.length} <span className="text-sm text-ink3">items · {new Set(O.evidence.map((e) => e.origin.toLowerCase())).size} independent origins</span></div><p className="text-xs text-ink3 mt-1">{O.evidence.filter((e) => e.verification === "verified").length} verified · {O.evidence.filter((e) => freshness(e) === "stale").length} stale</p></div>
          <div className="card p-4"><div className="label mb-2">Contested claims</div><div className="serif text-2xl" style={{ color: disputes.length ? "var(--warn)" : undefined }}>{disputes.length}</div><p className="text-xs text-ink3 mt-1">{disputes.length ? disputes.map((d) => tLabel(d)).join(" · ").slice(0, 120) : "No target has both supporting and contradicting evidence."}</p></div>
        </div>

        {p.ideas && (
          <Section title="Concept evidence confidence" kicker="Separate from attractiveness — a great idea with weak evidence is still a bet">
            <div className="grid md:grid-cols-2 gap-2">
              {p.ideas.ideas.map((i) => (
                <div key={i.id} className="card p-3 flex items-center gap-3"><span className="flex-1 text-sm truncate">{i.title}</span><ConfidenceMeter c={conceptConfidence(p, i.id)} /></div>
              ))}
            </div>
          </Section>
        )}

        <div id="nx-log-evidence" /><Section title="Log evidence" kicker="Real sources only — interviews, data, documents, experiments, reports">
          <div className="card p-5 grid md:grid-cols-6 gap-3">
            <label className="text-sm md:col-span-3">Title<input className="input mt-1" value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Buyers can't judge fabric quality from photos" /></label>
            <label className="text-sm md:col-span-3">Origin — who / where<input className="input mt-1" value={draft.origin ?? ""} onChange={(e) => setDraft({ ...draft, origin: e.target.value })} placeholder="e.g. Interview #4 — repeat customer, Pune" /></label>
            <label className="text-sm md:col-span-6">Excerpt or data point<textarea className="input mt-1" rows={2} value={draft.excerpt ?? ""} onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })} placeholder="The exact quote, number or observation" /></label>
            <label className="text-sm md:col-span-2">Type
              <select className="input mt-1" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as EvidenceType })}>
                {EVIDENCE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]} (weight {TYPE_WEIGHT[t]})</option>)}
              </select>
            </label>
            <label className="text-sm">Reliability<select className="input mt-1" value={draft.reliability} onChange={(e) => setDraft({ ...draft, reliability: e.target.value as EvidenceItem["reliability"] })}><option>high</option><option>medium</option><option>low</option></select></label>
            <label className="text-sm">Verification<select className="input mt-1" value={draft.verification} onChange={(e) => setDraft({ ...draft, verification: e.target.value as EvidenceItem["verification"] })}><option>unverified</option><option>verified</option><option>disputed</option></select></label>
            <label className="text-sm md:col-span-2">Published (if known)<input type="date" className="input mt-1" value={draft.publishedAt ?? ""} onChange={(e) => setDraft({ ...draft, publishedAt: e.target.value })} /></label>
            <label className="text-sm md:col-span-3">Link to claim
              <select className="input mt-1" value={draft.link ?? ""} onChange={(e) => setDraft({ ...draft, link: e.target.value })}>
                <option value="">— not linked yet —</option>
                {["Problem", "Concepts", "Assumptions", "Map nodes"].map((g) => (
                  <optgroup key={g} label={g}>{targets.filter((t) => t.group === g).map((t) => <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>{t.label.slice(0, 90)}</option>)}</optgroup>
                ))}
              </select>
            </label>
            <label className="text-sm">Stance<select className="input mt-1" value={draft.stance} onChange={(e) => setDraft({ ...draft, stance: e.target.value as "supports" | "contradicts" })}><option value="supports">supports</option><option value="contradicts">contradicts</option></select></label>
            <label className="text-sm md:col-span-2">URL (optional)<input className="input mt-1" value={draft.url ?? ""} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://…" /></label>
            <div className="md:col-span-6 flex items-center gap-3">
              <button className="btn btn-primary" onClick={add}>Add to register</button>
              {err && <span className="text-sm text-danger" role="alert">{err}</span>}
              <span className="text-xs text-ink3 ml-auto">Retrieval date is recorded automatically. Five quotes from one interview count as one source.</span>
            </div>
          </div>
        </Section>

        <Section title="Evidence register" kicker={`${shown.length} of ${O.evidence.length}`}
          right={<select className="input !w-64 !py-1.5 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter evidence">
            <option value="all">All evidence</option><option value="unlinked">Not linked to any claim</option>
            {targets.map((t) => <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>{t.group}: {t.label.slice(0, 60)}</option>)}
          </select>}>
          {shown.length === 0 ? <Empty title="No evidence logged" body="Start with what you already know for certain — order data, customer messages, returns reasons, interview notes. Then use research tasks to fill the gaps." /> : (
            <div className="space-y-2">
              {shown.map((e) => {
                const fr = freshness(e);
                return (
                  <article key={e.id} className="card p-4">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] mb-1">
                      <span className="font-mono text-ink3">{e.id}</span>
                      <span className="chip !py-0 !text-[10.5px]">{TYPE_LABEL[e.type]}</span>
                      <span className="text-ink3">weight {itemWeight(e).toFixed(2)}</span>
                      <select className="bg-transparent text-[11px] text-ink2" value={e.verification} aria-label="Verification" onChange={(x) => os((o) => ({ ...o, evidence: o.evidence.map((y) => (y.id === e.id ? { ...y, verification: x.target.value as EvidenceItem["verification"] } : y)) }), "evidence.verification")}>
                        <option>unverified</option><option>verified</option><option>disputed</option>
                      </select>
                      <select className="bg-transparent text-[11px] text-ink2" value={e.reliability} aria-label="Reliability" onChange={(x) => os((o) => ({ ...o, evidence: o.evidence.map((y) => (y.id === e.id ? { ...y, reliability: x.target.value as EvidenceItem["reliability"] } : y)) }), "evidence.reliability")}>
                        <option value="high">high reliability</option><option value="medium">medium reliability</option><option value="low">low reliability</option>
                      </select>
                      {fr !== "fresh" && <span className={fr === "stale" ? "text-warn" : "text-ink3"}>{fr}</span>}
                      <span className="ml-auto text-ink3">retrieved {e.retrievedAt}{e.publishedAt ? ` · published ${e.publishedAt}` : ""}</span>
                      <button className="text-ink3 hover:text-danger" aria-label="Delete evidence" onClick={() => { if (confirm(`Delete ${e.id}? Decisions that relied on it will be flagged.`)) os((o) => ({ ...o, evidence: o.evidence.filter((y) => y.id !== e.id) }), "evidence.deleted"); }}>✕</button>
                    </div>
                    <h3 className="font-medium">{e.title}</h3>
                    <p className="text-xs text-ink3">{e.origin}{e.url && <> · <a className="underline" href={e.url} target="_blank" rel="noreferrer noopener">source</a></>}</p>
                    {e.excerpt && <blockquote className="text-sm text-ink2 border-l-2 border-line2 pl-3 my-2">{e.excerpt}</blockquote>}
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {e.links.map((l, k) => (
                        <span key={k} className="chip !text-[11px]" style={{ borderColor: l.stance === "supports" ? "var(--ok)" : "var(--danger)" }}>
                          {l.stance === "supports" ? "▲ supports" : "▼ contradicts"} · {tLabel(l).slice(0, 50)}
                          <button aria-label="Unlink" className="text-ink3 hover:text-danger" onClick={() => os((o) => ({ ...o, evidence: o.evidence.map((y) => (y.id === e.id ? { ...y, links: y.links.filter((_, j) => j !== k) } : y)) }), "evidence.unlinked")}>✕</button>
                        </span>
                      ))}
                      <select className="bg-transparent text-[11px] text-accent max-w-[110px]" value="" aria-label="Link to another claim" onChange={(x) => {
                        if (!x.target.value) return;
                        const [stance, kind, ...rest] = x.target.value.split(":");
                        os((o) => ({ ...o, evidence: o.evidence.map((y) => (y.id === e.id ? { ...y, links: [...y.links, { targetKind: kind as EvidenceTargetKind, targetId: rest.join(":"), stance: stance as "supports" | "contradicts" }] } : y)) }), "evidence.linked");
                      }}>
                        <option value="">＋ link…</option>
                        {(["supports", "contradicts"] as const).map((st) => <optgroup key={st} label={st}>{targets.map((t) => <option key={st + t.kind + t.id} value={`${st}:${t.kind}:${t.id}`}>{t.label.slice(0, 60)}</option>)}</optgroup>)}
                      </select>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Research tasks" kicker="Gaps that matter for the decision — the AI cannot browse here, so it proposes research instead of inventing findings"
          right={<button className="btn" disabled={!!busy} onClick={researchGaps}>Find research gaps</button>}>
          {O.research.length === 0 ? <p className="text-sm text-ink3">No research tasks yet.</p> : (
            <ul className="space-y-2">
              {O.research.map((t) => {
                const tc = t.targetKind && t.targetId ? confidenceFrom(evidenceFor(O, t.targetKind, t.targetId).map(({ e, stance }) => ({ w: itemWeight(e), stance, origin: e.origin }))) : null;
                return (
                  <li key={t.id} className={`card p-3 flex gap-3 items-start ${t.status === "done" ? "opacity-60" : ""}`}>
                    <input type="checkbox" className="mt-1" checked={t.status === "done"} aria-label="Done" onChange={() => os((o) => ({ ...o, research: o.research.map((x) => (x.id === t.id ? { ...x, status: x.status === "done" ? "open" : "done" } : x)) }), "research.toggled")} />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{t.question}</div>
                      <div className="text-xs text-ink2 mt-0.5">{t.why}</div>
                      <div className="text-xs mt-1"><span className="text-ink3">Method:</span> {t.method}</div>
                    </div>
                    {tc && <ConfidenceMeter c={tc} />}
                    <button className="btn btn-ghost !py-0.5 text-xs" onClick={() => { if (t.targetKind && t.targetId) setDraft({ ...draft, link: `${t.targetKind}:${t.targetId}`, title: "" }); document.getElementById("nx-log-evidence")?.scrollIntoView({ behavior: "smooth" }); }}>Log result</button>
                  </li>
                );
              })}
            </ul>
          )}
          {p.ideas && <div className="flex justify-end mt-6"><button className="btn btn-primary" onClick={() => go("board")}>Decision Intelligence →</button></div>}
        </Section>
      </div>
    </div>
  );
}
