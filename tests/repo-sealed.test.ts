import { describe, it, expect, vi, beforeEach } from "vitest";

// A fake Supabase client that records every write and returns canned rows.
const writes: { table: string; op: string; payload: unknown }[] = [];
let rows: Record<string, unknown> = {};
function chain(table: string) {
  const c: Record<string, unknown> = {};
  const self = new Proxy(c, {
    get(_t, prop: string) {
      if (prop === "then") return (res: (v: unknown) => void) => res({ data: rows[table] ?? null, error: null });
      return (...args: unknown[]) => {
        if (["insert", "update", "upsert"].includes(prop)) writes.push({ table, op: prop, payload: args[0] });
        if (prop === "delete") writes.push({ table, op: "delete", payload: null });
        return self;
      };
    },
  });
  return self;
}
vi.mock("@/lib/supabase", () => ({ supabaseBrowser: () => ({ from: (t: string) => chain(t) }), hasSupabase: () => true }));

import { getRepo, blankProject } from "@/lib/repo";
import { createVault, setVaultKey } from "@/lib/vault";

describe("Supabase repository with an unlocked vault", () => {
  beforeEach(() => { writes.length = 0; rows = {}; });

  it("writes only ciphertext and placeholders — no idea text reaches the database", async () => {
    const { key } = await createVault("correct horse battery staple", 1000);
    setVaultKey(key);
    const repo = getRepo();
    const p = { ...blankProject("p1", "Premium handloom sarees with video styling", "guided"), title: "Iraaya video styling" };
    rows.projects = { id: "p1" };
    await repo.create(p);
    await repo.save(p, null);
    await repo.snapshot(p, "Before: secret pricing change");
    const dump = JSON.stringify(writes);
    expect(dump).not.toMatch(/handloom|Iraaya|video styling|secret pricing/i);
    const proj = writes.filter((w) => w.table === "projects");
    expect(proj.length).toBeGreaterThan(0);
    for (const w of proj) expect((w.payload as { title: string }).title).toBe("🔒 Encrypted");
    // First save after load scrubs any plaintext rows left by older versions.
    expect(writes.filter((w) => w.op === "delete").map((w) => w.table).sort()).toEqual(["artifacts", "edges", "nodes", "tasks", "versions"]);
  });

  it("round-trips a sealed project through load()", async () => {
    const { key } = await createVault("correct horse battery staple", 1000);
    setVaultKey(key);
    const repo = getRepo();
    const p = { ...blankProject("p2", "An app for clinics on WhatsApp", "guided"), title: "Clinic bookings" };
    await repo.save(p, null);
    const saved = writes.find((w) => w.table === "projects" && w.op === "update")!.payload as { settings: unknown };
    rows.projects = { id: "p2", mode: "guided", created_at: "2026-11-21", updated_at: "2026-11-21", settings: saved.settings, title: "🔒 Encrypted", thought: "" };
    const back = await repo.load("p2");
    expect(back?.title).toBe("Clinic bookings");
    expect(back?.thought).toBe("An app for clinics on WhatsApp");
    setVaultKey(null);
    await expect(repo.load("p2")).rejects.toThrow(/locked/);
  });
});
