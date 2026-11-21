import type { ProjectState } from "./schemas";
import { DIMENSIONS } from "./schemas";
import { scoreIdeas } from "./scoring";
import { byId } from "./frameworks";

const CLAIM_LABEL: Record<string, string> = {
  user_fact: "User-provided", verified_external: "Verified", research_interpretation: "Research interpretation",
  ai_inference: "AI inference", working_assumption: "Working assumption", unvalidated_hypothesis: "Unvalidated hypothesis", forecast: "Forecast",
};
export const claimLabel = (c?: string) => (c ? CLAIM_LABEL[c] ?? c : "—");

export function toMarkdown(p: ProjectState, sections: ("thought" | "design" | "ideas" | "evaluation" | "decision" | "blueprint" | "roadmap" | "map")[] = ["thought", "design", "ideas", "evaluation", "decision", "blueprint", "roadmap", "map"]): string {
  const L: string[] = [];
  const I = p.interpretation;
  L.push(`# ${p.title}`, "", `> ${p.thought}`, "", `_Exported from NEXUS on ${new Date().toISOString().slice(0, 10)}. AI mode: ${p.aiMode === "dev" ? "development templates (not AI analysis)" : "live AI"}. Items marked as inference, assumption or forecast are not verified facts._`, "");
  if (sections.includes("thought") && I) {
    L.push("## Understanding", "", `**Intention:** ${I.intention}`, "", `**Problem / opportunity:** ${I.problemOrOpportunity}`, "", `**Domain:** ${I.domain} (${I.category}, ${I.maturity})`, "");
    if (I.beneficiaries.length) L.push(`**Beneficiaries:** ${I.beneficiaries.join("; ")}`, "");
    L.push("**Alternative interpretations:**", ...I.alternativeInterpretations.map((a) => `- *${a.label}* — ${a.description}`), "");
    if (I.assumptions.length) L.push("**Assumptions:**", ...I.assumptions.map((a) => `- ${a}`), "");
    if (I.missingInformation.length) L.push("**Missing information:**", ...I.missingInformation.map((a) => `- ${a}`), "");
    if (p.frameworks.length) L.push("**Frameworks in use:** " + p.frameworks.map((f) => byId(f)?.name ?? f).join(", "), "");
  }
  const D = p.design;
  if (sections.includes("design") && D && (D.empathy || D.hmws.length || D.sparks.length)) {
    L.push("## Design thinking", "");
    if (D.empathy) {
      for (const ps of D.empathy.personas) {
        L.push(`### Persona: ${ps.name} — ${ps.role} _(${ps.basis === "proto_persona" ? "proto-persona, unvalidated" : "grounded in research notes"})_`, "", ps.context, "");
        if (ps.quote) L.push(`> ${ps.quote}`, "");
        L.push(`- **Says:** ${ps.empathy.says.join("; ")}`, `- **Thinks:** ${ps.empathy.thinks.join("; ")}`, `- **Does:** ${ps.empathy.does.join("; ")}`, `- **Feels:** ${ps.empathy.feels.join("; ")}`, `- **Goals:** ${ps.goals.join("; ")}`, `- **Pains:** ${ps.pains.join("; ")}`, "");
        L.push("| Stage | Emotion | Pain | Opportunity |", "|---|---|---|---|", ...ps.journey.map((j) => `| ${j.stage} | ${j.emotion > 0 ? "+" : ""}${j.emotion} | ${j.pain} | ${j.opportunity} |`), "");
      }
      if (D.empathy.insights.length) L.push("### Insights", ...D.empathy.insights.map((i) => `- ${i.text} _(${claimLabel(i.claim)})_`), "");
      L.push("### Point of view", ...D.empathy.povs.map((v) => `- ${v.user} needs ${v.need} because ${v.insight}.`), "");
    }
    if (D.hmws.length) L.push("### How Might We", ...D.hmws.map((h) => `- ${h.starred ? "★ " : ""}${h.question}`), "");
    if (D.sparks.length) {
      L.push(`### Sparks (${D.sparks.length})`);
      for (const s of [...D.sparks].sort((a, b) => b.votes - a.votes)) L.push(`- ${s.votes ? `${"●".repeat(s.votes)} ` : ""}**${s.title}** — ${s.description} _(${s.technique === "own" ? "own idea" : s.technique})_`);
      L.push("");
    }
    for (const t of D.tests) {
      const idea = p.ideas?.ideas.find((i) => i.id === t.ideaId);
      L.push(`### Test plan: ${idea?.title ?? t.ideaId}`, "", "| Assumption | Lens | Importance | Evidence | Result | Learning |", "|---|---|---|---|---|---|",
        ...t.assumptions.map((a) => `| ${a.statement} | ${a.lens} | ${a.importance} | ${a.evidence} | ${t.results[a.id]?.status ?? "untested"} | ${t.results[a.id]?.learning ?? ""} |`), "",
        ...t.tests.map((x) => `- **${x.assumptionId} · ${x.prototype}:** ${x.description} — measure ${x.metric}; right if ${x.successCriteria}`), "");
    }
  }
  if (sections.includes("ideas") && p.ideas) {
    L.push("## Options", "");
    for (const i of p.ideas.ideas) L.push(`### ${i.id}. ${i.title} _(${i.tier})_`, "", i.summary, "", `- **For:** ${i.targetUsers}`, `- **Value:** ${i.valueProposition}`, `- **How:** ${i.howItWorks}`, `- **Different because:** ${i.differentiator}`, `- **Assumptions:** ${i.keyAssumptions.join("; ") || "—"}`, `- **Risks:** ${i.risks.join("; ") || "—"}`, "");
    if (p.ideas.notes) L.push(`_Note: ${p.ideas.notes}_`, "");
  }
  if (sections.includes("evaluation") && p.ideas && p.evaluation) {
    const rows = scoreIdeas(p.ideas.ideas, p.evaluation, p.weights);
    L.push("## Evaluation", "", "Weights: " + DIMENSIONS.map((d) => `${d.label} ${p.weights[d.key] ?? 0}`).join(", "), "", "| Rank | Option | Weighted score | Coverage | Status |", "|---|---|---|---|---|");
    for (const r of rows) L.push(`| ${r.rank || "–"} | ${r.title} | ${r.weighted ?? "unscored"} | ${Math.round(r.coverage * 100)}% | ${r.provisional ? "Provisional" : "Scored"} |`);
    L.push("", `_${p.evaluation.caveats}_`, "", "The highest score is an input to the decision, not the decision itself.", "");
  }
  if (sections.includes("decision") && p.decision) {
    const d = p.decision;
    L.push("## Decision record", "", `- **Question:** ${d.question}`, `- **Options considered:** ${d.optionsConsidered.join("; ")}`, `- **Chosen:** ${d.chosenOption}`, `- **Rationale:** ${d.rationale}`, `- **Risks & uncertainties:** ${d.risks}`, `- **Decision-maker:** ${d.decisionMaker}`, `- **Date:** ${d.date}`, `- **Reconsider if:** ${d.reconsiderIf}`, "");
  }
  if (sections.includes("blueprint") && p.blueprint) {
    const b = p.blueprint;
    L.push("## Solution blueprint", "", "### Executive summary", b.executiveSummary, "", "### Problem and desired outcome", b.problemAndOutcome, "", "### Solution concept", b.solutionConcept, "");
    if (b.usersAndStakeholders.length) L.push("### Users and stakeholders", ...b.usersAndStakeholders.map((u) => `- **${u.name}:** ${u.need}`), "");
    if (b.functionalDesign.length) L.push("### Functional design", ...b.functionalDesign.map((u) => `- **${u.component}:** ${u.description}`), "");
    L.push("### Operating / technical model", b.operatingModel, "");
    for (const s of b.categorySections) L.push(`### ${s.heading}`, ...s.items.map((x) => `- ${x}`), "");
    if (b.dependencies.length) L.push("### Dependencies", ...b.dependencies.map((x) => `- ${x}`), "");
    if (b.constraints.length) L.push("### Constraints", ...b.constraints.map((x) => `- ${x}`), "");
    if (b.risks.length) L.push("### Risks and mitigations", "| Risk | Likelihood | Impact | Mitigation |", "|---|---|---|---|", ...b.risks.map((r) => `| ${r.risk} | ${r.likelihood} | ${r.impact} | ${r.mitigation} |`), "");
    if (b.costBenefitAssumptions.length) L.push("### Cost and benefit assumptions", ...b.costBenefitAssumptions.map((c) => `- **${c.item}:** ${c.assumption} _(${claimLabel(c.claim)})_`), "");
    if (b.alternativesRejected.length) L.push("### Alternatives rejected", ...b.alternativesRejected.map((a) => `- **${a.option}:** ${a.reason}`), "");
    if (b.validationApproach.length) L.push("### Validation approach", ...b.validationApproach.map((v) => `- **Hypothesis:** ${v.hypothesis} — **Test:** ${v.experiment} — **Metric:** ${v.successMetric} — **Threshold:** ${v.threshold}`), "");
    if (b.measuresOfSuccess.length) L.push("### Measures of success", ...b.measuresOfSuccess.map((m) => `- ${m.metric}: ${m.target} (${m.kind})`), "");
  }
  if (sections.includes("roadmap") && p.roadmap) {
    const r = p.roadmap;
    L.push(`## Implementation roadmap (${r.approach})`, "", `**MVP:** ${r.mvpDefinition}`, "", "**Planning assumptions:**", ...r.planningAssumptions.map((a) => `- ${a}`), "");
    for (const ph of r.phases) {
      L.push(`### ${ph.name}`, ph.goal, "");
      for (const m of ph.milestones) {
        L.push(`**Milestone — ${m.title}** (exit: ${m.exitCriteria})`, "");
        for (const t of p.tasks.filter((t) => t.milestoneId === m.id)) L.push(`- [${t.status === "done" ? "x" : " "}] ${t.id} ${t.title} — ${t.assignee ?? ""}${t.dueDate ? `, due ${t.dueDate}` : ""}${t.dependsOn.length ? `, after ${t.dependsOn.join(", ")}` : ""}`);
        L.push("");
      }
    }
    if (r.raci.length) L.push("### RACI", "| Activity | R | A | C | I |", "|---|---|---|---|---|", ...r.raci.map((x) => `| ${x.activity} | ${x.responsible} | ${x.accountable} | ${x.consulted.join(", ")} | ${x.informed.join(", ")} |`), "");
    if (r.kpis.length) L.push("### KPIs", ...r.kpis.map((k) => `- **${k.name}:** ${k.target} — ${k.measure}`), "");
    if (r.risks.length) L.push("### Delivery risks", ...r.risks.map((k) => `- ${k.risk} (owner: ${k.owner}) — ${k.mitigation}`), "");
    if (r.goLiveCriteria.length) L.push("### Go-live criteria", ...r.goLiveCriteria.map((k) => `- ${k}`), "");
  }
  if (sections.includes("map")) {
    L.push("## Thinking map (outline)", "");
    const walk = (pid: string | null, depth: number) => {
      for (const n of p.nodes.filter((x) => x.parentId === pid)) {
        L.push(`${"  ".repeat(depth)}- **${n.type}** ${n.title}${n.provenance.claim ? ` _(${claimLabel(n.provenance.claim)})_` : ""}`);
        walk(n.id, depth + 1);
      }
    };
    walk(null, 0);
  }
  return L.join("\n");
}

export function download(name: string, content: string, type = "text/markdown") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
