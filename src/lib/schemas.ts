/**
 * NEXUS — shared domain types and structured AI output schemas.
 * Every AI response is validated against these schemas before it can touch the graph or be stored.
 */
import { z } from "zod";

export const NODE_TYPES = [
  "thought", "question", "problem", "insight", "opportunity", "idea", "hypothesis",
  "assumption", "evidence", "constraint", "stakeholder", "solution", "decision",
  "risk", "experiment", "dependency", "action", "milestone", "outcome",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const CLAIM_TYPES = [
  "user_fact", "verified_external", "research_interpretation", "ai_inference",
  "working_assumption", "unvalidated_hypothesis", "forecast",
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const EDGE_KINDS = ["child", "crosslink", "supports", "contradicts", "depends_on", "derived_from", "implements"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const CATEGORIES = ["business", "software", "operational", "physical", "personal", "abstract"] as const;
export type Category = (typeof CATEGORIES)[number];

export const MODES = ["free", "guided", "strategic"] as const;
export type Mode = (typeof MODES)[number];

export const NODE_ACTIONS = [
  "expand", "deeper", "challenge", "different", "root_cause", "connect",
  "evidence", "evaluate", "to_solution", "to_action", "missing", "framework", "custom",
] as const;
export type NodeAction = (typeof NODE_ACTIONS)[number];

// ---------- Graph ----------
export interface Provenance {
  source: "user" | "ai" | "dev" | "system";
  op?: string;
  runId?: string;
  at: string;
  claim?: ClaimType;
}
export interface NNode {
  id: string;
  type: NodeType;
  title: string;
  description: string;
  status: string;
  tags: string[];
  parentId: string | null;
  x: number;
  y: number;
  collapsed?: boolean;
  owner?: string;
  confidence?: "low" | "medium" | "high";
  provenance: Provenance;
  createdAt: string;
  updatedAt: string;
}
export interface NEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
}

// ---------- AI: thought interpretation ----------
const short = z.string().min(1).max(600);
export const InterpretationSchema = z.object({
  title: z.string().min(1).max(80),
  intention: short,
  problemOrOpportunity: short,
  domain: z.string().min(1).max(120),
  category: z.enum(CATEGORIES),
  maturity: z.enum(["raw", "framed", "defined"]),
  beneficiaries: z.array(z.string().max(200)).max(8),
  desiredOutcomes: z.array(z.string().max(300)).max(8),
  constraints: z.array(z.object({ text: z.string().max(300), kind: z.enum(["explicit", "implicit"]) })).max(10),
  assumptions: z.array(z.string().max(300)).max(10),
  missingInformation: z.array(z.string().max(300)).max(8),
  alternativeInterpretations: z.array(z.object({ label: z.string().max(80), description: z.string().max(400) })).min(1).max(5),
  opportunityAreas: z.array(z.object({ title: z.string().max(100), description: z.string().max(400) })).min(2).max(6),
  clarifyingQuestions: z.array(z.object({ question: z.string().max(300), why: z.string().max(300) })).max(3),
});
export type Interpretation = z.infer<typeof InterpretationSchema>;

// ---------- AI: graph patch (node actions + commands) ----------
export const NodePatchSchema = z.object({
  summary: z.string().max(600),
  addNodes: z.array(z.object({
    ref: z.string().min(1).max(40),
    type: z.enum(NODE_TYPES),
    title: z.string().min(1).max(140),
    description: z.string().max(800),
    parentRef: z.string().min(1).max(60),
    relation: z.enum(EDGE_KINDS),
    claim: z.enum(CLAIM_TYPES),
  })).max(12),
  updateNodes: z.array(z.object({
    id: z.string(),
    description: z.string().max(800).optional(),
    status: z.string().max(40).optional(),
  })).max(6),
  links: z.array(z.object({
    sourceRef: z.string(), targetRef: z.string(), kind: z.enum(EDGE_KINDS), label: z.string().max(60).optional(),
  })).max(8),
});
export type NodePatch = z.infer<typeof NodePatchSchema>;

// ---------- AI: ideation ----------
export const TIERS = ["conservative", "practical", "disruptive", "moonshot"] as const;
export const IdeaSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().min(1).max(120),
  tier: z.enum(TIERS),
  summary: z.string().max(600),
  targetUsers: z.string().max(300),
  valueProposition: z.string().max(400),
  howItWorks: z.string().max(800),
  differentiator: z.string().max(300),
  keyAssumptions: z.array(z.string().max(300)).max(6),
  risks: z.array(z.string().max(300)).max(6),
  originNodeIds: z.array(z.string()).max(10),
});
export type Idea = z.infer<typeof IdeaSchema>;
export const IdeasSchema = z.object({ ideas: z.array(IdeaSchema).min(2).max(8), notes: z.string().max(600) });
export type IdeasResult = z.infer<typeof IdeasSchema>;

// ---------- AI: evaluation ----------
export const DIMENSIONS = [
  { key: "desirability", label: "User desirability", weight: 20 },
  { key: "fit", label: "Strategic / problem fit", weight: 15 },
  { key: "feasibility", label: "Feasibility", weight: 15 },
  { key: "viability", label: "Economic viability", weight: 15 },
  { key: "differentiation", label: "Differentiation", weight: 10 },
  { key: "timeToValue", label: "Time-to-value", weight: 10 },
  { key: "scalability", label: "Scalability", weight: 10 },
  { key: "risk", label: "Risk & compliance (higher = safer)", weight: 5 },
] as const;
export type DimensionKey = (typeof DIMENSIONS)[number]["key"];

export const DimensionScoreSchema = z.object({
  dimension: z.string(),
  score: z.number().min(0).max(100).nullable(),
  rationale: z.string().max(500),
  evidence: z.enum(["user_provided", "supported", "missing"]),
  confidence: z.enum(["low", "medium", "high"]),
  assumptions: z.array(z.string().max(300)).max(4),
  downside: z.string().max(300),
});
export type DimensionScore = z.infer<typeof DimensionScoreSchema>;
export const EvaluationSchema = z.object({
  evaluations: z.array(z.object({
    ideaId: z.string(),
    scores: z.array(DimensionScoreSchema).min(1).max(12),
    impact: z.number().int().min(1).max(5),
    riskLevel: z.number().int().min(1).max(5),
    costLevel: z.number().int().min(1).max(5),
  })).min(1).max(8),
  caveats: z.string().max(800),
});
export type EvaluationResult = z.infer<typeof EvaluationSchema>;

// ---------- AI: solution blueprint ----------
export const BlueprintSchema = z.object({
  ideaId: z.string(),
  category: z.enum(CATEGORIES),
  executiveSummary: z.string().max(1200),
  problemAndOutcome: z.string().max(800),
  solutionConcept: z.string().max(1200),
  usersAndStakeholders: z.array(z.object({ name: z.string().max(100), need: z.string().max(300) })).max(8),
  functionalDesign: z.array(z.object({ component: z.string().max(100), description: z.string().max(500) })).max(10),
  operatingModel: z.string().max(1000),
  dependencies: z.array(z.string().max(300)).max(10),
  constraints: z.array(z.string().max(300)).max(10),
  risks: z.array(z.object({
    risk: z.string().max(300), likelihood: z.enum(["low", "medium", "high"]),
    impact: z.enum(["low", "medium", "high"]), mitigation: z.string().max(300),
  })).max(10),
  costBenefitAssumptions: z.array(z.object({ item: z.string().max(200), assumption: z.string().max(300), claim: z.enum(CLAIM_TYPES) })).max(10),
  alternativesRejected: z.array(z.object({ option: z.string().max(200), reason: z.string().max(300) })).max(6),
  validationApproach: z.array(z.object({
    hypothesis: z.string().max(300), experiment: z.string().max(400),
    successMetric: z.string().max(200), threshold: z.string().max(200),
  })).max(6),
  measuresOfSuccess: z.array(z.object({ metric: z.string().max(150), target: z.string().max(150), kind: z.enum(["leading", "lagging"]) })).max(8),
  categorySections: z.array(z.object({ heading: z.string().max(100), items: z.array(z.string().max(400)).max(10) })).max(8),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;

// ---------- AI: implementation roadmap ----------
export const APPROACHES = ["agile", "waterfall", "hybrid", "personal"] as const;
export type Approach = (typeof APPROACHES)[number];
export const RoadmapSchema = z.object({
  approach: z.enum(APPROACHES),
  planningAssumptions: z.array(z.string().max(300)).min(1).max(8),
  mvpDefinition: z.string().max(800),
  phases: z.array(z.object({
    id: z.string().max(20), name: z.string().max(100), goal: z.string().max(300),
    milestones: z.array(z.object({ id: z.string().max(20), title: z.string().max(150), exitCriteria: z.string().max(300) })).min(1).max(5),
  })).min(1).max(6),
  tasks: z.array(z.object({
    id: z.string().max(20), title: z.string().max(150), description: z.string().max(400),
    milestoneId: z.string().max(20), dependsOn: z.array(z.string().max(20)).max(5),
    priority: z.enum(["low", "medium", "high", "critical"]),
    acceptanceCriteria: z.array(z.string().max(200)).max(4),
    role: z.string().max(80), estimateDays: z.number().min(0.5).max(120),
  })).min(3).max(30),
  raci: z.array(z.object({
    activity: z.string().max(150), responsible: z.string().max(80), accountable: z.string().max(80),
    consulted: z.array(z.string().max(80)).max(4), informed: z.array(z.string().max(80)).max(4),
  })).max(10),
  risks: z.array(z.object({ risk: z.string().max(300), owner: z.string().max(80), mitigation: z.string().max(300) })).max(10),
  kpis: z.array(z.object({ name: z.string().max(120), target: z.string().max(120), measure: z.string().max(200) })).max(8),
  goLiveCriteria: z.array(z.string().max(200)).max(8),
});
export type Roadmap = z.infer<typeof RoadmapSchema>;

// ---------- Tasks (execution) ----------
export interface Task {
  id: string;
  title: string;
  description: string;
  assignee?: string;
  dueDate?: string | null;
  priority: "low" | "medium" | "high" | "critical";
  status: "todo" | "doing" | "blocked" | "done";
  dependsOn: string[];
  acceptanceCriteria: string[];
  evidenceOfCompletion?: string;
  milestoneId?: string;
  relatedNodeId?: string;
}

// ---------- Creativity controls ----------
export const SLIDERS = [
  "creativity", "practicality", "commercialFocus", "costSensitivity",
  "technicalAmbition", "timeToMarket", "sustainability", "riskTolerance",
] as const;
export type SliderKey = (typeof SLIDERS)[number];
export type Sliders = Record<SliderKey, number>;
export const DEFAULT_SLIDERS: Sliders = {
  creativity: 60, practicality: 60, commercialFocus: 50, costSensitivity: 50,
  technicalAmbition: 50, timeToMarket: 50, sustainability: 40, riskTolerance: 50,
};

// ---------- Project aggregate ----------
export interface ProjectState {
  id: string;
  title: string;
  thought: string;
  mode: Mode;
  stage: string;
  interpretation: Interpretation | null;
  answers: Record<string, string>;
  nodes: NNode[];
  edges: NEdge[];
  ideas: IdeasResult | null;
  sliders: Sliders;
  generatedWith?: Sliders;
  weights: Record<string, number>;
  evaluation: EvaluationResult | null;
  selectedIdeaId: string | null;
  decision: DecisionRecord | null;
  blueprint: Blueprint | null;
  roadmap: Roadmap | null;
  tasks: Task[];
  frameworks: string[];
  aiMode?: "live" | "dev";
  createdAt: string;
  updatedAt: string;
}

export interface DecisionRecord {
  question: string;
  optionsConsidered: string[];
  criteria: Record<string, number>;
  chosenOption: string;
  rationale: string;
  decisionMaker: string;
  date: string;
  reconsiderIf: string;
  risks: string;
}
