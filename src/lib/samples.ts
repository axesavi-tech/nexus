import type { Mode } from "./schemas";

/** Required demonstration scenarios (master prompt §26). Labelled as samples in the UI. */
export const SAMPLES: { id: string; label: string; thought: string; mode: Mode }[] = [
  { id: "A", label: "Entrepreneurial idea", thought: "I want to create a premium D2C brand, but I don't know what to sell.", mode: "guided" },
  { id: "B", label: "Business transformation", thought: "Our customer onboarding process takes 12 days. How can we reduce it to 3?", mode: "strategic" },
  { id: "C", label: "Technical invention", thought: "What if we could create a new kind of low-power computing chip?", mode: "strategic" },
  { id: "D", label: "Everyday innovation", thought: "How can I help schoolchildren enjoy mathematics?", mode: "guided" },
  { id: "E", label: "Abstract thought", thought: "What if failure was part of the reward?", mode: "free" },
];
