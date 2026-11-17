"use client";
import { useMemo, useState } from "react";
import type { ProjectState } from "@/lib/schemas";
import { FORMATS, exportProject, saveBlob, type FormatId } from "@/lib/exporters";
import { SECTION_LABELS, availableSections, type SectionId } from "@/lib/exporters/model";

export function ExportDialog({ project, onClose }: { project: ProjectState; onClose: () => void }) {
  const avail = useMemo(() => availableSections(project), [project]);
  const [format, setFormat] = useState<FormatId>("pdf");
  const [sections, setSections] = useState<SectionId[]>(avail);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sectionable = format === "pdf" || format === "docx" || format === "pptx" || format === "md";
  const disabled = busy || (format === "csv" && project.tasks.length === 0) || (sectionable && sections.length === 0);

  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const { blob, filename } = await exportProject(project, format, sections);
      saveBlob(blob, filename);
      onClose();
    } catch (e) { setErr((e as Error).message || "Export failed."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="export-title" onClick={() => !busy && onClose()}>
      <div className="card w-full max-w-3xl max-h-[90vh] overflow-auto scroll-thin p-6 fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div><div className="label mb-1">Export</div><h3 id="export-title" className="serif text-3xl">Download “{project.title}”</h3></div>
          <button className="text-ink3 hover:text-ink text-lg" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6" role="radiogroup" aria-label="Format">
          {FORMATS.map((f) => {
            const off = f.id === "csv" && project.tasks.length === 0;
            return (
              <button key={f.id} role="radio" aria-checked={format === f.id} disabled={off} onClick={() => setFormat(f.id)}
                className={`text-left rounded-xl border p-4 transition ${format === f.id ? "border-accent bg-panel2" : "border-line hover:border-line2"} ${off ? "opacity-40" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`w-9 h-9 grid place-items-center rounded-lg text-sm font-semibold ${format === f.id ? "bg-accent text-[#1a140b]" : "bg-panel2 text-ink2"}`}>{f.icon}</span>
                  {"recommended" in f && f.recommended && <span className="chip !text-[10px] !border-accent !text-accent">Designed</span>}
                </div>
                <div className="font-medium mb-1">{f.name} <span className="text-ink3 text-xs">.{f.ext}</span></div>
                <div className="text-xs text-ink3 leading-snug">{off ? "Generate a delivery plan first." : f.desc}</div>
              </button>
            );
          })}
        </div>
        {sectionable && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="label">Include</div>
              <button className="text-xs text-ink3 hover:text-ink" onClick={() => setSections(sections.length === avail.length ? [] : avail)}>{sections.length === avail.length ? "Clear all" : "Select all"}</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {avail.map((s) => {
                const on = sections.includes(s);
                return <button key={s} onClick={() => setSections(on ? sections.filter((x) => x !== s) : avail.filter((x) => x === s || sections.includes(x)))}
                  className={`chip transition ${on ? "!border-accent !text-accent" : ""}`} aria-pressed={on}>{on ? "✓ " : ""}{SECTION_LABELS[s]}</button>;
              })}
            </div>
            {avail.length === 0 && <p className="text-sm text-ink3">Nothing to export yet — start in the Thought Room.</p>}
          </div>
        )}
        {err && <p className="text-sm text-danger mb-3" role="alert">{err}</p>}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink3">Exports are generated in your browser — your content isn&rsquo;t sent anywhere to create them.</p>
          <button className="btn btn-primary" disabled={disabled} onClick={go}>{busy ? <span className="pulse">Designing your file…</span> : <>Download {FORMATS.find((f) => f.id === format)!.name}</>}</button>
        </div>
      </div>
    </div>
  );
}
