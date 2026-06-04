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

// ════════════════════════════════════════════════════════════════════════
// buildPriorityTitle — CEO-behaviour-first Today's Priorities title.
//
// Format: `{verb} {executive objective} {connector} {event name}`
// where the verb is chosen from the event Category × Phase and the
// objective is mapped from `practicePriorityTag` to executive language.
//
// Examples:
//   pre  · A · regulation_composure  → "Lead composed presence in tomorrow's Board Meeting"
//   post · A · -                     → "Reset after the Board Meeting"
//   pre  · D · focus_clarity         → "Hold steady presence in the Shukrita/Tom feedback"
//
// Used by BOTH JIT and non-JIT slots so the eyebrow rule "<verb>
// <objective> in <event>" is the single source for the Today's
// Performance Priorities card.
// ════════════════════════════════════════════════════════════════════════

export type ArcVerb = 'Lead' | 'Decide' | 'Present' | 'Steady' | 'Recover' | 'Reset' | 'Reframe' | 'Land' | 'Hold';

/** Pick a CEO-behaviour verb from category + phase. */
export function verbForCategoryPhase(category: EventCategoryId | null, phase: Phase): ArcVerb {
  if (phase === 'post') {
    if (category === 'A' || category === 'D') return 'Reset';
    if (category === 'F' || category === 'G') return 'Recover';
    return 'Land';
  }
  if (phase === 'during') {
    return 'Hold';
  }
  // pre
  switch (category) {
    case 'A': return 'Lead';            // Board / governance
    case 'B': return 'Present';         // Client / external presentation
    case 'C': return 'Decide';          // Strategic decisions
    case 'D': return 'Steady';          // Difficult-people / feedback
    case 'E': return 'Steady';          // Deep work / focus blocks
    case 'F': return 'Present';         // Conferences / keynotes
    case 'G': return 'Reframe';         // Travel / transitions
    case 'H': return 'Steady';          // Daily rhythm
    default:  return 'Steady';
  }
}

/**
 * Map a `practicePriorityTag` to a 2–3-word executive performance objective.
 * Falls back to a phase-appropriate generic objective when the user has no
 * onboarding tag.
 */
export function executiveObjectiveFor(
  practicePriorityTag: string | null | undefined,
  category: EventCategoryId | null,
  phase: Phase,
): string {
  const tag = practicePriorityTag || '';
  // Canonical mapping per CEO-behaviour framework.
  const tagMap: Record<string, string> = {
    regulation_composure: 'composed presence',
    regulation_early:     'composed presence',
    recovery_resilience:  'focused recovery',
    energy_endurance:     'sustained energy',
    focus_clarity:        'strategic clarity',
    mindset_reframe:      'decisive alignment',
  };
  if (tag && tagMap[tag]) return tagMap[tag];

  // Phase-aware defaults when no tag.
  if (phase === 'post') {
    return category === 'A' || category === 'D' ? 'clean recovery' : 'recovery';
  }
  if (phase === 'during') return 'steady presence';
  // pre
  switch (category) {
    case 'A': return 'strategic clarity';
    case 'B': return 'composed presence';
    case 'C': return 'decisive alignment';
    case 'D': return 'steady presence';
    case 'E': return 'sustained focus';
    case 'F': return 'composed presence';
    case 'G': return 'circadian readiness';
    case 'H': return 'daily rhythm';
    default:  return 'composed presence';
  }
}

function connectorFor(phase: Phase): string {
  if (phase === 'post') return 'after';
  if (phase === 'during') return 'through';
  return 'in';
}

export interface BuildPriorityTitleInput {
  eventTitle: string | null | undefined;
  category: EventCategoryId | null;
  phase: Phase | null;
  isTomorrow?: boolean;
  practicePriorityTag?: string | null;
  /** When no calendar event anchors the slot (state-management). */
  fallbackContext?: string;
}

/**
 * The single source for Today's Performance Priorities titles (JIT + non-JIT).
 * Output shape: `${verb} ${objective} ${connector} ${eventName}` capped at
 * 10 words.
 */
export function buildPriorityTitle(input: BuildPriorityTitleInput): string {
  const phase: Phase = input.phase || 'pre';
  const cat = input.category;
  const verb = verbForCategoryPhase(cat, phase);
  const objective = executiveObjectiveFor(input.practicePriorityTag, cat, phase);
  const connector = connectorFor(phase);

  if (!input.eventTitle || !input.eventTitle.trim()) {
    const ctx = input.fallbackContext?.trim();
    if (ctx) return `${verb} ${objective} ${connector} ${ctx}`.replace(/\s+/g, ' ').trim();
    // No anchor at all — state-management label.
    return `${verb} ${objective} for the day ahead`;
  }

  // Trim event title to ≤4 identifying tokens, drop "Meeting"-style noise tail.
  const evt = shrinkEventName(input.eventTitle, 4);
  const tomorrow = input.isTomorrow ? "tomorrow's" : '';
  // For post we say "after the Board Meeting" not "after tomorrow's Board Meeting".
  const article = phase === 'post' && !tomorrow ? 'the' : tomorrow;

  const parts = [verb, objective, connector, article, evt].filter(Boolean);
  let out = parts.join(' ').replace(/\s+/g, ' ').trim();
  const words = out.split(' ');
  if (words.length > 10) out = words.slice(0, 10).join(' ');
  return out;
}