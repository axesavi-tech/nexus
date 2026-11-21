/**
 * Provider-independent AI gateway.
 * - Each operation declares an input shape, a zod output schema, a prompt builder and a deterministic dev fallback.
 * - Providers return raw JSON; the gateway validates it against the schema (one corrective retry) before returning.
 * - Prose is never written to the database directly: callers receive validated structures only.
 */
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM, ACTION_GUIDE } from "./prompts";
import {
  InterpretationSchema, NodePatchSchema, IdeasSchema, EvaluationSchema, BlueprintSchema, RoadmapSchema,
  EmpathySchema, SparksSchema, ClusterSchema, TestPlanSchema,
  GatesSchema, DecisionReportSchema, ResearchGapsSchema, FinAssumptionsSchema, GATES,
  DIMENSIONS, NODE_ACTIONS, TECHNIQUES, type NodeAction, type Sliders,
} from "../schemas";
import { techniqueById, HMW_ANGLE_LABEL } from "../design";
import * as dev from "./dev";
import { fitToSchema } from "./fit";
import { byId as frameworkById } from "../frameworks";

export interface ProviderResult { json: unknown; model: string; inputTokens?: number; outputTokens?: number; truncated?: boolean }
export interface Provider {
  name: string;
  call(args: { system: string; user: string; toolName: string; schema: Record<string, unknown>; maxTokens: number }): Promise<ProviderResult>;
}

class AnthropicProvider implements Provider {
  name = "anthropic";
  private client: Anthropic;
  constructor(apiKey: string, private model: string) { this.client = new Anthropic({ apiKey }); }
  async call({ system, user, toolName, schema, maxTokens }: Parameters<Provider["call"]>[0]): Promise<ProviderResult> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      tools: [{ name: toolName, description: "Return the structured result.", input_schema: schema as Anthropic.Tool.InputSchema }],
      // Newer models reject forced tool_choice ("tool"/"any"), so we ask for the tool and fall back to JSON in text.
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: `${user}\n\nRespond ONLY by calling the ${toolName} tool.` }],
    });
    const usage = { model: res.model, inputTokens: res.usage?.input_tokens, outputTokens: res.usage?.output_tokens, truncated: res.stop_reason === "max_tokens" };
    const block = res.content.find((b) => b.type === "tool_use");
    if (block && block.type === "tool_use") return { json: block.input, ...usage };
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
    const json = extractJson(text);
    if (json === undefined) throw new Error("Model did not return structured output");
    return { json, ...usage };
  }
}

/** Pull the first JSON object out of free text (handles ```json fences and surrounding prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf("{"), end = c.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try { return JSON.parse(c.slice(start, end + 1)); } catch { /* try next */ }
  }
  return undefined;
}

export function getProvider(): Provider | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new AnthropicProvider(key, process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5");
}

const wrap = (label: string, v: unknown) => `<user_content label="${label}">\n${typeof v === "string" ? v : JSON.stringify(v, null, 1)}\n</user_content>`;

// ---------- Operation definitions ----------
const AnalyzeIn = z.object({ thought: z.string().min(1).max(8000), mode: z.enum(["free", "guided", "strategic"]), answers: z.record(z.string(), z.string()).optional() });
const NodeIn = z.object({
  action: z.enum(NODE_ACTIONS),
  frameworkId: z.string().optional(),
  instruction: z.string().max(8000).optional(),
  thought: z.string().max(8000),
  context: z.object({
    focus: z.object({ id: z.string(), type: z.string(), title: z.string(), description: z.string() }),
    ancestry: z.array(z.any()), siblings: z.array(z.any()), children: z.array(z.any()), others: z.array(z.any()),
  }),
});
const SliderIn = z.record(z.string(), z.number().min(0).max(100));
const IdeateIn = z.object({
  thought: z.string().max(8000),
  interpretation: z.any(),
  focus: z.array(z.object({ id: z.string(), type: z.string(), title: z.string(), description: z.string().optional() })).max(30),
  sliders: SliderIn,
  previousTitles: z.array(z.string()).max(20).optional(),
  sparks: z.array(z.object({ title: z.string(), description: z.string(), votes: z.number().optional(), hmw: z.string().optional() })).max(8).optional(),
  personas: z.array(z.any()).max(3).optional(),
});
const EvaluateIn = z.object({ thought: z.string().max(8000), ideas: z.array(z.any()).min(1).max(8), constraints: z.array(z.string()).max(10).optional() });
const BlueprintIn = z.object({ thought: z.string().max(8000), interpretation: z.any(), idea: z.any(), evaluation: z.any().optional(), decisionRationale: z.string().max(2000).optional() });
const RoadmapIn = z.object({ thought: z.string().max(8000), blueprint: z.any(), approach: z.enum(["agile", "waterfall", "hybrid", "personal"]), teamNote: z.string().max(600).optional() });

const EmpathizeIn = z.object({
  thought: z.string().max(8000), interpretation: z.any().optional(), notes: z.string().max(20000).optional(),
  stakeholders: z.array(z.object({ title: z.string(), description: z.string().optional() })).max(12).optional(),
});
const SparkIn = z.object({
  thought: z.string().max(8000), hmw: z.string().min(1).max(400), technique: z.enum(TECHNIQUES),
  count: z.number().int().min(3).max(12), wildness: z.number().min(0).max(100),
  existing: z.array(z.string().max(120)).max(60),
  seed: z.object({ title: z.string(), description: z.string() }).optional(),
  personas: z.array(z.any()).max(3).optional(),
});
const ClusterIn = z.object({ hmw: z.string().max(400).optional(), sparks: z.array(z.object({ id: z.string(), title: z.string(), description: z.string() })).min(3).max(60) });
const TestPlanIn = z.object({ thought: z.string().max(8000), idea: z.any(), personas: z.array(z.any()).max(3).optional() });
const GatesIn = z.object({ thought: z.string().max(8000), ideas: z.array(z.any()).min(1).max(8), context: z.string().max(2000).optional() });
const ReportIn = z.object({
  thought: z.string().max(8000), idea: z.any(), recommendation: z.any(), alternatives: z.array(z.any()).max(8),
  evidence: z.array(z.object({ id: z.string(), title: z.string(), type: z.string(), stance: z.string(), excerpt: z.string(), origin: z.string() })).max(60),
  assumptions: z.array(z.string()).max(20), businessCase: z.any().optional(), questions: z.array(z.string()).length(8),
});
const GapsIn = z.object({
  thought: z.string().max(8000), interpretation: z.any().optional(),
  targets: z.array(z.object({ kind: z.enum(["problem", "concept", "assumption"]), id: z.string(), statement: z.string(), confidence: z.number() })).min(1).max(30),
});
const FinIn = z.object({ thought: z.string().max(8000), idea: z.any(), currency: z.string().max(8), notes: z.string().max(2000).optional() });
const PROTOTYPES_TXT = "paper_sketch, storyboard, clickable_mockup, wizard_of_oz (fake the automation manually), concierge (deliver the service by hand), fake_door (measure clicks on an offer that doesn't exist yet), landing_page, role_play, physical_mockup, pilot";

function sliderText(s: Record<string, number>) {
  return Object.entries(s).map(([k, v]) => `${k}: ${v}/100`).join(", ");
}

export const OPS = {
  analyze: {
    input: AnalyzeIn, output: InterpretationSchema, tokens: 3000,
    prompt: (i: z.infer<typeof AnalyzeIn>) => `Analyse this thought. Preserve the user's intent and wording; do not lock into a single interpretation.
Entry mode: ${i.mode} (${i.mode === "free" ? "minimal structure, creative" : i.mode === "guided" ? "guided questions" : "rigorous strategic analysis"}).
Ask at most 3 clarifying questions, only ones that materially change direction.
Category guide: business (commercial venture/brand/offer), software (digital/AI product), operational (process/org improvement), physical (hardware/invention), personal (personal, educational, community), abstract (open concept, no domain yet).
${wrap("thought", i.thought)}
${i.answers && Object.keys(i.answers).length ? wrap("answers_to_clarifying_questions", i.answers) : ""}`,
    dev: (i: z.infer<typeof AnalyzeIn>) => dev.analyze(i.thought, i.mode),
  },
  node: {
    input: NodeIn, output: NodePatchSchema, tokens: 3000,
    prompt: (i: z.infer<typeof NodeIn>) => {
      const fw = i.frameworkId ? frameworkById(i.frameworkId) : undefined;
      return `Operation: ${ACTION_GUIDE[i.action as NodeAction]}
${fw ? `Framework: ${fw.name}. How to apply: ${fw.prompt}` : ""}
${i.instruction ? `User instruction: ${wrap("instruction", i.instruction)}` : ""}
Modify only the relevant portion of the map. Use parentRef = an existing node id (normally the focus id "${i.context.focus.id}") or the ref of a node you add in this patch. In links, refer to existing nodes by id. Only update existing nodes when it adds clarity. Keep titles short (≤ 10 words) and descriptions to 1-3 sentences.
Original thought: ${wrap("thought", i.thought)}
Map context: ${wrap("map_context", i.context)}`;
    },
    dev: (i: z.infer<typeof NodeIn>) => dev.nodeAction(i.action as NodeAction, i.context.focus, i.instruction, i.frameworkId),
  },
  ideate: {
    input: IdeateIn, output: IdeasSchema, tokens: 5000,
    prompt: (i: z.infer<typeof IdeateIn>) => i.sparks?.length ? `Converge: develop the user's dot-voted sparks into 2–4 well-formed solution concepts. You may combine compatible sparks into one concept; keep the strongest distinct ones separate. Do not drop a spark that received the most votes. Assign each concept the tier that honestly fits it (conservative / practical / disruptive / moonshot) — tiers may repeat.
Each concept needs intended users (ground them in the personas when given), a complete value proposition, how it works, what differentiates it, key assumptions and risks. Use ids I1..In. In originNodeIds cite map node ids the concept draws from (may be empty).
Creativity controls: ${sliderText(i.sliders)}.
In notes, say which sparks were merged and anything the votes may have overlooked.
Thought: ${wrap("thought", i.thought)}
Understanding: ${wrap("interpretation", i.interpretation)}
Voted sparks (with the How Might We each answers): ${wrap("sparks", i.sparks)}
${i.personas?.length ? `Personas: ${wrap("personas", i.personas)}` : ""}
Map nodes: ${wrap("map_nodes", i.focus)}` : `Generate 4 genuinely different solution directions — exactly one per tier: conservative (low risk, limited disruption), practical (meaningful differentiation, credible feasibility), disruptive (redesigns the existing model), moonshot (high uncertainty, transformative). Each must differ in mechanism, target user or business model, not just wording.
Creativity controls (adapt your output to them): ${sliderText(i.sliders)}.
Each idea needs intended users, a complete value proposition, how it works, what differentiates it, key assumptions and risks. Use ids I1..I4. In originNodeIds cite the map node ids the idea draws from.
${i.previousTitles?.length ? `Avoid repeating these earlier ideas: ${i.previousTitles.join("; ")}` : ""}
In notes, state whether the problem itself might be better reframed, and whether a simpler alternative might beat all four.
Thought: ${wrap("thought", i.thought)}
Understanding: ${wrap("interpretation", i.interpretation)}
Selected map nodes: ${wrap("map_nodes", i.focus)}`,
    dev: (i: z.infer<typeof IdeateIn>) => i.sparks?.length ? dev.conceptsFromSparks(i.sparks) : dev.ideate(i.thought, i.focus, i.sliders as Sliders),
  },
  evaluate: {
    input: EvaluateIn, output: EvaluationSchema, tokens: 6000,
    prompt: (i: z.infer<typeof EvaluateIn>) => `Score each idea on these dimensions (0-100, explicit criteria): ${DIMENSIONS.map((d) => `${d.key} = ${d.label}`).join("; ")}.
Scoring criteria: 0-20 very weak, 21-40 weak, 41-60 uncertain/moderate, 61-80 strong, 81-100 exceptional. For "risk", higher = safer.
Use the dimension keys exactly. If there is genuinely no basis to judge a dimension, set score to null rather than inventing precision. Set evidence to "missing" whenever the score rests on your inference rather than information the user gave. Confidence should usually be low or medium without research.
impact, riskLevel and costLevel are 1-5 relative estimates. Do NOT compute weighted totals — the platform does the arithmetic.
In caveats, warn what could change the ranking.
Thought: ${wrap("thought", i.thought)}
Known constraints: ${wrap("constraints", i.constraints ?? [])}
Ideas: ${wrap("ideas", i.ideas)}`,
    dev: (i: z.infer<typeof EvaluateIn>) => dev.evaluate(i.ideas),
  },
  blueprint: {
    input: BlueprintIn, output: BlueprintSchema, tokens: 10000,
    prompt: (i: z.infer<typeof BlueprintIn>) => `Turn the selected idea into a practical solution blueprint suited to its category.
Category-specific sections (categorySections) must follow:
- business: target customers, market & competitor research needed, business model, acquisition, operating model, cost & revenue drivers, partnerships, pilot & go-to-market.
- software: PRD summary, user journeys, functional & non-functional requirements, key user stories with acceptance criteria, system architecture, data model, APIs/integrations, security, testing, deployment.
- operational: current-state questions, as-is vs to-be process, root causes, standardisation, automation candidates, controls, change management, KPI & benefits.
- physical: concept spec, technical feasibility questions, materials/components, prototype plan, manufacturing, supply chain assumptions, regulatory & safety assessment needs, indicative cost model.
- personal/abstract: clarity, affordability, stakeholder needs, realistic actions, measurable progress.
Mark each cost/benefit assumption with an honest claim type. Never state market sizes, prices or competitor facts as verified. Name alternatives rejected and why. Keep it specific to this idea.
Thought: ${wrap("thought", i.thought)}
Understanding: ${wrap("interpretation", i.interpretation)}
Selected idea: ${wrap("idea", i.idea)}
Evaluation: ${wrap("evaluation", i.evaluation ?? {})}
Decision rationale: ${wrap("decision", i.decisionRationale ?? "")}`,
    dev: (i: z.infer<typeof BlueprintIn>) => dev.blueprint(i.idea, i.interpretation),
  },
  roadmap: {
    input: RoadmapIn, output: RoadmapSchema, tokens: 12000,
    prompt: (i: z.infer<typeof RoadmapIn>) => `Convert this solution blueprint into a ${i.approach} delivery plan.
${i.approach === "agile" ? "Phases are releases; milestones are release goals; tasks read like epics/features/stories." : i.approach === "waterfall" ? "Phases with gates; milestones are deliverables/gate reviews." : i.approach === "hybrid" ? "Fixed milestones with iterative work inside." : "Simple personal steps, habits and deadlines; roles are 'You' or named helpers."}
Rules: task ids T1..Tn, milestone ids M1..Mn, phase ids P1..Pn. dependsOn must reference task ids only and must not form cycles. estimateDays are planning estimates. State planning assumptions (team size, availability, start conditions). Start with the step that most reduces uncertainty. Keep it realistic, not exhaustive: 8–20 tasks, at most 5 phases, one- or two-sentence descriptions, and keep every text field short.
${i.teamNote ? `Team/context: ${wrap("team", i.teamNote)}` : ""}
Thought: ${wrap("thought", i.thought)}
Blueprint: ${wrap("blueprint", i.blueprint)}`,
    dev: (i: z.infer<typeof RoadmapIn>) => dev.roadmap(i.blueprint, i.approach),
  },
  empathize: {
    input: EmpathizeIn, output: EmpathySchema, tokens: 7000,
    prompt: (i: z.infer<typeof EmpathizeIn>) => `Design thinking — EMPATHIZE and DEFINE.
1. Build 2–3 personas for the people most affected (never more than 3). If research notes are provided, ground every persona in them, set basis "user_research", and only use details the notes support. If there are no notes, set basis "proto_persona": these are hypotheses to validate, so keep them plausible and modest, with invented first names only.
2. For each persona: an empathy map (says / thinks / does / feels — short, concrete, first-person where natural), goals, pains, gains, one representative quote (in quotes only if it comes verbatim from the notes; otherwise a plausible paraphrase), and a 3–6 stage journey with emotion from -2 (very negative) to +2 (very positive), the pain at each stage and the design opportunity it opens.
3. Insights: 3–8 non-obvious truths about the people (tensions, workarounds, contradictions between says and does). Claim type: research_interpretation when drawn from the notes, otherwise unvalidated_hypothesis.
4. Point-of-view statements: [user] needs [need — a verb, not a solution] because [insight].
5. How Might We questions: 6–10, each tied to a POV via povId, spread across angles (${Object.entries(HMW_ANGLE_LABEL).map(([k, v]) => `${k} = ${v}`).join("; ")}). Each HMW must be neither so broad it gives no focus nor so narrow it embeds a solution. Start every one with "How might we".
6. researchGaps: what real research (who to talk to, what to observe) would most change these personas.
Use short ids: P1.., IN1.., POV1.., H1...
Thought: ${wrap("thought", i.thought)}
Understanding: ${wrap("interpretation", i.interpretation ?? {})}
Stakeholders on the map: ${wrap("stakeholders", i.stakeholders ?? [])}
${i.notes?.trim() ? `Research notes from the user: ${wrap("research_notes", i.notes)}` : "No research notes were provided — personas must be proto-personas."}`,
    dev: (i: z.infer<typeof EmpathizeIn>) => dev.empathize(i.thought, i.stakeholders ?? [], !!i.notes?.trim()),
  },
  spark: {
    input: SparkIn, output: SparksSchema, tokens: 3500,
    prompt: (i: z.infer<typeof SparkIn>) => {
      const t = techniqueById(i.technique)!;
      return `Design thinking — IDEATE (divergent). Technique: ${t.name}. ${t.prompt}
Generate ${i.count} sparks answering the How Might We question. A spark is a quick, concrete idea: a punchy title (≤ 8 words) and a 1–2 sentence description of what actually happens. No feasibility filtering yet, but every spark must be specific to this challenge — no generic advice. Each spark must differ in mechanism, not just wording.
Wildness: ${i.wildness}/100 (0 = safe and familiar, 100 = bold and unconventional).
${i.existing.length ? `Do not repeat or lightly reword these existing sparks: ${wrap("existing_sparks", i.existing)}` : ""}
${i.seed ? `Seed idea to build on: ${wrap("seed", i.seed)}` : ""}
How Might We: ${wrap("hmw", i.hmw)}
Thought: ${wrap("thought", i.thought)}
${i.personas?.length ? `Personas: ${wrap("personas", i.personas)}` : ""}`;
    },
    dev: (i: z.infer<typeof SparkIn>) => dev.sparks(i.technique, i.hmw, i.count, i.seed?.title, i.personas?.map((p) => String((p as { name?: string }).name ?? "")) ?? []),
  },
  cluster: {
    input: ClusterIn, output: ClusterSchema, tokens: 2500,
    prompt: (i: z.infer<typeof ClusterIn>) => `Design thinking — affinity clustering. Group these sparks into 2–7 themes by the underlying mechanism or strategy (not by surface words). Every spark id must appear in exactly one cluster. Name each cluster in ≤ 4 words and describe the shared theme in one sentence.
In whitespace, list up to 4 promising angles that NO spark explores yet (to prompt another round of ideation).
How Might We: ${wrap("hmw", i.hmw ?? "")}
Sparks: ${wrap("sparks", i.sparks)}`,
    dev: (i: z.infer<typeof ClusterIn>) => dev.cluster(i.sparks),
  },
  testplan: {
    input: TestPlanIn, output: TestPlanSchema, tokens: 5000,
    prompt: (i: z.infer<typeof TestPlanIn>) => `Design thinking — PROTOTYPE & TEST, using assumption mapping.
1. List 4–8 assumptions that must be true for this concept to succeed, spread across desirability (people want it), feasibility (it can be built/delivered) and viability (it can sustain itself). Rate importance 1–5 (5 = the concept fails if wrong) and evidence 1–5 (how much real evidence exists today, given only what the user provided — usually 1–2). Ids A1..An.
2. Design 2–5 cheap, fast tests for the riskiest assumptions (high importance, low evidence) first. Choose the lowest-fidelity prototype that can produce a real signal: ${PROTOTYPES_TXT}. Each test: what you will put in front of whom, the metric, and a concrete success threshold decided BEFORE running it. Effort in days, cost low/medium/high.
3. A 3–6 frame storyboard of the ideal user experience with the concept (frame title + caption), usable as a paper prototype.
Never claim results; these are plans.
Thought: ${wrap("thought", i.thought)}
Concept: ${wrap("concept", i.idea)}
${i.personas?.length ? `Personas: ${wrap("personas", i.personas)}` : ""}`,
    dev: (i: z.infer<typeof TestPlanIn>) => dev.testplan(i.idea),
  },
  gates: {
    input: GatesIn, output: GatesSchema, tokens: 5000,
    prompt: (i: z.infer<typeof GatesIn>) => `Risk agent — mandatory risk & policy gates. For EACH concept and EACH gate (${GATES.join(", ")}), give a preliminary assessment: pass (no material exposure you can identify), conditional (exposure that can be managed — say the condition), or fail (unacceptable exposure as currently designed — say why). Be specific to the concept and its likely jurisdiction; do not give legal advice or claim certainty — these are preliminary screens a human must confirm. Never mark something pass just because it is commercially attractive. Notes ≤ 2 sentences.
Thought: ${wrap("thought", i.thought)}
${i.context ? `Context: ${wrap("context", i.context)}` : ""}
Concepts (use their ids): ${wrap("concepts", i.ideas)}`,
    dev: (i: z.infer<typeof GatesIn>) => dev.gates(i.ideas),
  },
  decision_report: {
    input: ReportIn, output: DecisionReportSchema, tokens: 5000,
    prompt: (i: z.infer<typeof ReportIn>) => `Decision synthesis agent. Write an explainable decision report for the concept below. The platform's deterministic engine has ALREADY produced the recommendation, scores, evidence confidence, gate status and financials — explain them; do not recompute or contradict the numbers.
Answer exactly these 8 questions in order (q = the question text verbatim): ${i.questions.map((q, n) => `${n + 1}. ${q}`).join(" ")}
Rules: 2–5 plain sentences per answer. In evidenceIds cite ONLY ids from the evidence register provided; if an answer rests on no registered evidence, leave evidenceIds empty and say plainly that it is an assumption or AI inference. Never invent sources, numbers, interviews or results. Where evidence is weak, say what would strengthen it. Be candid about weaknesses — the report must help a decision-maker, not sell the idea.
Thought: ${wrap("thought", i.thought)}
Concept: ${wrap("concept", i.idea)}
Deterministic recommendation: ${wrap("recommendation", i.recommendation)}
Alternatives considered: ${wrap("alternatives", i.alternatives)}
Evidence register (id, type, stance): ${wrap("evidence", i.evidence)}
Tracked assumptions: ${wrap("assumptions", i.assumptions)}
${i.businessCase ? `Business case (computed by the platform): ${wrap("business_case", i.businessCase)}` : "No business case yet."}`,
    dev: (i: z.infer<typeof ReportIn>) => dev.decisionReport(i.questions, i.idea, i.recommendation, i.evidence.map((e) => e.id)),
  },
  research_gaps: {
    input: GapsIn, output: ResearchGapsSchema, tokens: 3000,
    prompt: (i: z.infer<typeof GapsIn>) => `Research agent. You have no live web access in this call, so do NOT state findings. Instead, for the weakest-evidenced targets below, write 3–8 concrete research tasks: the question to answer, why it matters for the decision, and the cheapest credible method (who to ask, what to observe, which data to pull, which public source type to check). Prioritise targets with low confidence that the decision depends on. Use the given target kind and id.
Thought: ${wrap("thought", i.thought)}
Understanding: ${wrap("interpretation", i.interpretation ?? {})}
Targets with current evidence confidence (0–100): ${wrap("targets", i.targets)}`,
    dev: (i: z.infer<typeof GapsIn>) => dev.researchGaps(i.targets),
  },
  fin_assumptions: {
    input: FinIn, output: FinAssumptionsSchema, tokens: 2500,
    prompt: (i: z.infer<typeof FinIn>) => `Commercial agent. Suggest STARTING assumptions for a simple ${i.currency} business-case model of this concept. They are placeholders for the user to replace with real figures — keep them modest and say in each rationale what real data should replace it. Drivers (key: meaning): volumeY1: units/customers/transactions in year 1; volumeGrowth: % per year; price: average revenue per unit in ${i.currency}; priceGrowth: % per year; variableCostPct: % of revenue; fixedOpex: ${i.currency} per year; opexGrowth: % per year; capex: upfront ${i.currency}; savingsPerYear: ${i.currency} cost savings per year (only for efficiency/transformation concepts, else 0). Percentages as plain numbers (12 = 12%). Choose a unitLabel (e.g. orders, customers, cases). In caveat, state the biggest uncertainty. Do not compute NPV or any outputs.
Thought: ${wrap("thought", i.thought)}
Concept: ${wrap("concept", i.idea)}
${i.notes ? `User notes: ${wrap("notes", i.notes)}` : ""}`,
    dev: (i: z.infer<typeof FinIn>) => dev.finAssumptions(i.idea),
  },
} as const;
export type OpName = keyof typeof OPS;

export interface RunOutcome { data: unknown; mode: "live" | "dev"; model: string; tokens?: { input?: number; output?: number }; repaired?: boolean }

export async function runOp(op: OpName, rawInput: unknown): Promise<RunOutcome> {
  const def = OPS[op];
  const input = def.input.parse(rawInput);
  const provider = getProvider();
  if (!provider) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = def.output.parse((def.dev as any)(input));
    return { data, mode: "dev", model: "deterministic-dev-templates" };
  }
  const schema = z.toJSONSchema(def.output, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = (def.prompt as any)(input) as string;
  const tooLong = () => new Error(`The AI's ${op} output was too long and got cut off; nothing was changed. Try again, or simplify the blueprint or team note.`);
  const describe = (e: z.ZodError) => e.issues.slice(0, 8).map((x) => `${x.path.join(".") || "(root)"}: ${x.message}`).join("\n");
  let res = await provider.call({ system: SYSTEM, user, toolName: `submit_${op}`, schema, maxTokens: def.tokens });
  let parsed = def.output.safeParse(fitToSchema(res.json, schema));
  let repaired = false;
  if (!parsed.success) {
    repaired = true;
    const issues = describe(parsed.error);
    const hint = res.truncated ? "\nYour previous output was cut off at the length limit — be markedly more concise." : "";
    res = await provider.call({ system: SYSTEM, user: `${user}\n\nYour previous output failed validation:\n${issues}${hint}\nReturn a corrected, complete result.`, toolName: `submit_${op}`, schema, maxTokens: def.tokens });
    parsed = def.output.safeParse(fitToSchema(res.json, schema));
    if (!parsed.success) {
      if (res.truncated) throw tooLong();
      throw new Error(`AI output failed schema validation twice; nothing was changed. Details: ${describe(parsed.error).replace(/\n/g, "; ")}`);
    }
  }
  return { data: parsed.data, mode: "live", model: res.model, tokens: { input: res.inputTokens, output: res.outputTokens }, repaired };
}
