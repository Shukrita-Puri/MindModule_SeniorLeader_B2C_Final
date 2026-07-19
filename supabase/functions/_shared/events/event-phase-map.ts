// OWNERSHIP: coaching (primary). Engineering wires the map into rules.
// §4 of CEO Self-Regulation Framework v1.0 — per-category Pre / During / Post
// prescriptions: timing window, protocol combo, goal, prevents/builds.
//
// Joins ./event-categories.ts (§3 taxonomy) with ./protocol-combos.ts (§2).
// Classification is delegated to ./event-classifier.ts so there is one
// canonical title→category resolver in the codebase.

import type { ComboKey, ProtocolCombo } from "../protocols/protocol-combos.ts";
import { PROTOCOL_COMBOS } from "../protocols/protocol-combos.ts";
import type { EventCategoryId } from "./event-categories.ts";
import { classifyEvent } from "./event-classifier.ts";

export type Phase = "pre" | "during" | "post";

export interface EventPhase {
  timing: string;
  combo: ComboKey;
  goal: string;
  preventsBuilds: string[];
  severityHint?: "low" | "medium" | "high";
}

export type CategoryPhaseMap = Partial<Record<Phase, EventPhase>>;

export const EVENT_PHASE_MAP: Record<EventCategoryId, CategoryPhaseMap> = {
  // §4 prescriptions, aligned 1:1 to the canonical contract declared on
  // EVENT_CATEGORIES[id].protocol. Family suffix of the ComboKey (flow|pause|
  // reenergise) MUST match that contract; mode (somatic|mindset) is the
  // coaching authoring choice for the moment of impact.
  A: {
    pre:  { timing: "T-60 to T-15min", combo: "somatic.flow",  goal: "Coherent activation, breath cadence locked",       preventsBuilds: ["Prevents sympathetic spike on entry"],                                                  severityHint: "high"   },
    post: { timing: "T+30 to T+90min", combo: "mindset.pause", goal: "Detach, consolidate identity, capture lesson",     preventsBuilds: ["Prevents post-peak hangover into next block"],                                          severityHint: "medium" },
  },
  B: {
    pre:  { timing: "T-15min",         combo: "mindset.flow",       goal: "Confidence + outcome clarity primed",          preventsBuilds: ["Prevents persuasion crash from cold-start"],                                            severityHint: "medium" },
    post: { timing: "T+15min",         combo: "somatic.reenergise", goal: "Recover from high-output persuasion effort",   preventsBuilds: ["Prevents persuasion crash into next block"],                                            severityHint: "medium" },
  },
  C: {
    pre:  { timing: "T-30min",         combo: "somatic.pause",      goal: "Prime executive presence, distinguish arousal from anxiety", preventsBuilds: ["Prevents stage adrenaline compressing range"],                              severityHint: "high"   },
    post: { timing: "T+30min",         combo: "somatic.reenergise", goal: "Discharge stage chemistry, offload performance energy",       preventsBuilds: ["Prevents audience-depletion hangover"],                                     severityHint: "medium" },
  },
  D: {
    pre:  { timing: "T-15min",         combo: "somatic.pause",      goal: "Parasympathetic re-entry before emotional draw", preventsBuilds: ["Prevents carrying prior block's charge into the conversation"],                          severityHint: "medium" },
    post: { timing: "T+15min",         combo: "mindset.pause",      goal: "Offload relational stress, detach from outcome", preventsBuilds: ["Prevents decision leakage into next interpersonal block"],                              severityHint: "medium" },
  },
  E: {
    pre:    { timing: "T-10min",       combo: "mindset.flow",       goal: "Clear mental clutter, intent + first-move primed", preventsBuilds: ["Prevents cold-start churn"],                                                          severityHint: "low"    },
    during: { timing: "in-block",      combo: "mindset.flow",       goal: "Single-thread focus on the chosen problem",         preventsBuilds: ["Prevents context-switching cost"],                                                    severityHint: "low"    },
    post:   { timing: "T+10min",       combo: "somatic.pause",      goal: "Transition out without cognitive crash",            preventsBuilds: ["Prevents flow-exit into reactive interpersonal load"],                                severityHint: "low"    },
  },
  F: {
    pre:    { timing: "T-2h",          combo: "somatic.pause",      goal: "Pre-load parasympathetic state for sustained social output", preventsBuilds: ["Prevents social depletion across sessions"],                                  severityHint: "medium" },
    during: { timing: "session window",combo: "mindset.pause",      goal: "Stay present without over-investing (notification-only)",     preventsBuilds: ["Prevents energy leak from over-engagement"],                                  severityHint: "low"    },
    post:   { timing: "evening",       combo: "somatic.reenergise", goal: "Progressive daily recovery, sleep priming",                   preventsBuilds: ["Prevents day-2 cognitive decline", "Builds capacity for next session"],         severityHint: "high"   },
  },
  G: {
    pre:    { timing: "T-3h pre-flight",combo: "somatic.pause",     goal: "Pre-load parasympathetic state for compressed travel",       preventsBuilds: ["Prevents cumulative depletion across legs"],                                  severityHint: "medium" },
    during: { timing: "in-flight",      combo: "mindset.pause",     goal: "Anchor circadian rhythm, minimise sympathetic drift",        preventsBuilds: ["Prevents jet-lag amplification from anxiety arousal"],                        severityHint: "medium" },
    post:   { timing: "on landing",     combo: "somatic.reenergise",goal: "Hardware recovery, circadian re-entry",                       preventsBuilds: ["Prevents next-morning baseline collapse", "Builds capacity for landing-day event"], severityHint: "high"   },
  },
  H: {
  },
};

/**
 * Max number of priority slots a single event of a given category may
 * occupy in one plan. Anchors the variable-slot dedup rule: C/E/B/H
 * collapse to a single slot per event; multi-phase categories (G long-haul,
 * F multi-day conference, A big-stakes pre+post, D pre+post same day) may
 * legitimately occupy more.
 */
export const CATEGORY_MAX_SLOTS: Record<EventCategoryId, number> = {
  A: 2,
  B: 1,
  C: 1,
  D: 2,
  E: 1,
  F: 3,
  G: 3,
  H: 1,
};

const STAKES_TO_CATEGORY: Record<string, EventCategoryId> = {
  board: "A", external: "A", investor: "A",
};

function categoryFor(title: string, stakesLevel?: string | null): EventCategoryId | null {
  if (stakesLevel) {
    const hit = STAKES_TO_CATEGORY[stakesLevel.toLowerCase()];
    if (hit) return hit;
  }
  const subtype = classifyEvent(title);
  return subtype?.categoryId ?? null;
}

export function protocolsForEvent(
  title: string,
  phase: Phase,
  stakesLevel?: string | null,
): ProtocolCombo | null {
  const id = categoryFor(title, stakesLevel);
  if (!id) return null;
  const ph = EVENT_PHASE_MAP[id][phase];
  if (!ph) return null;
  return PROTOCOL_COMBOS[ph.combo];
}

export function phaseForEvent(
  title: string,
  phase: Phase,
  stakesLevel?: string | null,
): (EventPhase & { resolvedCombo: ProtocolCombo }) | null {
  const id = categoryFor(title, stakesLevel);
  if (!id) return null;
  const ph = EVENT_PHASE_MAP[id][phase];
  if (!ph) return null;
  return { ...ph, resolvedCombo: PROTOCOL_COMBOS[ph.combo] };
}
