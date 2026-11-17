/* eslint-disable @typescript-eslint/no-explicit-any */
import { it, expect } from "vitest";
import { runOp } from "@/lib/ai/gateway";
import { blankProject } from "@/lib/repo";
import { sanitizeRoadmap } from "@/lib/graph";
import { buildDoc, availableSections } from "@/lib/exporters/model";
import { tasksCsv } from "@/lib/exporters/index";
import { toMarkdown } from "@/lib/export";
import { DEFAULT_SLIDERS } from "@/lib/schemas";
it("renders every export format as a valid, non-empty file", async () => {
const { renderDocx } = await import("@/lib/exporters/docx");
const { renderPptx } = await import("@/lib/exporters/pptx");

const { renderPdf } = await import("@/lib/exporters/pdf");

delete process.env.ANTHROPIC_API_KEY;
const thought = "I want to create a premium D2C brand, but I don't know what to sell.";
const p = blankProject("demo", thought, "guided");
const I: any = (await runOp("analyze", { thought, mode: "guided" })).data;
const node: any = (await runOp("node", { action: "challenge", thought, context: { focus: { id: "root", type: "thought", title: I.title, description: thought }, ancestry: [], siblings: [], children: [], others: [] } })).data;
const ideas: any = (await runOp("ideate", { thought, interpretation: I, focus: [{ id: "root", type: "thought", title: I.title }], sliders: DEFAULT_SLIDERS })).data;
const ev: any = (await runOp("evaluate", { thought, ideas: ideas.ideas })).data;
const bp: any = (await runOp("blueprint", { thought, interpretation: I, idea: ideas.ideas[1] })).data;
const rm: any = sanitizeRoadmap((await runOp("roadmap", { thought, blueprint: bp, approach: "hybrid" })).data as any).roadmap;
const now = new Date().toISOString();
Object.assign(p, {
  title: I.title, interpretation: I, ideas, evaluation: ev, blueprint: bp, roadmap: rm, aiMode: "live",
  nodes: [{ id: "root", type: "thought", title: I.title, description: thought, status: "open", tags: [], parentId: null, x: 0, y: 0, provenance: { source: "user", at: now }, createdAt: now, updatedAt: now },
    ...node.addNodes.map((n: any, i: number) => ({ id: "n" + i, type: n.type, title: n.title, description: n.description, status: "open", tags: [], parentId: "root", x: 0, y: 0, provenance: { source: "ai", at: now, claim: n.claim }, createdAt: now, updatedAt: now }))],
  decision: { question: "Which direction should we commit to?", optionsConsidered: ideas.ideas.map((i: any) => i.title), criteria: {}, chosenOption: ideas.ideas[1].title, rationale: "Best balance of desirability and feasibility with the lowest upfront inventory risk; testable within six weeks.", decisionMaker: "Abhijit", date: "2026-11-17", reconsiderIf: "Pre-orders fall below 40 in the first drop", risks: "Supplier lead times; premium price acceptance" },
  tasks: rm.tasks.map((t: any) => ({ id: t.id, title: t.title, description: t.description, priority: t.priority, status: "todo", dependsOn: t.dependsOn, acceptanceCriteria: t.acceptanceCriteria, milestoneId: t.milestoneId, assignee: t.role, dueDate: null })),
});
const doc = buildDoc(p, availableSections(p));
expect(doc.sections.map((x) => x.id)).toEqual(["thought", "ideas", "evaluation", "decision", "blueprint", "roadmap", "tasks", "map"]);
const pdfBlob = await renderPdf(doc, process.cwd() + "/public/fonts");
const pdfBuf = Buffer.from(await pdfBlob.arrayBuffer());
expect(pdfBuf.subarray(0, 5).toString()).toBe("%PDF-");
expect(pdfBuf.length).toBeGreaterThan(20000);
const docxBlob = await renderDocx(doc);
const docxBuf = Buffer.from(await docxBlob.arrayBuffer());
expect(docxBuf.subarray(0, 2).toString()).toBe("PK");
const pptxBlob = await renderPptx(doc);
const pptxBuf = Buffer.from(await pptxBlob.arrayBuffer());
expect(pptxBuf.subarray(0, 2).toString()).toBe("PK");
expect(toMarkdown(p)).toContain("## Implementation roadmap");
const csv = tasksCsv(p);
expect(csv.split("\r\n").length).toBe(p.tasks.length + 1);


}, 120000);

it("CSV export neutralises spreadsheet formula injection", async () => {
  const { tasksCsv } = await import("@/lib/exporters/index");
  const p = blankProject("x", "t", "free");
  p.tasks = [{ id: "T1", title: "=HYPERLINK(\"http://evil\")", description: "+cmd", priority: "low", status: "todo", dependsOn: [], acceptanceCriteria: [] }];
  const csv = tasksCsv(p);
  expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  expect(csv).toContain(`"'+cmd"`);
});
