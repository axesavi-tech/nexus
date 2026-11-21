"use client";
import { useEffect, useRef } from "react";
import { useNexus } from "@/lib/store";
import { getRepo } from "@/lib/repo";
import type { ProjectState } from "@/lib/schemas";

/** Load a project into the store and autosave every change (debounced, diffed against the last save). */
export function useProject(id: string) {
  const { p, load } = useNexus();
  const lastSaved = useRef<ProjectState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cur = useNexus.getState().p;
    if (cur?.id === id) { lastSaved.current = cur; return; }
    load(id).then(() => { lastSaved.current = useNexus.getState().p; });
  }, [id, load]);

  useEffect(() => {
    if (!p || p === lastSaved.current) return;
    if (timer.current) clearTimeout(timer.current);
    useNexus.setState({ saveState: "saving" });
    timer.current = setTimeout(async () => {
      try {
        await getRepo().save(p, lastSaved.current);
        lastSaved.current = p;
        useNexus.setState({ saveState: "saved" });
      } catch (e) {
        useNexus.setState({ saveState: "error", error: `Save failed: ${(e as Error).message}` });
      }
    }, 700);
  }, [p]);
  return p;
}
