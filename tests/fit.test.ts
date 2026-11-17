import { describe, it, expect } from "vitest";
import { z } from "zod";
import { fitToSchema } from "@/lib/ai/fit";
import { RoadmapSchema } from "@/lib/schemas";

const schema = z.toJSONSchema(RoadmapSchema, { target: "draft-7" }) as Record<string, unknown>;
const task = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `T${i}`, title: "Task " + i, description: "Do it", milestoneId: "M1", dependsOn: [],
  priority: "high", acceptanceCriteria: ["done"], role: "Founder", estimateDays: 2, ...extra,
});
const base = {
  approach: "hybrid", planningAssumptions: ["Founder full-time"], mvpDefinition: "MVP",
  phases: [{ id: "P1", name: "Build", goal: "Ship", milestones: [{ id: "M1", title: "Launch", exitCriteria: "Live" }] }],
  tasks: [task(1), task(2), task(3)], raci: [], risks: [], kpis: [], goLiveCriteria: [],
};

describe("fitToSchema", () => {
  it("trims slight overshoots so a good plan is not thrown away", () => {
    const messy = {
      ...base, approach: "Hybrid",
      mvpDefinition: "x".repeat(900),
      tasks: Array.from({ length: 34 }, (_, i) => task(i + 1, {
        title: "y".repeat(170), priority: i % 2 ? "High" : "critical",
        acceptanceCriteria: ["a", "b", "c", "d", "e", "f"], estimateDays: i === 0 ? 0.1 : i === 1 ? "3" : 400,
      })),
    };
    expect(RoadmapSchema.safeParse(messy).success).toBe(false);
    const r = RoadmapSchema.safeParse(fitToSchema(messy, schema));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tasks).toHaveLength(30);
      expect(r.data.tasks[0].estimateDays).toBe(0.5);
      expect(r.data.tasks[1].estimateDays).toBe(3);
      expect(r.data.tasks[2].estimateDays).toBe(120);
      expect(r.data.tasks[1].priority).toBe("high");
    }
  });
  it("does not invent missing required content", () => {
    const noTasks: Record<string, unknown> = { ...base }; delete noTasks.tasks;
    expect(RoadmapSchema.safeParse(fitToSchema(noTasks, schema)).success).toBe(false);
  });
  it("leaves valid output unchanged", () => {
    expect(fitToSchema(base, schema)).toEqual(base);
  });
});
