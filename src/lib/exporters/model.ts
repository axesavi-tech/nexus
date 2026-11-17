/**
 * Format-neutral document model. Every exporter (PDF, Word, PowerPoint) renders the same model,
 * so content and ordering are identical across formats and only the design differs.
 */
import type { ProjectState } from "../schemas";
import { DIMENSIONS } from "../schemas";
import { scoreIdeas } from "../scoring";
import { byId } from "../frameworks";
import { claimLabel } from "../export";

export type Block =
  | { t: "lead"; text: string }
  | { t: "p"; text: string }
  | { t: "h3"; text: string }
  | { t: "bullets"; items: string[] }
  | { t: "kv"; rows: [string, string][] }
  | { t: "table"; head: string[]; rows: string[][]; widths?: number[] }
  | { t: "callout"; text: string; tone?: "accent" | "sage" | "warn" }
  | { t: "quote"; text: string };

export const SECTION_IDS = ["thought", "ideas", "evaluation", "decision", "blueprint", "roadmap", "tasks", "map"] as const;
export type SectionId = (typeof SECTION_IDS)[number];
export const SECTION_LABELS: Record<SectionId, string> = {
  thought: "Understanding", ideas: "Options", evaluation: "Evaluation", decision: "Decision record",
  blueprint: "Solution blueprint", roadmap: "Delivery plan", tasks: "Task list", map: "Thinking map",
};

export interface Section { id: SectionId; kicker: string; title: string; blocks: Block[] }
export interface DocModel {
  title: string; thought: string; date: string; aiNote: string;
  stats: { label: string; value: string }[];
  sections: Section[];
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const list = (xs: string[] | undefined) => (xs && xs.length ? xs : null);

export function availableSections(p: ProjectState): SectionId[] {
  return SECTION_IDS.filter((id) => ({
    thought: Boolean(p.interpretation), ideas: Boolean(p.ideas), evaluation: Boolean(p.ideas && p.evaluation),
    decision: Boolean(p.decision), blueprint: Boolean(p.blueprint), roadmap: Boolean(p.roadmap),
    tasks: p.tasks.length > 0, map: p.nodes.length > 0,
  })[id]);
}

export function buildDoc(p: ProjectState, include: SectionId[] = availableSections(p)): DocModel {
  const want = new Set(include);
  const S: Section[] = [];
  let n = 0;
  const add = (id: SectionId, title: string, blocks: Block[]) => { n++; S.push({ id, kicker: `${String(n).padStart(2, "0")} · ${SECTION_LABELS[id]}`, title, blocks: blocks.filter(Boolean) }); };

  const I = p.interpretation;
  if (want.has("thought") && I) {
    const b: Block[] = [
      { t: "lead", text: I.intention },
      { t: "kv", rows: [["Problem / opportunity", I.problemOrOpportunity], ["Domain", `${I.domain} · ${cap(I.category)} · ${cap(I.maturity)}`], ...(I.beneficiaries.length ? [["Who benefits", I.beneficiaries.join("; ")] as [string, string]] : [])] },
    ];
    if (list(I.desiredOutcomes)) b.push({ t: "h3", text: "Desired outcomes" }, { t: "bullets", items: I.desiredOutcomes });
    if (I.opportunityAreas.length) b.push({ t: "h3", text: "Opportunity areas" }, { t: "bullets", items: I.opportunityAreas.map((o) => `${o.title} — ${o.description}`) });
    if (I.alternativeInterpretations.length) b.push({ t: "h3", text: "Other ways to read it" }, { t: "bullets", items: I.alternativeInterpretations.map((a) => `${a.label} — ${a.description}`) });
    if (list(I.constraints.map((c) => c.text))) b.push({ t: "h3", text: "Constraints" }, { t: "bullets", items: I.constraints.map((c) => `${c.text}${c.kind === "implicit" ? " (implied)" : ""}`) });
    if (list(I.assumptions)) b.push({ t: "h3", text: "Assumptions" }, { t: "bullets", items: I.assumptions });
    if (list(I.missingInformation)) b.push({ t: "callout", tone: "warn", text: "Still unknown: " + I.missingInformation.join(" · ") });
    if (p.frameworks.length) b.push({ t: "p", text: "Thinking frameworks applied: " + p.frameworks.map((f) => byId(f)?.name ?? f).join(", ") + "." });
    add("thought", I.title || "What this is really about", b);
  }

  if (want.has("ideas") && p.ideas) {
    const b: Block[] = [{ t: "lead", text: `${p.ideas.ideas.length} genuinely different directions, from the safest to the most ambitious.` }];
    for (const i of p.ideas.ideas) {
      b.push({ t: "h3", text: `${i.id}. ${i.title} — ${cap(i.tier)}` }, { t: "p", text: i.summary },
        { t: "kv", rows: [["For", i.targetUsers], ["Value", i.valueProposition], ["How it works", i.howItWorks], ["Different because", i.differentiator]] });
      if (i.keyAssumptions.length || i.risks.length) b.push({ t: "bullets", items: [...i.keyAssumptions.map((a) => `Assumes: ${a}`), ...i.risks.map((r) => `Risk: ${r}`)] });
    }
    if (p.ideas.notes) b.push({ t: "callout", text: p.ideas.notes });
    add("ideas", "The options on the table", b);
  }

  if (want.has("evaluation") && p.ideas && p.evaluation) {
    const rows = scoreIdeas(p.ideas.ideas, p.evaluation, p.weights);
    add("evaluation", "How the options compare", [
      { t: "lead", text: "Each option was scored on eight weighted dimensions. The score informs the decision; it does not make it." },
      { t: "table", head: ["Rank", "Option", "Score", "Evidence coverage", "Status"], widths: [8, 46, 14, 16, 16],
        rows: rows.map((r) => [r.rank ? String(r.rank) : "–", r.title, r.weighted == null ? "unscored" : String(r.weighted), `${Math.round(r.coverage * 100)}%`, r.provisional ? "Provisional" : "Scored"]) },
      { t: "table", head: ["Dimension", "Weight"], widths: [80, 20], rows: DIMENSIONS.map((d) => [d.label, `${p.weights[d.key] ?? 0}`]) },
      { t: "callout", tone: "warn", text: p.evaluation.caveats },
    ]);
  }

  if (want.has("decision") && p.decision) {
    const d = p.decision;
    add("decision", d.chosenOption, [
      { t: "quote", text: d.rationale },
      { t: "kv", rows: [["Question", d.question], ["Options considered", d.optionsConsidered.join("; ")], ["Risks & uncertainties", d.risks], ["Decided by", d.decisionMaker], ["Date", d.date], ["Revisit if", d.reconsiderIf]] },
    ]);
  }

  if (want.has("blueprint") && p.blueprint) {
    const bp = p.blueprint;
    const b: Block[] = [{ t: "lead", text: bp.executiveSummary }, { t: "h3", text: "Problem and desired outcome" }, { t: "p", text: bp.problemAndOutcome }, { t: "h3", text: "Solution concept" }, { t: "p", text: bp.solutionConcept }];
    if (bp.usersAndStakeholders.length) b.push({ t: "h3", text: "Users and stakeholders" }, { t: "table", head: ["Who", "What they need"], widths: [30, 70], rows: bp.usersAndStakeholders.map((u) => [u.name, u.need]) });
    if (bp.functionalDesign.length) b.push({ t: "h3", text: "How it works" }, { t: "table", head: ["Component", "Description"], widths: [30, 70], rows: bp.functionalDesign.map((u) => [u.component, u.description]) });
    b.push({ t: "h3", text: "Operating model" }, { t: "p", text: bp.operatingModel });
    for (const s of bp.categorySections) b.push({ t: "h3", text: s.heading }, { t: "bullets", items: s.items });
    if (bp.risks.length) b.push({ t: "h3", text: "Risks and mitigations" }, { t: "table", head: ["Risk", "Likelihood", "Impact", "Mitigation"], widths: [36, 12, 12, 40], rows: bp.risks.map((r) => [r.risk, cap(r.likelihood), cap(r.impact), r.mitigation]) });
    if (bp.validationApproach.length) b.push({ t: "h3", text: "How we will validate it" }, { t: "table", head: ["Hypothesis", "Test", "Success metric", "Threshold"], widths: [30, 30, 22, 18], rows: bp.validationApproach.map((v) => [v.hypothesis, v.experiment, v.successMetric, v.threshold]) });
    if (bp.measuresOfSuccess.length) b.push({ t: "h3", text: "Measures of success" }, { t: "table", head: ["Metric", "Target", "Type"], widths: [50, 35, 15], rows: bp.measuresOfSuccess.map((m) => [m.metric, m.target, cap(m.kind)]) });
    if (bp.costBenefitAssumptions.length) b.push({ t: "h3", text: "Cost and benefit assumptions" }, { t: "bullets", items: bp.costBenefitAssumptions.map((c) => `${c.item}: ${c.assumption} (${claimLabel(c.claim)})`) });
    if (bp.dependencies.length) b.push({ t: "h3", text: "Dependencies" }, { t: "bullets", items: bp.dependencies });
    if (bp.constraints.length) b.push({ t: "h3", text: "Constraints" }, { t: "bullets", items: bp.constraints });
    if (bp.alternativesRejected.length) b.push({ t: "h3", text: "Alternatives rejected" }, { t: "bullets", items: bp.alternativesRejected.map((a) => `${a.option} — ${a.reason}`) });
    add("blueprint", "The solution blueprint", b);
  }

  if (want.has("roadmap") && p.roadmap) {
    const r = p.roadmap;
    const b: Block[] = [{ t: "lead", text: r.mvpDefinition }, { t: "kv", rows: [["Approach", cap(r.approach)], ["Phases", String(r.phases.length)], ["Tasks", String(p.tasks.length)]] }];
    if (r.planningAssumptions.length) b.push({ t: "h3", text: "Planning assumptions" }, { t: "bullets", items: r.planningAssumptions });
    for (const ph of r.phases) {
      b.push({ t: "h3", text: `${ph.name}` }, { t: "p", text: ph.goal });
      b.push({ t: "bullets", items: ph.milestones.map((m) => `Milestone — ${m.title}. Done when: ${m.exitCriteria}`) });
    }
    if (r.kpis.length) b.push({ t: "h3", text: "KPIs" }, { t: "table", head: ["KPI", "Target", "How measured"], widths: [30, 25, 45], rows: r.kpis.map((k) => [k.name, k.target, k.measure]) });
    if (r.raci.length) b.push({ t: "h3", text: "Who does what (RACI)" }, { t: "table", head: ["Activity", "Responsible", "Accountable", "Consulted", "Informed"], widths: [32, 17, 17, 17, 17], rows: r.raci.map((x) => [x.activity, x.responsible, x.accountable, x.consulted.join(", "), x.informed.join(", ")]) });
    if (r.risks.length) b.push({ t: "h3", text: "Delivery risks" }, { t: "table", head: ["Risk", "Owner", "Mitigation"], widths: [40, 15, 45], rows: r.risks.map((k) => [k.risk, k.owner, k.mitigation]) });
    if (r.goLiveCriteria.length) b.push({ t: "h3", text: "Go-live criteria" }, { t: "bullets", items: r.goLiveCriteria });
    add("roadmap", "How we make it happen", b);
  }

  if (want.has("tasks") && p.tasks.length) {
    const ms = new Map((p.roadmap?.phases ?? []).flatMap((ph) => ph.milestones.map((m) => [m.id, m.title] as const)));
    add("tasks", "Every task, traceable", [
      { t: "table", head: ["ID", "Task", "Milestone", "Priority", "Owner", "Due", "Status"], widths: [7, 33, 18, 10, 12, 10, 10],
        rows: p.tasks.map((t) => [t.id, t.title, (t.milestoneId && ms.get(t.milestoneId)) || "—", cap(t.priority), t.assignee || "—", t.dueDate || "—", cap(t.status)]) },
    ]);
  }

  if (want.has("map") && p.nodes.length) {
    const items: string[] = [];
    const walk = (pid: string | null, depth: number) => {
      for (const nd of p.nodes.filter((x) => x.parentId === pid)) {
        if (items.length >= 120) return;
        items.push(`${"    ".repeat(Math.min(depth, 4))}${cap(nd.type)}: ${nd.title}`);
        walk(nd.id, depth + 1);
      }
    };
    walk(null, 0);
    add("map", "The thinking map", [{ t: "p", text: `${p.nodes.length} ideas and ${p.edges.length} connections. Outline below${p.nodes.length > 120 ? " (first 120 shown)" : ""}.` }, { t: "bullets", items }]);
  }

  const stats = [
    { label: "Ideas mapped", value: String(p.nodes.length) },
    { label: "Options", value: String(p.ideas?.ideas.length ?? 0) },
    { label: "Tasks", value: String(p.tasks.length) },
  ];
  return {
    title: p.title, thought: p.thought,
    date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
    aiNote: p.aiMode === "dev" ? "Generated with development templates, not AI analysis." : "Prepared with NEXUS. Items marked as inference, assumption or forecast are not verified facts.",
    stats, sections: S,
  };
}

export const fileSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "nexus";
