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
  A: {
    pre:    { timing: "T-60 to T-15min", combo: "somatic.flow",       goal: "Coherent activation, breath cadence locked",         preventsBuilds: ["Prevents sympathetic spike on entry"],                                                              severityHint: "high" },
    during: { timing: "in-room",         combo: "mindset.flow",       goal: "Single-thread focus on outcome, not optics",         preventsBuilds: ["Prevents decision leakage from self-monitoring"],                                                   severityHint: "medium" },
    post:   { timing: "T+30 to T+90min", combo: "mindset.reenergise", goal: "Capture lesson, consolidate identity",               preventsBuilds: ["Prevents post-peak hangover into next block"],                                                      severityHint: "medium" },
  },
  B: {
    pre:    { timing: "T-15min",         combo: "somatic.pause",      goal: "Parasympathetic re-entry before emotional draw",     preventsBuilds: ["Prevents carrying prior block's charge into the conversation"],                                     severityHint: "medium" },
    during: { timing: "in-room",         combo: "mindset.pause",      goal: "Detachment without disengagement",                   preventsBuilds: ["Prevents reactive identity threat"],                                                                severityHint: "low" },
    post:   { timing: "T+15min",         combo: "somatic.pause",      goal: "Discharge residual emotional load",                  preventsBuilds: ["Prevents decision leakage into next block"],                                                        severityHint: "medium" },
  },
  C: {
    pre:    { timing: "T-30min",         combo: "mindset.pause",      goal: "Detach from sunk cost, surface true criteria",       preventsBuilds: ["Prevents anchoring bias under fatigue"],                                                            severityHint: "medium" },
    during: { timing: "in-room",         combo: "mindset.flow",       goal: "Single-thread reasoning on the actual question",    preventsBuilds: ["Prevents premature convergence"],                                                                   severityHint: "medium" },
  },
  D: {
    pre:    { timing: "T-45min",         combo: "somatic.flow",       goal: "Voice, posture, breath cadence",                     preventsBuilds: ["Prevents adrenal spike compressing range"],                                                         severityHint: "high" },
    post:   { timing: "T+30min",         combo: "somatic.pause",      goal: "Discharge stage chemistry",                          preventsBuilds: ["Prevents post-peak hangover"],                                                                      severityHint: "medium" },
  },
  E: {
    pre:    { timing: "T-10min",         combo: "mindset.flow",       goal: "Intent + first-move primed",                         preventsBuilds: ["Prevents cold-start churn"],                                                                        severityHint: "low" },
  },
  F: {
    pre:    { timing: "T-2h",            combo: "somatic.pause",      goal: "Pre-load parasympathetic state for compressed travel", preventsBuilds: ["Prevents cumulative depletion across legs"],                                                      severityHint: "medium" },
    post:   { timing: "on arrival",      combo: "somatic.reenergise", goal: "Hardware recovery, sleep priming",                   preventsBuilds: ["Prevents day-2 cognitive decline", "Builds circadian re-entry for next-morning baseline"],          severityHint: "high" },
  },
  G: {
    during: { timing: "in-room",         combo: "mindset.flow",       goal: "Stay present without over-investing",                preventsBuilds: ["Prevents energy leak from over-engagement"],                                                        severityHint: "low" },
  },
  H: {
    during: { timing: "in-window",       combo: "somatic.reenergise", goal: "Active recovery, not passive scrolling",             preventsBuilds: ["Prevents end-of-day collapse"],                                                                     severityHint: "low" },
  },
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
