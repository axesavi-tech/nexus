/**
 * DEVELOPMENT FALLBACK — deterministic, template-based generators used ONLY when no AI key is configured.
 * Output is clearly labelled "Dev mode" in the UI. It exists so the full workflow can be exercised and tested
 * offline; it is not presented as AI analysis.
 */
import type {
  Blueprint, Category, ClusterResult, Empathy, EvaluationResult, Idea, IdeasResult, Interpretation, Mode, NodeAction, NodePatch, NodeType,
  Roadmap, Sliders, SparksResult, Technique, TestPlan, ClaimType, GatesResult, FinDriver,
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

const ACTION_TEMPLATES: Record<Exclude<NodeAction, "structure">, { type: NodePatch["addNodes"][number]["type"]; t: string; d: string; claim: NodePatch["addNodes"][number]["claim"] }[]> = {
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
  if (action === "structure") return structureDump(focus, instruction ?? "");
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

// ---------------- Brain dump → typed nodes (keyword heuristics) ----------------
const DUMP_RULES: [RegExp, NodeType, ClaimType][] = [
  [/\b(what if|maybe|could we|idea|we could|imagine|try)\b/i, "idea", "unvalidated_hypothesis"],
  [/\?\s*$|^(why|how|what|who|when|where|which|should|could|can|is|are|do|does)\b/i, "question", "user_fact"],
  [/\b(risk|danger|might fail|could fail|worr|threat|fear)/i, "risk", "working_assumption"],
  [/\b(assum|i think|i believe|probably|presumably|i guess|surely)/i, "assumption", "working_assumption"],
  [/\b(must|can't|cannot|budget|deadline|only|limited|no more than|constraint|regulat)/i, "constraint", "user_fact"],
  [/\b(customer|user|team|manager|client|parent|student|staff|people|stakeholder)s?\b.*\b(want|need|hate|love|complain|struggle)/i, "insight", "user_fact"],
  [/\b(problem|issue|pain|slow|broken|frustrat|hard to|difficult|too long|takes \d+)/i, "problem", "user_fact"],
  [/\b(data|survey|saw|noticed|measured|found that|research|interview)/i, "evidence", "user_fact"],
  [/\b(opportunit|untapped|gap|nobody|no one)/i, "opportunity", "working_assumption"],
  [/^(call|email|ask|book|draft|send|check|schedule|build|write|meet|talk)\b/i, "action", "user_fact"],
];
export function classifyLine(line: string): { type: NodeType; claim: ClaimType } {
  for (const [re, type, claim] of DUMP_RULES) if (re.test(line)) return { type, claim };
  return { type: "insight", claim: "user_fact" };
}
export function splitDump(text: string): string[] {
  return text.split(/\n+|(?<=[.!?])\s+(?=[A-Z])/).map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim()).filter((l) => l.length > 2);
}
function structureDump(focus: { id: string; title: string }, text: string): NodePatch {
  const lines = splitDump(text);
  const kept = lines.slice(0, 12);
  const addNodes = kept.map((line, i) => {
    const { type, claim } = classifyLine(line);
    return { ref: `d${i + 1}`, type, title: clip(line, 80), description: line.length > 80 ? line : "", parentRef: focus.id, relation: "child" as const, claim };
  });
  return {
    summary: `Dev template: sorted ${kept.length} point${kept.length === 1 ? "" : "s"} from your brain dump by keyword rules${lines.length > 12 ? ` (${lines.length - 12} more left out — paste them in a second dump)` : ""}. Connect an AI key for real understanding and grouping.`,
    addNodes, updateNodes: [], links: [],
  };
}

// ---------------- Design thinking ----------------
export function empathize(thought: string, stakeholders: { title: string }[], hasNotes: boolean): Empathy {
  const c = core(thought);
  const names = ["Asha", "Ravi"];
  const roles = stakeholders.length ? stakeholders.slice(0, 2).map((s) => clip(s.title, 100)) : ["Primary user", "Person who decides or pays"];
  const personas = roles.map((role, i) => ({
    id: `P${i + 1}`, name: names[i], role, basis: (hasNotes ? "user_research" : "proto_persona") as "user_research" | "proto_persona",
    context: `Someone directly affected by “${clip(c, 80)}”. Template persona — replace with what you learn from real people.`,
    quote: i === 0 ? "I just want this to work without me having to think about it." : "Show me it's worth the time and money.",
    goals: ["Make progress with less effort", "Feel confident in the outcome"],
    pains: ["Too many steps today", "Unclear what to do next"],
    gains: ["Saves time", "Feels in control"],
    empathy: {
      says: ["“There has to be an easier way.”"], thinks: ["Is this worth changing how I do things?"],
      does: ["Uses workarounds and asks others for help"], feels: ["Frustrated at the slow parts", "Hopeful when something works"],
    },
    journey: [
      { stage: "Notice the need", action: "Realises something isn't working", emotion: -1, pain: "Unsure where to start", opportunity: "A clear first step" },
      { stage: "Look for options", action: "Searches and asks around", emotion: -2, pain: "Too much conflicting advice", opportunity: "A trusted, simple recommendation" },
      { stage: "Try something", action: "Commits to an approach", emotion: 0, pain: "Effort before any result", opportunity: "An early visible win" },
      { stage: "Get the result", action: "Sees whether it worked", emotion: 1, pain: "No way to tell what made the difference", opportunity: "Show progress and next steps" },
    ],
  }));
  return {
    personas,
    insights: [
      { id: "IN1", text: "People tolerate the current pain because switching feels riskier than staying.", personaId: "P1", claim: "unvalidated_hypothesis" },
      { id: "IN2", text: "The decision-maker and the person who feels the pain are often different people.", personaId: "P2", claim: "unvalidated_hypothesis" },
    ],
    povs: [
      { id: "POV1", personaId: "P1", user: `${personas[0].name}, ${personas[0].role}`, need: "to make progress without extra effort", insight: "switching feels riskier than living with the pain" },
      ...(personas[1] ? [{ id: "POV2", personaId: "P2", user: `${personas[1].name}, ${personas[1].role}`, need: "to see value before committing", insight: "they carry the cost but not the daily pain" }] : []),
    ],
    hmws: [
      { id: "H1", question: "How might we make the first step feel effortless?", povId: "POV1", angle: "remove_bad" },
      { id: "H2", question: "How might we turn the moment it works into something worth sharing?", povId: "POV1", angle: "amplify_good" },
      { id: "H3", question: "How might we make switching feel safer than staying?", povId: "POV1", angle: "question_assumption" },
      { id: "H4", question: "How might we let people try it before they commit?", povId: personas[1] ? "POV2" : "POV1", angle: "change_status_quo" },
      { id: "H5", question: "How might we remove the need to choose at all?", povId: "POV1", angle: "explore_opposite" },
      { id: "H6", question: `How might we solve “${clip(c, 50)}” the way a great host welcomes a guest?`, povId: "POV1", angle: "analogy" },
    ],
    researchGaps: ["Interview 5 people who live with this problem today", "Observe the current process end-to-end and note every workaround", "Ask the person who pays what would make it a clear yes"],
  };
}

const SPARK_BANK: Record<Technique, [string, string, string][]> = {
  brainstorm: [["One-tap start", "Reduce the very first step to a single action.", "simplify"], ["Buddy system", "Pair newcomers with someone who has done it before.", "social"], ["Progress you can see", "Show a visible progress bar so people know how far they are.", "feedback"], ["Do it for them", "Offer a done-for-you option for the hardest part.", "service"], ["Weekly ritual", "Turn it into a short, regular habit with a reminder.", "habit"], ["Celebrate the win", "Mark the moment it works with a small celebration.", "emotion"], ["Ask the crowd", "Let past users answer newcomers' questions.", "community"], ["Wild: make it a game show", "Run it as a live, timed challenge with prizes.", "wild"]],
  scamper: [["Substitute the expert", "Replace the expert step with a guided checklist.", "Substitute"], ["Combine two steps", "Merge the two slowest steps into one.", "Combine"], ["Adapt from retail", "Borrow the 'try before you buy' pattern.", "Adapt"], ["Magnify the best moment", "Make the most satisfying step bigger and earlier.", "Modify"], ["Put it to another use", "Reuse what people already produce as an input.", "Put to other use"], ["Eliminate the form", "Remove data entry by pre-filling from what's known.", "Eliminate"], ["Reverse the order", "Deliver the result first, collect details after.", "Reverse"]],
  analogy: [["Triage like an ER", "Sort cases by urgency at the door so the critical ones move first.", "Emergency medicine"], ["Levels like a game", "Unlock the next step only when the current one is mastered.", "Gaming"], ["Pre-flight checklist", "A short shared checklist before anything starts.", "Aviation"], ["Concierge welcome", "A named person greets and guides every newcomer.", "Hospitality"], ["Swarm like ants", "Many small contributors each do one tiny part.", "Biology"], ["Track like a parcel", "Show live status at every hand-off.", "Logistics"]],
  reverse: [["Make every step obvious", "Flip of: hide the next step. Always show exactly what happens next.", "flipped"], ["One place for everything", "Flip of: scatter information across tools. Keep it in one place.", "flipped"], ["Answer before they ask", "Flip of: make people chase answers. Push answers proactively.", "flipped"], ["Reward finishing", "Flip of: punish mistakes. Reward completion instead.", "flipped"], ["Remove waiting", "Flip of: add approvals. Pre-approve the common cases.", "flipped"], ["Speak their language", "Flip of: use jargon. Use the words users already use.", "flipped"]],
  constraints: [["Zero-budget version", "Do it with a shared document and a weekly call.", "zero budget"], ["Ship it tomorrow", "What could run by hand from tomorrow morning?", "one day"], ["100× the users", "Self-serve templates instead of human help.", "100× scale"], ["No technology allowed", "A paper kit and a phone number.", "no tech"], ["Only volunteers", "A peer network of people who've succeeded.", "volunteers"], ["Must be fun", "Turn the hardest step into a short challenge.", "must be fun"]],
  crazy8: Array.from({ length: 8 }, (_, i) => [`Variation ${i + 1}`, ["Smaller and faster", "Done by the user", "Done for the user", "Shared with friends", "Invisible and automatic", "Physical object", "Subscription", "Event-based"][i], `variation ${i + 1}`] as [string, string, string]),
  persona: [["Fix the lowest moment", "Target the most negative stage of the journey directly.", "journey low point"], ["Their words, not ours", "Rewrite everything in the language they use.", "language"], ["Remove their top pain", "Design only for the biggest stated pain.", "top pain"], ["Win over the payer", "Give the decision-maker proof in the first week.", "decision-maker"], ["Make them the hero", "Let the user show off the result.", "status"], ["Help their helper", "Equip the person they already ask for help.", "helper"]],
  mashup: [["As a subscription", "A monthly bundle that keeps the result going.", "subscription"], ["As a community", "Members meet and help each other.", "community"], ["Gamified", "Points and streaks for each step.", "gamification"], ["With an AI agent", "An assistant that does the boring parts.", "AI agent"], ["As a marketplace", "Connect people who need it with people who can do it.", "marketplace"], ["As a live event", "A one-day sprint where everyone finishes together.", "live event"]],
  build: [["…and make it social", "Extend the seed so friends can join in.", "extend"], ["…combined with a guarantee", "Pair the seed with a money-back promise.", "combine"], ["…at ten times the scale", "What would the seed look like for a whole city?", "scale"], ["…in its simplest form", "The seed reduced to one step.", "simplify"], ["…for a different group", "The seed redesigned for an overlooked group.", "remix"]],
};
export function sparks(technique: Technique, hmw: string, count: number, seedTitle?: string, personas: string[] = []): SparksResult {
  const bank = SPARK_BANK[technique];
  const out = bank.slice(0, Math.max(3, Math.min(count, bank.length))).map(([title, description, lens]) => ({
    title: technique === "build" && seedTitle ? clip(`${clip(seedTitle, 40)} ${title}`, 100) : title,
    description: technique === "persona" && personas[0] ? `${description} (for ${personas[0]})` : description,
    lens,
  }));
  return { sparks: out.map((s) => ({ ...s, description: clip(`${s.description} — towards: ${hmw.replace(/^how might we\s*/i, "")}`, 300) })) };
}

const THEMES: [string, RegExp][] = [
  ["Make it effortless", /simpl|\bone\b|one-tap|single|remove|eliminate|automatic|invisible|pre-?fill|done.for|checklist|merge|combine/i],
  ["People helping people", /buddy|crowd|community|peer|volunteer|friend|social|helper|concierge|host/i],
  ["Show progress & reward", /progress|celebrat|reward|game|level|streak|point|track|status|win/i],
  ["New business models", /subscription|marketplace|bundle|guarantee|event|scale|payer/i],
];
export function cluster(list: { id: string; title: string; description: string }[]): ClusterResult {
  const groups = new Map<string, string[]>();
  for (const s of list) {
    const text = `${s.title} ${s.description.split(" — towards:")[0]}`;
    const theme = THEMES.find(([, re]) => re.test(text))?.[0] ?? "Other directions";
    groups.set(theme, [...(groups.get(theme) ?? []), s.id]);
  }
  return {
    clusters: [...groups.entries()].map(([name, sparkIds]) => ({ name, theme: `Dev template grouping by keywords: ${name.toLowerCase()}.`, sparkIds })).slice(0, 7),
    whitespace: ["Ideas that change who pays", "Ideas that work with no technology at all"],
  };
}

export function conceptsFromSparks(list: { title: string; description: string }[]): IdeasResult {
  const tiers: Idea["tier"][] = ["practical", "conservative", "disruptive", "moonshot"];
  const ideas = list.slice(0, 4).map((s, i) => ({
    id: `I${i + 1}`, tier: tiers[i % 4], title: clip(s.title, 120), summary: clip(s.description, 600),
    targetUsers: "The personas from Empathize (to be validated)",
    valueProposition: `Delivers on “${clip(s.title, 60)}” for the people who feel the problem most.`,
    howItWorks: clip(s.description, 800), differentiator: "Comes straight from a voted spark rather than the obvious solution.",
    keyAssumptions: ["People will change their behaviour for this", "It can be delivered at an acceptable cost"],
    risks: ["Adoption is slower than expected"], originNodeIds: [],
  }));
  while (ideas.length < 2) ideas.push({ ...ideas[0], id: `I${ideas.length + 1}`, title: "Simplest version of the top spark", tier: "conservative" });
  return { ideas, notes: "Dev templates: each voted spark became one concept without merging. Connect an AI key for real convergence." };
}

export function testplan(idea: Partial<Idea>): TestPlan {
  const t = clip(idea.title ?? "the concept", 60);
  return {
    assumptions: [
      { id: "A1", statement: `The target users feel this problem often enough to try “${t}”.`, lens: "desirability", importance: 5, evidence: 1 },
      { id: "A2", statement: "They prefer it to their current workaround.", lens: "desirability", importance: 4, evidence: 2 },
      { id: "A3", statement: "We can deliver the core experience with the skills and tools available.", lens: "feasibility", importance: 4, evidence: 3 },
      { id: "A4", statement: "Someone will pay enough (or fund it) to cover the cost of delivery.", lens: "viability", importance: 5, evidence: 1 },
      { id: "A5", statement: "Users can understand it without explanation.", lens: "desirability", importance: 2, evidence: 2 },
    ],
    tests: [
      { assumptionId: "A1", prototype: "storyboard", description: "Show a 4-frame storyboard to 5 target users and ask them to describe the last time they had this problem.", metric: "Users who describe a recent, specific occurrence", successCriteria: "≥ 4 of 5", effortDays: 2, cost: "low" },
      { assumptionId: "A4", prototype: "fake_door", description: "Put a simple offer with a price on a page and measure sign-ups for early access.", metric: "Visitor → sign-up conversion", successCriteria: "≥ 5% of 100 visitors", effortDays: 3, cost: "low" },
      { assumptionId: "A2", prototype: "concierge", description: "Deliver the service by hand to 3 people for one week; compare with their workaround.", metric: "Would they be disappointed if it stopped?", successCriteria: "2 of 3 say 'very disappointed'", effortDays: 5, cost: "medium" },
    ],
    storyboard: [
      { frame: "The struggle", caption: "Our user hits the problem at the worst moment." },
      { frame: "The discovery", caption: `They find “${t}” through someone they trust.` },
      { frame: "The first win", caption: "In minutes they get a visible result." },
      { frame: "The new normal", caption: "It becomes part of their routine and they tell a friend." },
    ],
  };
}

// ---------------- Idea → Outcome OS ----------------
export function gates(ideas: { id: string; title?: string }[]): GatesResult {
  const keys = ["legal", "regulatory", "security", "privacy", "safety", "ethical"] as const;
  return {
    assessments: ideas.slice(0, 8).flatMap((i) => keys.map((g) => ({
      ideaId: i.id, gate: g,
      status: (g === "privacy" ? "conditional" : "pass") as "pass" | "conditional",
      note: g === "privacy" ? "Dev template: any customer data collected needs consent and a retention rule." : `Dev template: no ${g} exposure identified by keyword rules — a human must assess this properly.`,
    }))),
  };
}
export function decisionReport(questions: string[], idea: { title?: string } | null, rec: { status?: string; reasons?: string[] } | null, evidenceIds: string[]) {
  const t = idea?.title ?? "this concept";
  return {
    answers: questions.map((q, n) => ({
      q,
      a: n === 0 ? `Dev template: “${t}” is currently recommended as ${rec?.status ?? "—"}. ${(rec?.reasons ?? []).join(" ")}`
        : n === 4 ? (evidenceIds.length ? `Dev template: ${evidenceIds.length} registered evidence item(s) are linked.` : "No registered evidence yet — the case rests on assumptions.")
        : `Dev template answer to “${q}”. Connect an AI key for a real synthesis.`,
      evidenceIds: n === 4 ? evidenceIds.slice(0, 4) : [],
    })),
  };
}
export function researchGaps(targets: { kind: "problem" | "concept" | "assumption"; id: string; statement: string; confidence: number }[]) {
  return {
    tasks: [...targets].sort((a, b) => a.confidence - b.confidence).slice(0, 4).map((t) => ({
      question: clip(`Is it true that ${t.statement.replace(/\.$/, "")}?`, 200),
      why: `Evidence confidence is ${t.confidence}/100 and the decision depends on it.`,
      method: t.kind === "problem" ? "Interview 5 affected people about the last time this happened" : t.kind === "concept" ? "Show a storyboard to 5 target users; measure intent" : "Find one data point or run one cheap test",
      targetKind: t.kind, targetId: t.id,
    })),
  };
}
export function finAssumptions(idea: { title?: string } | null) {
  const d: [FinDriver, number, string][] = [
    ["volumeY1", 1200, "Dev placeholder — replace with your current order volume or a pilot result."],
    ["volumeGrowth", 30, "Dev placeholder growth rate."],
    ["price", 8500, "Dev placeholder average order value."],
    ["priceGrowth", 3, "Dev placeholder."],
    ["variableCostPct", 55, "Dev placeholder for product, shipping and payment costs."],
    ["fixedOpex", 1800000, "Dev placeholder for team and tools."],
    ["opexGrowth", 8, "Dev placeholder."],
    ["capex", 1500000, "Dev placeholder build cost."],
    ["savingsPerYear", 0, "Not an efficiency concept."],
  ];
  return { unitLabel: "orders", drivers: d.map(([key, value, rationale]) => ({ key, value, rationale })), caveat: `Dev templates for “${clip(idea?.title ?? "concept", 60)}” — every number is a placeholder, not an estimate.` };
}
