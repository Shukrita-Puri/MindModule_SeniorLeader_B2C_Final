// OWNERSHIP: coaching (primary). Engineering wires the map into rules.
// §4 of CEO Self-Regulation Framework v1.0 — per-category Pre / During / Post
// prescriptions: timing window, protocol combo, goal, prevents/builds.
//
// SCOPE BOUNDARY: this file owns *what intervention to prescribe at each
// phase*. It does NOT own classification (events/event-categories.ts) and
// does NOT own behaviour rules (ceo-behaviour/*.ts). Behaviour rules decide
// when/whether to nudge; this map decides what protocol the nudge prescribes.
//
// FUTURE-FEATURE GUIDANCE: features needing specialised timing (e.g. a
// sparring-partner feature wanting 7-day-ahead prep) should create a
// per-feature overlay rather than duplicating this map. See
// mem/architecture/ceo-behaviour-shared-module-ownership.md.

import type { ComboKey, ProtocolCombo } from "../protocols/protocol-combos.ts";
import { PROTOCOL_COMBOS } from "../protocols/protocol-combos.ts";
import type { EventCategoryId } from "./event-categories.ts";
import { classifyEvent } from "./event-categories.ts";

export type Phase = "pre" | "during" | "post";

export interface EventPhase {
  /** Doc §4 "Timing" column — e.g. "T-60 to T-15min", "in-room". */
  timing: string;
  /** Protocol combo to deploy at this phase. Resolves via PROTOCOL_COMBOS. */
  combo: ComboKey;
  /** Doc §4 "Goal" column — what this protocol should produce. */
  goal: string;
  /**
   * Doc §4 "Prevents / Builds" column, normalised to a list of bullets so
   * renderers can format consistently. Single-bullet entries are valid.
   */
  preventsBuilds: string[];
  /**
   * Optional default severity for downstream rules. When set, behaviour rules
   * may use this as the baseline severity for nudges anchored to this phase
   * (they remain free to escalate / suppress based on signals).
   */
  severityHint?: "low" | "medium" | "high";
}

export type CategoryPhaseMap = Partial<Record<Phase, EventPhase>>;

export const EVENT_PHASE_MAP: Record<EventCategoryId, CategoryPhaseMap> = {
  A: {
    pre: {
      timing: "T-60 to T-15min", combo: "somatic.flow",
      goal: "Coherent activation, breath cadence locked",
      preventsBuilds: ["Prevents sympathetic spike on entry"],
      severityHint: "high",
    },
    during: {
      timing: "in-room", combo: "mindset.flow",
      goal: "Single-thread focus on outcome, not optics",
      preventsBuilds: ["Prevents decision leakage from self-monitoring"],
      severityHint: "medium",
    },
    post: {
      timing: "T+30 to T+90min", combo: "mindset.reenergise",
      goal: "Capture lesson, consolidate identity",
      preventsBuilds: ["Prevents post-peak hangover into next block"],
      severityHint: "medium",
    },
  },
  B: {
    pre: {
      timing: "T-15min", combo: "somatic.pause",
      goal: "Parasympathetic re-entry before emotional draw",
      preventsBuilds: ["Prevents carrying prior block's charge into the conversation"],
      severityHint: "medium",
    },
    during: {
      timing: "in-room", combo: "mindset.pause",
      goal: "Detachment without disengagement",
      preventsBuilds: ["Prevents reactive identity threat"],
      severityHint: "low",
    },
    post: {
      timing: "T+15min", combo: "somatic.pause",
      goal: "Discharge residual emotional load",
      preventsBuilds: ["Prevents decision leakage into next block"],
      severityHint: "medium",
    },
  },
  C: {
    pre: {
      timing: "T-30min", combo: "mindset.pause",
      goal: "Detach from sunk cost, surface true criteria",
      preventsBuilds: ["Prevents anchoring bias under fatigue"],
      severityHint: "medium",
    },
    during: {
      timing: "in-room", combo: "mindset.flow",
      goal: "Single-thread reasoning on the actual question",
      preventsBuilds: ["Prevents premature convergence"],
      severityHint: "medium",
    },
  },
  D: {
    pre: {
      timing: "T-45min", combo: "somatic.flow",
      goal: "Voice, posture, breath cadence",
      preventsBuilds: ["Prevents adrenal spike compressing range"],
      severityHint: "high",
    },
    post: {
      timing: "T+30min", combo: "somatic.pause",
      goal: "Discharge stage chemistry",
      preventsBuilds: ["Prevents post-peak hangover"],
      severityHint: "medium",
    },
  },
  E: {
    pre: {
      timing: "T-10min", combo: "mindset.flow",
      goal: "Intent + first-move primed",
      preventsBuilds: ["Prevents cold-start churn"],
      severityHint: "low",
    },
  },
  F: {
    pre: {
      timing: "T-2h", combo: "somatic.pause",
      goal: "Pre-load parasympathetic state for compressed travel",
      preventsBuilds: ["Prevents cumulative depletion across legs"],
      severityHint: "medium",
    },
    post: {
      timing: "on arrival", combo: "somatic.reenergise",
      goal: "Hardware recovery, sleep priming",
      preventsBuilds: [
        "Prevents day-2 cognitive decline",
        "Builds circadian re-entry for next-morning baseline",
      ],
      severityHint: "high",
    },
  },
  G: {
    during: {
      timing: "in-room", combo: "mindset.flow",
      goal: "Stay present without over-investing",
      preventsBuilds: ["Prevents energy leak from over-engagement"],
      severityHint: "low",
    },
  },
  H: {
    during: {
      timing: "in-window", combo: "somatic.reenergise",
      goal: "Active recovery, not passive scrolling",
      preventsBuilds: ["Prevents end-of-day collapse"],
      severityHint: "low",
    },
  },
};

/**
 * Resolve the prescribed ProtocolCombo for a given event title + phase.
 * Joins §3 (classifier) with §4 (phase map). Returns null when either the
 * event can't be classified or the category has no prescription for the
 * requested phase.
 */
export function protocolsForEvent(
  title: string,
  phase: Phase,
  stakesLevel?: string | null,
): ProtocolCombo | null {
  const id = classifyEvent(title, stakesLevel);
  if (!id) return null;
  const ph = EVENT_PHASE_MAP[id][phase];
  if (!ph) return null;
  return PROTOCOL_COMBOS[ph.combo];
}

/**
 * Return the full §4 prescription (timing/goal/preventsBuilds + resolved
 * combo) for an event + phase. Use this when rendering brief/plan/nudge copy
 * that needs more than the raw ProtocolCombo.
 */
export function phaseForEvent(
  title: string,
  phase: Phase,
  stakesLevel?: string | null,
): (EventPhase & { resolvedCombo: ProtocolCombo }) | null {
  const id = classifyEvent(title, stakesLevel);
  if (!id) return null;
  const ph = EVENT_PHASE_MAP[id][phase];
  if (!ph) return null;
  return { ...ph, resolvedCombo: PROTOCOL_COMBOS[ph.combo] };
}