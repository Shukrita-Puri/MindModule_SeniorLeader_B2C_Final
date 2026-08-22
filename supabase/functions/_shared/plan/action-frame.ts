// OWNERSHIP: coaching (compressed goal copy), engineering (lookup).
// ≤6-word italic sub-line shown above the practice cards. Deterministic,
// derived from EVENT_PHASE_MAP[category][phase].goal in event-phase-map.ts.
// Plan §3 — single source of truth for the sub-line copy.

import type { EventCategoryId } from "../events/event-categories.ts";
import type { Phase } from "../events/event-phase-map.ts";
// A–H resolution via the single canonical entry point.
import { resolveEvent, type ResolveEventInput } from "../events/resolve-event.ts";
const classifyEvent = (input: ResolveEventInput) => resolveEvent(input).subtype;

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

export function buildActionFrameForEvent(
  eventTitle: string | null | undefined,
  phase: Phase | null = "pre",
): string | null {
  const subtype = classifyEvent(eventTitle || "");
  return buildActionFrame(subtype?.categoryId ?? null, phase);
}

export interface PlanRecommendedActionInput {
  primaryType: "regulate" | "align" | "prepare" | "integrate" | string;
  eventTitle?: string | null;
  timeOfDay?: "morning" | "afternoon" | "evening" | string | null;
  tier?: string | null;
  category?: EventCategoryId | null;
  phase?: Phase | null;
}

export function buildRecommendedActionCopy(input: PlanRecommendedActionInput): string {
  const event = input.eventTitle?.trim() || null;
  const category = input.category ?? (event ? classifyEvent(event)?.categoryId ?? null : null);
  const phase = input.phase ?? (event ? "pre" : null);
  const sharedFrame = buildActionFrame(category, phase);
  if (sharedFrame) return sharedFrame;

  const tod = input.timeOfDay || "morning";
  const todWord = tod === "morning" ? "morning" : tod === "afternoon" ? "afternoon" : "evening";

  if (event) {
    switch (input.primaryType) {
      case "regulate": return `Settle your nervous system before ${event}`;
      case "align": return `Sharpen your thinking before ${event}`;
      case "prepare": return `Enter optimal flow state before ${event}`;
      case "integrate": return `Land cleanly after ${event}`;
    }
  }

  if (input.tier === "depleted") {
    if (input.primaryType === "regulate") return `Restore reserves before the ${todWord} compounds`;
    if (input.primaryType === "align") return `Recover focus while reserves are low`;
    if (input.primaryType === "integrate") return `Close the day and protect tomorrow's capacity`;
    return `Rebuild capacity for what's ahead`;
  }

  switch (input.primaryType) {
    case "regulate": return `Regulate your state for the ${todWord} ahead`;
    case "align": return `Set your focus for the ${todWord}`;
    case "prepare": return `Build resilience for high-demand days`;
    case "integrate": return tod === "evening" ? `Close the day with intention` : `Consolidate what's working`;
    default: return `Strengthen your state for what's ahead`;
  }
}

function capWords(s: string, n: number): string {
  const words = s.trim().split(/\s+/);
  if (words.length <= n) return words.join(" ");
  return words.slice(0, n).join(" ");
}
