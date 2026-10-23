// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step WA1-WA4: Week-Ahead Mode Evaluation.
// Source: Part 2 Layer 2 (Section 4.8).

import type { WeekAheadFacts, WeekAheadReason } from "../types.ts";
import type { AvailabilityFacts } from "../../availability/types.ts";
import type { TimeLocaleFacts } from "../../time/types.ts";
import { WEEK_AHEAD_LOOKBACK_DAYS, WEEK_AHEAD_LOOKAHEAD_DAYS } from "../constants.ts";

export interface WeekAheadEngineInput {
  timeLocale: TimeLocaleFacts;
  availability: AvailabilityFacts;
  manualOverride?: boolean;
}

export function stepEvaluateWeekAheadMode(input: WeekAheadEngineInput): WeekAheadFacts {
  // WA1: Manual override
  if (input.manualOverride) {
    return {
      isActive: true,
      reason: "manual_override",
      lookbackDays: WEEK_AHEAD_LOOKBACK_DAYS,
      lookaheadDays: WEEK_AHEAD_LOOKAHEAD_DAYS,
    };
  }

  // WA2: End of a run (runPosition === "last" or single)
  const isLastDay = input.availability.runPosition === "last" || input.availability.runPosition === "single";

  if (isLastDay) {
    if (input.availability.frame === "leave") {
      return {
        isActive: true,
        reason: "end_of_pto",
        lookbackDays: WEEK_AHEAD_LOOKBACK_DAYS,
        lookaheadDays: WEEK_AHEAD_LOOKAHEAD_DAYS,
      };
    }
    if (input.availability.frame === "public_holiday") {
      return {
        isActive: true,
        reason: "end_of_public_holiday",
        lookbackDays: WEEK_AHEAD_LOOKBACK_DAYS,
        lookaheadDays: WEEK_AHEAD_LOOKAHEAD_DAYS,
      };
    }
    if (input.availability.frame === "long_weekend") {
      return {
        isActive: true,
        reason: "end_of_long_weekend",
        lookbackDays: WEEK_AHEAD_LOOKBACK_DAYS,
        lookaheadDays: WEEK_AHEAD_LOOKAHEAD_DAYS,
      };
    }
  }

  // WA3: Weekly planning day from locale (e.g. Sunday or Saturday)
  if (input.timeLocale.weekday === input.timeLocale.planningDay) {
    return {
      isActive: true,
      reason: "weekly_planning",
      lookbackDays: WEEK_AHEAD_LOOKBACK_DAYS,
      lookaheadDays: WEEK_AHEAD_LOOKAHEAD_DAYS,
    };
  }

  return {
    isActive: false,
    reason: null,
    lookbackDays: WEEK_AHEAD_LOOKBACK_DAYS,
    lookaheadDays: WEEK_AHEAD_LOOKAHEAD_DAYS,
  };
}
