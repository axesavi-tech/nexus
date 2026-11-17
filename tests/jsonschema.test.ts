import { it, expect } from "vitest";
import { z } from "zod";
import { OPS } from "@/lib/ai/gateway";
it("json schemas", () => { for (const [k, d] of Object.entries(OPS)) { const s = z.toJSONSchema(d.output, { target: "draft-7" }) as { type?: string }; expect(s.type, k).toBe("object"); } });

import { extractJson } from "@/lib/ai/gateway";
it("extracts JSON from fenced or prose model replies", () => {
  expect(extractJson('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  expect(extractJson('Result {"b":[1,2]} done')).toEqual({ b: [1, 2] });
  expect(extractJson("no json")).toBeUndefined();
});
