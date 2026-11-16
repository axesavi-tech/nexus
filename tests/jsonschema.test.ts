import { it, expect } from "vitest";
import { z } from "zod";
import { OPS } from "@/lib/ai/gateway";
it("json schemas", () => { for (const [k, d] of Object.entries(OPS)) { const s = z.toJSONSchema(d.output, { target: "draft-7" }) as { type?: string }; expect(s.type, k).toBe("object"); } });
