import type { ProjectState } from "../schemas";
import { toMarkdown } from "../export";
import { buildDoc, fileSlug, type SectionId } from "./model";

export const FORMATS = [
  { id: "pdf", name: "PDF report", ext: "pdf", desc: "Designed, print-ready report with cover, contents and page numbers", icon: "▤", recommended: true },
  { id: "docx", name: "Word document", ext: "docx", desc: "Fully editable, styled headings and tables — opens in Word and Google Docs", icon: "W" },
  { id: "pptx", name: "PowerPoint deck", ext: "pptx", desc: "Presentation-ready 16:9 deck — opens in PowerPoint, Keynote and Google Slides", icon: "▶" },
  { id: "md", name: "Markdown", ext: "md", desc: "Clean text for Notion, Obsidian, GitHub or any editor", icon: "#" },
  { id: "csv", name: "Task list (CSV)", ext: "csv", desc: "Every task with milestone, owner and dates — for Excel, Sheets, Jira or Asana", icon: "☰" },
  { id: "json", name: "Full data (JSON)", ext: "json", desc: "Complete machine-readable backup of the project", icon: "{}" },
] as const;
export type FormatId = (typeof FORMATS)[number]["id"];

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function tasksCsv(p: ProjectState): string {
  const ms = new Map((p.roadmap?.phases ?? []).flatMap((ph) => ph.milestones.map((m) => [m.id, { title: m.title, phase: ph.name }] as const)));
  const head = ["ID", "Title", "Description", "Phase", "Milestone", "Priority", "Status", "Owner", "Due date", "Depends on", "Acceptance criteria"];
  const rows = p.tasks.map((t) => {
    const m = t.milestoneId ? ms.get(t.milestoneId) : undefined;
    return [t.id, t.title, t.description, m?.phase ?? "", m?.title ?? "", t.priority, t.status, t.assignee ?? "", t.dueDate ?? "", t.dependsOn.join(" "), t.acceptanceCriteria.join(" | ")];
  });
  return "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export async function exportProject(p: ProjectState, format: FormatId, sections: SectionId[]): Promise<{ blob: Blob; filename: string }> {
  const base = fileSlug(p.title);
  switch (format) {
    case "pdf": { const { renderPdf } = await import("./pdf"); return { blob: await renderPdf(buildDoc(p, sections)), filename: `${base}.pdf` }; }
    case "docx": { const { renderDocx } = await import("./docx"); return { blob: await renderDocx(buildDoc(p, sections)), filename: `${base}.docx` }; }
    case "pptx": { const { renderPptx } = await import("./pptx"); return { blob: await renderPptx(buildDoc(p, sections)), filename: `${base}.pptx` }; }
    case "md": {
      type MdSection = NonNullable<Parameters<typeof toMarkdown>[1]>[number];
      const map: Record<string, MdSection> = { thought: "thought", ideas: "ideas", evaluation: "evaluation", decision: "decision", blueprint: "blueprint", roadmap: "roadmap", map: "map" };
      const md = toMarkdown(p, sections.map((s) => map[s]).filter(Boolean));
      return { blob: new Blob([md], { type: "text/markdown;charset=utf-8" }), filename: `${base}.md` };
    }
    case "csv": return { blob: new Blob([tasksCsv(p)], { type: "text/csv;charset=utf-8" }), filename: `${base}-tasks.csv` };
    case "json": return { blob: new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), format: "nexus.project.v1", project: p }, null, 2)], { type: "application/json" }), filename: `${base}.json` };
  }
}

export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
