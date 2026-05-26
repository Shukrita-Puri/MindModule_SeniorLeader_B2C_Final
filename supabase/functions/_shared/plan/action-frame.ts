// OWNERSHIP: coaching (compressed goal copy), engineering (lookup).
// ≤6-word italic sub-line shown above the practice cards. Deterministic,
// derived from EVENT_PHASE_MAP[category][phase].goal in event-phase-map.ts.
// Plan §3 — single source of truth for the sub-line copy.

import type { EventCategoryId } from "../events/event-categories.ts";
import type { Phase } from "../events/event-phase-map.ts";

const FRAMES: Record<EventCategoryId, Partial<Record<Phase, string>>> = {
  A: { pre: "Lock coherent boardroom presence", post: "Detach and capture the lesson" },
  B: { pre: "Prime confidence and outcome clarity", post: "Recover from persuasion output" },
  C: { pre: "Prime executive presence on stage", post: "Discharge stage chemistry now" },
  D: { pre: "Re-enter parasympathetic before this", post: "Offload relational stress now" },
  E: { pre: "Clear clutter, set first move", during: "Single-thread the chosen problem", post: "Transition out without crash" },
  F: { pre: "Pre-load parasympathetic for output", during: "Stay present, do not overspend", post: "Active recovery, sleep priming" },
  G: { pre: "Pre-load parasympathetic for travel", during: "Anchor circadian rhythm in transit", post: "Hardware recovery, circadian re-entry" },
  H: { during: "Build, do not wind down" },
};

export function buildActionFrame(category: EventCategoryId | null, phase: Phase | null): string | null {
  if (!category) return null;
  const p: Phase = phase || "pre";
  const exact = FRAMES[category]?.[p];
  if (exact) return capWords(exact, 6);
  // Fallback to any defined phase for the category
  const any = FRAMES[category];
  if (any) {
    const first = any.pre || any.during || any.post;
    if (first) return capWords(first, 6);
  }
  return null;
}

function capWords(s: string, n: number): string {
  const words = s.trim().split(/\s+/);
  if (words.length <= n) return words.join(" ");
  return words.slice(0, n).join(" ");
}