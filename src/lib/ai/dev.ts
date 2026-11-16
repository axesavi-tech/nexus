/**
 * DEVELOPMENT FALLBACK — deterministic, template-based generators used ONLY when no AI key is configured.
 * Output is clearly labelled "Dev mode" in the UI. It exists so the full workflow can be exercised and tested
 * offline; it is not presented as AI analysis.
 */
import type {
  Blueprint, Category, EvaluationResult, Idea, IdeasResult, Interpretation, Mode, NodeAction, NodePatch, Roadmap, Sliders,
} from "../schemas";
import { DIMENSIONS } from "../schemas";
import { byId } from "../frameworks";

export function detectCategory(t: string): Category {
  const s = t.toLowerCase();
  if (/\b(app|software|platform|saas|ai|api|website|digital)\b/.test(s)) return "software";
  if (/\b(process|onboarding|days|operating model|cycle time|reduce|efficien|workflow)\b/.test(s)) return "operational";
  if (/\b(chip|device|hardware|material|battery|umbrella|sensor|manufactur|prototype)\b/.test(s)) return "physical";
  if (/\b(brand|sell|d2c|business|startup|customers|market|revenue)\b/.test(s)) return "business";
  if (/\b(children|school|learn|teach|community|personal|my |habit|family)\b/.test(s)) return "personal";
  return "abstract";
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const core = (t: string) => clip(t.replace(/^(what if|how (can|do|might) (i|we)|i want to|our)\s+/i, "").replace(/[?.!]+$/, ""), 70);

export function analyze(thought: string, mode: Mode): Interpretation {
  const cat = detectCategory(thought);
  const c = core(thought);
  const raw = thought.trim().split(/\s+/).length < 12;
  return {
    title: clip(c.charAt(0).toUpperCase() + c.slice(1), 80),
    intention: `Explore and act on: “${clip(thought.trim(), 200)}”`,
    problemOrOpportunity: cat === "operational" ? `A current way of working is not delivering the outcome you want: ${c}.` : `There may be an unmet need or untapped opportunity behind: ${c}.`,
    domain: { business: "Commercial venture", software: "Digital product", operational: "Operations & process", physical: "Physical product / invention", personal: "Personal, education or community", abstract: "Open concept — domain not yet chosen" }[cat],
    category: cat,
    maturity: raw ? "raw" : "framed",
    beneficiaries: cat === "personal" ? ["The people directly involved", "Those who support them"] : ["Primary users (to be defined)", "Decision-makers who fund or approve it"],
    desiredOutcomes: ["A clearer definition of the problem worth solving", "A small set of genuinely different options", "A first step that can be tested quickly"],
    constraints: [{ text: "Budget, time and capacity not yet stated", kind: "implicit" }],
    assumptions: ["The stated problem is the one worth solving", "Intended users would change their behaviour for a better option"],
    missingInformation: ["Who exactly this is for", "What success looks like and by when", "What resources are available"],
    alternativeInterpretations: [
      { label: "Literal", description: `Take “${c}” at face value and look for direct solutions.` },
      { label: "Underlying need", description: "Treat it as a symptom of a deeper need that could be met in other ways." },
      { label: "Reframed", description: "Invert or widen the question — what would make this problem irrelevant?" },
    ],
    opportunityAreas: [
      { title: "Understand the people involved", description: "Map who is affected and what progress they are trying to make." },
      { title: "Remove the biggest friction", description: "Find the single constraint that, if removed, unlocks most value." },
      { title: "Try a different model", description: "Explore a delivery or business model unlike the obvious one." },
    ],
    clarifyingQuestions: mode === "free" ? [] : [
      { question: "Who is this primarily for?", why: "Changes which needs and options matter most." },
      { question: "What would a great outcome look like in 6 months?", why: "Sets the success criteria used to compare options." },
      { question: "What constraints are non-negotiable (budget, time, regulation)?", why: "Rules options in or out early." },
    ].slice(0, mode === "guided" ? 2 : 3),
  };
}

const ACTION_TEMPLATES: Record<NodeAction, { type: NodePatch["addNodes"][number]["type"]; t: string; d: string; claim: NodePatch["addNodes"][number]["claim"] }[]> = {
  expand: [
    { type: "idea", t: "Adjacent direction", d: "A related direction that serves the same need differently.", claim: "ai_inference" },
    { type: "opportunity", t: "Underserved group", d: "A group whose needs here may be ignored today.", claim: "unvalidated_hypothesis" },
    { type: "question", t: "What would make this 10× better?", d: "Pushes beyond incremental improvement.", claim: "ai_inference" },
  ],
  deeper: [
    { type: "problem", t: "Component: people", d: "Who is involved and what they need.", claim: "ai_inference" },
    { type: "problem", t: "Component: process", d: "The sequence of steps that produces the result.", claim: "ai_inference" },
    { type: "problem", t: "Component: tools & data", d: "The systems, information and materials used.", claim: "ai_inference" },
  ],
  challenge: [
    { type: "assumption", t: "Hidden assumption", d: "This relies on people wanting it enough to change behaviour.", claim: "working_assumption" },
    { type: "risk", t: "Failure condition", d: "It fails if adoption or cost turns out worse than expected.", claim: "ai_inference" },
    { type: "question", t: "Counter-argument", d: "Is there a simpler existing alternative that already solves this?", claim: "ai_inference" },
  ],
  different: [
    { type: "idea", t: "Invert it", d: "Do the opposite of the obvious approach and see what value appears.", claim: "ai_inference" },
    { type: "idea", t: "Let the user become the provider", d: "Flip roles so beneficiaries create the value.", claim: "ai_inference" },
    { type: "idea", t: "Remove the core element", d: "What if the central component did not exist at all?", claim: "ai_inference" },
  ],
  root_cause: [
    { type: "problem", t: "Why 1: immediate cause", d: "The most direct reason the symptom occurs.", claim: "unvalidated_hypothesis" },
    { type: "hypothesis", t: "Why 2: underlying cause", d: "What allows the immediate cause to persist.", claim: "unvalidated_hypothesis" },
    { type: "evidence", t: "Evidence needed", d: "Data or observation that would confirm the root cause.", claim: "research_interpretation" },
  ],
  connect: [{ type: "insight", t: "Possible connection", d: "This may share a cause or user with other branches.", claim: "ai_inference" }],
  evidence: [
    { type: "evidence", t: "Would support", d: "Observed demand, behaviour or measurements consistent with this.", claim: "research_interpretation" },
    { type: "evidence", t: "Would contradict", d: "Evidence that people already solve this adequately another way.", claim: "research_interpretation" },
  ],
  evaluate: [
    { type: "insight", t: "Desirability", d: "Unknown until tested with real users.", claim: "ai_inference" },
    { type: "insight", t: "Feasibility", d: "Depends on skills and resources available.", claim: "ai_inference" },
    { type: "insight", t: "Viability", d: "Depends on cost to deliver versus value created.", claim: "ai_inference" },
    { type: "risk", t: "Biggest risk", d: "Low adoption.", claim: "ai_inference" },
  ],
  to_solution: [
    { type: "solution", t: "Solution concept", d: "A minimal, testable version of this idea.", claim: "ai_inference" },
    { type: "dependency", t: "Needs: owner & time", d: "Someone accountable with dedicated capacity.", claim: "working_assumption" },
  ],
  to_action: [
    { type: "action", t: "Talk to 5 intended users", d: "Validate the problem before building.", claim: "ai_inference" },
    { type: "action", t: "Define success metric", d: "Agree the one measure that shows progress.", claim: "ai_inference" },
    { type: "action", t: "Run a 2-week pilot", d: "Test the smallest version with real people.", claim: "ai_inference" },
  ],
  missing: [
    { type: "stakeholder", t: "Neglected stakeholder", d: "Someone affected who has not been considered yet.", claim: "ai_inference" },
    { type: "risk", t: "Second-order effect", d: "A consequence that appears only at scale.", claim: "ai_inference" },
    { type: "idea", t: "Simpler alternative", d: "A low-effort option that might deliver most of the value.", claim: "ai_inference" },
  ],
  framework: [],
  custom: [{ type: "insight", t: "Response to instruction", d: "Dev mode cannot interpret free-text instructions; connect an AI key for this.", claim: "ai_inference" }],
};

export function nodeAction(action: NodeAction, focus: { id: string; title: string }, instruction?: string, frameworkId?: string): NodePatch {
  let items = ACTION_TEMPLATES[action];
  if (action === "framework") {
    const fw = frameworkId ? byId(frameworkId) : undefined;
    items = (fw?.outputs ?? ["Output"]).map((o) => ({ type: "insight" as const, t: `${fw?.name ?? "Framework"}: ${o}`, d: `Apply ${fw?.name} — ${fw?.prompt ?? ""}`.slice(0, 700), claim: "ai_inference" as const }));
  }
  const addNodes = items.map((x, i) => ({
    ref: `n${i + 1}`, type: x.type, title: x.t, description: x.d,
    parentRef: action === "root_cause" && i > 0 ? `n${i}` : focus.id,
    relation: (action === "to_action" && i > 0 ? "child" : "child") as "child", claim: x.claim,
  }));
  const links = action === "to_action" ? addNodes.slice(1).map((n, i) => ({ sourceRef: n.ref, targetRef: addNodes[i].ref, kind: "depends_on" as const, label: "after" })) : [];
  return { summary: `Dev mode template for “${action}” on “${clip(focus.title, 50)}”${instruction ? ` (instruction not interpreted: ${clip(instruction, 60)})` : ""}.`, addNodes, updateNodes: [], links };
}

export function ideate(thought: string, focus: { id: string; title: string }[], sliders: Sliders): IdeasResult {
  const c = core(thought);
  const origin = focus.slice(0, 3).map((f) => f.id);
  const mk = (id: string, tier: Idea["tier"], title: string, summary: string, how: string, diff: string): Idea => ({
    id, tier, title, summary, howItWorks: how, differentiator: diff, originNodeIds: origin,
    targetUsers: "The primary group identified in Discovery (to be validated)",
    valueProposition: `Helps them make progress on “${c}” with less effort or cost than today.`,
    keyAssumptions: ["Users experience this problem often enough to care", "The required capability can be sourced"],
    risks: ["Adoption is slower than expected"],
  });
  const ideas = [
    mk("I1", "conservative", `Improve the current approach to ${clip(c, 40)}`, "Remove the most painful step in today's approach without changing the overall model.", "Map today's journey, pick the worst friction point, fix it, measure.", "Fast and low risk."),
    mk("I2", "practical", `Focused offer for one underserved segment`, "Design a tailored version for a specific group whose needs are poorly met.", "Pick one segment, co-design with 5 people, pilot for 4 weeks.", "Depth for one segment rather than breadth."),
    mk("I3", "disruptive", `Flip the model`, "Change who creates and who receives value — e.g. users become contributors or providers.", "Introduce a peer or community mechanism and a light coordination layer.", "Changes the economics rather than the features."),
    mk("I4", "moonshot", `Make the problem disappear`, "Pursue a step-change that removes the need entirely, accepting high uncertainty.", "Research the fundamental constraint and fund a small exploratory prototype.", "Potentially transformative; long horizon."),
  ];
  return { ideas, notes: `Dev mode templates (creativity ${sliders.creativity}, risk tolerance ${sliders.riskTolerance}). Connect an AI key for context-specific ideas.` };
}

export function evaluate(ideas: Idea[]): EvaluationResult {
  const tierBase: Record<string, number[]> = {
    conservative: [55, 60, 80, 60, 35, 80, 45, 80],
    practical: [65, 65, 65, 60, 60, 60, 55, 65],
    disruptive: [60, 60, 45, 50, 80, 40, 70, 50],
    moonshot: [55, 55, 25, 35, 90, 15, 80, 35],
  };
  return {
    evaluations: ideas.map((idea) => ({
      ideaId: idea.id,
      scores: DIMENSIONS.map((d, i) => ({
        dimension: d.key,
        score: (tierBase[idea.tier] ?? tierBase.practical)[i],
        rationale: `Dev-mode heuristic based on the “${idea.tier}” tier only.`,
        evidence: "missing" as const,
        confidence: "low" as const,
        assumptions: ["Heuristic placeholder — not an assessment"],
        downside: "Not grounded in evidence",
      })),
      impact: { conservative: 2, practical: 3, disruptive: 4, moonshot: 5 }[idea.tier] ?? 3,
      riskLevel: { conservative: 1, practical: 2, disruptive: 4, moonshot: 5 }[idea.tier] ?? 3,
      costLevel: { conservative: 1, practical: 2, disruptive: 3, moonshot: 5 }[idea.tier] ?? 3,
    })),
    caveats: "Dev mode: scores are tier heuristics, not analysis. Every dimension lacks evidence.",
  };
}

export function blueprint(idea: Idea, interp: Interpretation | null): Blueprint {
  const cat = interp?.category ?? "abstract";
  return {
    ideaId: idea.id, category: cat,
    executiveSummary: `${idea.title}: ${idea.summary}`,
    problemAndOutcome: `${interp?.problemOrOpportunity ?? "Problem to be confirmed."} Desired outcome: ${interp?.desiredOutcomes?.[0] ?? "to be defined"}.`,
    solutionConcept: idea.howItWorks,
    usersAndStakeholders: [{ name: idea.targetUsers, need: idea.valueProposition }],
    functionalDesign: [
      { component: "Core experience", description: "The minimum set of steps that delivers the value proposition." },
      { component: "Feedback loop", description: "How results are captured and used to improve." },
    ],
    operatingModel: "A small accountable team runs a pilot, reviews weekly, and decides whether to scale.",
    dependencies: ["An accountable owner", "Access to intended users for testing"],
    constraints: (interp?.constraints ?? []).map((c) => c.text).slice(0, 5),
    risks: idea.risks.map((r) => ({ risk: r, likelihood: "medium" as const, impact: "medium" as const, mitigation: "Test early with a small pilot and clear stop criteria." })),
    costBenefitAssumptions: [{ item: "Pilot cost", assumption: "Low; mostly people time", claim: "working_assumption" }],
    alternativesRejected: [{ option: "Do nothing", reason: "Leaves the underlying problem unaddressed." }],
    validationApproach: idea.keyAssumptions.slice(0, 2).map((a) => ({ hypothesis: a, experiment: "Interviews or a small pilot with 5-10 intended users", successMetric: "Share of participants who would use it again", threshold: "Set before testing (e.g. ≥ 60%)" })),
    measuresOfSuccess: [{ metric: "Active participants", target: "Defined after pilot", kind: "leading" }, { metric: "Outcome improvement vs baseline", target: "Baseline to be measured", kind: "lagging" }],
    categorySections: [{ heading: "Dev mode", items: ["Category-specific sections are generated when an AI key is configured."] }],
  };
}

export function roadmap(bp: Blueprint, approach: Roadmap["approach"]): Roadmap {
  const role = approach === "personal" ? "You" : "Product owner";
  return {
    approach,
    planningAssumptions: ["One accountable owner with ~50% capacity", "Estimates are rough planning figures, not commitments", "Start date is the date you generate the plan"],
    mvpDefinition: `Smallest version of “${clip(bp.executiveSummary, 120)}” that can be tested with real users.`,
    phases: [
      { id: "P1", name: "Validate", goal: "Confirm the problem and riskiest assumptions", milestones: [{ id: "M1", title: "Problem validated", exitCriteria: "Evidence from ≥5 intended users" }] },
      { id: "P2", name: "Pilot", goal: "Deliver and test the MVP", milestones: [{ id: "M2", title: "MVP live with pilot group", exitCriteria: "Pilot running with success metric tracked" }] },
      { id: "P3", name: "Decide & scale", goal: "Decide whether to scale, iterate or stop", milestones: [{ id: "M3", title: "Scale decision", exitCriteria: "Decision recorded against thresholds" }] },
    ],
    tasks: [
      { id: "T1", title: "Interview intended users", description: "Validate problem and needs.", milestoneId: "M1", dependsOn: [], priority: "critical", acceptanceCriteria: ["5 interviews summarised"], role, estimateDays: 5 },
      { id: "T2", title: "Define success metric & thresholds", description: "Agree what success means.", milestoneId: "M1", dependsOn: ["T1"], priority: "high", acceptanceCriteria: ["Metric and threshold written down"], role, estimateDays: 1 },
      { id: "T3", title: "Build MVP", description: "Smallest testable version.", milestoneId: "M2", dependsOn: ["T2"], priority: "high", acceptanceCriteria: ["Usable by pilot group"], role, estimateDays: 10 },
      { id: "T4", title: "Run pilot", description: "Operate with the pilot group and collect data.", milestoneId: "M2", dependsOn: ["T3"], priority: "high", acceptanceCriteria: ["Data collected for full pilot period"], role, estimateDays: 14 },
      { id: "T5", title: "Review results & decide", description: "Compare against thresholds.", milestoneId: "M3", dependsOn: ["T4"], priority: "medium", acceptanceCriteria: ["Decision record completed"], role, estimateDays: 2 },
    ],
    raci: [{ activity: "Pilot delivery", responsible: role, accountable: approach === "personal" ? "You" : "Sponsor", consulted: ["Intended users"], informed: ["Stakeholders"] }],
    risks: [{ risk: "Pilot participants hard to recruit", owner: role, mitigation: "Recruit before building" }],
    kpis: [{ name: "Pilot engagement", target: "Set in T2", measure: "Share of participants active weekly" }],
    goLiveCriteria: ["Success threshold met in pilot", "Owner and support in place"],
  };
}
