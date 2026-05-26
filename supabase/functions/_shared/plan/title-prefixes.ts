// OWNERSHIP: coaching (verbs), engineering (selection).
// Deterministic PREVENT / PREPARE title generation for Today's 3 Priorities.
// Spec: see Plan implementation prompt §3 + §9.
//
// Inputs come from the canonical taxonomy (event-categories.ts +
// event-phase-map.ts). This module never re-classifies.

import type { EventCategoryId } from "../events/event-categories.ts";
import { EVENT_PHASE_MAP, type Phase } from "../events/event-phase-map.ts";

export type TitleRole = "PREVENT" | "PREPARE";

export const PREVENT_PREFIXES = {
  stress_accumulation: "Steady",
  emotion_hijack: "Ground",
  decision_leakage: "Protect",
  performance_degradation: "Reset",
  travel_fatigue: "Anchor",
  post_peak_hangover: "Clear",
  notification_overload: "Protect",
  habit_dropout: "Maintain",
} as const;

export const PREPARE_PREFIXES = {
  recovery_for_next: "Build",
  circadian_resilience: "Anchor",
  executive_presence: "Prime",
  sustained_focus: "Sharpen",
  emotional_labour: "Set",
  daily_habit: "Activate",
} as const;

// Category × phase → semantic slug used to pick the prefix.
// Falls back to role-default (Steady / Prime) if not matched.
const CATEGORY_PHASE_SLUG: Partial<Record<EventCategoryId, Partial<Record<Phase, keyof typeof PREVENT_PREFIXES | keyof typeof PREPARE_PREFIXES>>>> = {
  A: { pre: "executive_presence",     post: "post_peak_hangover" },
  B: { pre: "executive_presence",     post: "performance_degradation" },
  C: { pre: "emotion_hijack",         post: "post_peak_hangover" },
  D: { pre: "emotion_hijack",         post: "decision_leakage" },
  E: { pre: "sustained_focus",        during: "sustained_focus", post: "stress_accumulation" },
  F: { pre: "emotional_labour",       during: "notification_overload", post: "recovery_for_next" },
  G: { pre: "travel_fatigue",         during: "circadian_resilience", post: "recovery_for_next" },
  H: { during: "daily_habit" },
};

export function roleForCategoryPhase(category: EventCategoryId, phase: Phase): TitleRole {
  // PREVENT when the phase prescription chiefly prevents something; PREPARE otherwise.
  // Post-phases are almost always prevent (post-peak, leakage, fatigue).
  if (phase === "post") return "PREVENT";
  const ph = EVENT_PHASE_MAP[category]?.[phase];
  const pb = (ph?.preventsBuilds || []).join(" ").toLowerCase();
  if (pb.startsWith("prevents") || (pb.includes("prevents") && !pb.includes("builds"))) return "PREVENT";
  return "PREPARE";
}

export function prefixFor(category: EventCategoryId, phase: Phase, role: TitleRole): string {
  const slug = CATEGORY_PHASE_SLUG[category]?.[phase];
  if (slug) {
    if (role === "PREVENT" && slug in PREVENT_PREFIXES) {
      return (PREVENT_PREFIXES as Record<string, string>)[slug];
    }
    if (role === "PREPARE" && slug in PREPARE_PREFIXES) {
      return (PREPARE_PREFIXES as Record<string, string>)[slug];
    }
  }
  return role === "PREVENT" ? "Steady" : "Prime";
}

/** Shrink the event name to ≤4 identifying tokens. */
export function shrinkEventName(raw: string, maxTokens = 4): string {
  const cleaned = (raw || "")
    .replace(/[\(\)\[\]\"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const tokens = cleaned.split(" ");
  if (tokens.length <= maxTokens) return tokens.join(" ");
  // keep first (maxTokens - 1) + last token — preserves "Pitch" / "Review" tail
  const head = tokens.slice(0, maxTokens - 1);
  return [...head, tokens[tokens.length - 1]].join(" ");
}

export interface BuildPlanTitleInput {
  eventTitle: string;
  category: EventCategoryId | null;
  phase: Phase | null;
  isTomorrow: boolean;
}

/**
 * Deterministic Today's-3 title generator.
 * Format: `${prefix} ${eventName}${tomorrow?}` — hard cap 8 words.
 */
export function buildPlanTitle(input: BuildPlanTitleInput): string {
  const phase: Phase = input.phase || "pre";
  const cat = input.category;
  const role: TitleRole = cat ? roleForCategoryPhase(cat, phase) : (phase === "post" ? "PREVENT" : "PREPARE");
  const prefix = cat ? prefixFor(cat, phase, role) : (role === "PREVENT" ? "Steady" : "Prime");

  // Reserve word budget: prefix (1) + optional "tomorrow's" suffix marker handled below.
  const tomorrowMarker = input.isTomorrow ? "tomorrow" : "";
  // Max 8 words total. Tokens available for event name:
  //   8 - 1 (prefix) - (tomorrowMarker ? 1 : 0) = 7 or 6
  const eventBudget = 8 - 1 - (tomorrowMarker ? 1 : 0);
  const evtName = shrinkEventName(input.eventTitle, Math.min(4, eventBudget));

  const parts = [prefix];
  if (tomorrowMarker) parts.push("tomorrow's");
  if (evtName) parts.push(evtName);
  let out = parts.join(" ").replace(/\s+/g, " ").trim();

  // Final safety: hard cap to 8 words.
  const words = out.split(" ");
  if (words.length > 8) out = words.slice(0, 8).join(" ");
  return out;
}