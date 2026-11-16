"use client";
import type { NodeType } from "@/lib/schemas";
import { claimLabel } from "@/lib/export";

export const TYPE_GLYPH: Record<NodeType, string> = {
  thought: "◉", question: "?", problem: "!", insight: "✦", opportunity: "↗", idea: "✺", hypothesis: "H",
  assumption: "≈", evidence: "✓", constraint: "▣", stakeholder: "☺", solution: "◆", decision: "⚑",
  risk: "△", experiment: "⚗", dependency: "⇄", action: "▶", milestone: "◈", outcome: "★",
};
export const typeColor = (t: string) => `var(--t-${t})`;
export const TYPE_HEX: Record<string, string> = {
  thought: "#e8b86d", question: "#9aa8ff", problem: "#e07a6a", insight: "#c6a7ff", opportunity: "#7fd1b9", idea: "#ffd36e",
  hypothesis: "#a3b8d6", assumption: "#e3a76f", evidence: "#8cc49a", constraint: "#b5937a", stakeholder: "#79c1e8", solution: "#7fb8a4",
  decision: "#f2f0e6", risk: "#ef8f8f", experiment: "#b9d37a", dependency: "#9c9fae", action: "#6fc3df", milestone: "#d6b0ff", outcome: "#9fe0a6",
};

export function TypeBadge({ type }: { type: NodeType }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[.08em] font-semibold" style={{ color: typeColor(type) }}>
      <span aria-hidden>{TYPE_GLYPH[type]}</span>{type}
    </span>
  );
}

const CLAIM_STYLE: Record<string, string> = {
  user_fact: "var(--ok)", verified_external: "var(--ok)", research_interpretation: "var(--t-hypothesis)",
  ai_inference: "var(--ink-3)", working_assumption: "var(--warn)", unvalidated_hypothesis: "var(--warn)", forecast: "var(--t-insight)",
};
export function ClaimTag({ claim }: { claim?: string }) {
  if (!claim) return null;
  return <span className="chip !text-[10.5px] !py-0" style={{ borderColor: CLAIM_STYLE[claim], color: CLAIM_STYLE[claim] }} title="Evidence classification">{claimLabel(claim)}</span>;
}

export function Spinner({ label }: { label: string }) {
  return <span className="inline-flex items-center gap-2 text-sm text-ink2"><span className="h-2 w-2 rounded-full bg-accent pulse" />{label}</span>;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg text-center py-20 fade-in">
      <h3 className="serif text-2xl mb-2">{title}</h3>
      <p className="text-ink2 mb-6 leading-relaxed">{body}</p>
      {action}
    </div>
  );
}

export function Section({ title, kicker, children, right }: { title: string; kicker?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="flex items-end justify-between mb-3 gap-4">
        <div>
          {kicker && <div className="label mb-1">{kicker}</div>}
          <h2 className="serif text-xl">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Confidence({ level }: { level?: "low" | "medium" | "high" }) {
  if (!level) return null;
  const n = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-ink3" title={`Confidence: ${level}`}>
      {[1, 2, 3].map((i) => <span key={i} className="h-2 w-1.5 rounded-sm" style={{ background: i <= n ? "var(--accent)" : "var(--line-2)" }} />)}
      {level}
    </span>
  );
}
