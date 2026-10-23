// [KIND: policy] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Time-Fit Policy for Layer 3 Interventions.
// Source: Part 2 Layer 3 (Section 6.4, 8.2, D-L3-4).

import {
  MIN_APP_PRACTICE_GAP_MINUTES,
  PRACTICE_BUFFER_MINUTES,
  TIME_FIT_RUNG_LIMITS,
} from "../../constants.ts";
import type { InterventionCandidate } from "../../types.ts";

export function evaluateTimeFitPolicy(
  candidate: InterventionCandidate,
  availableGapMinutes: number
): { eligible: boolean; reason?: string } {
  // Own actions are lightweight self-management actions that can be done even in gaps < 15m
  if (candidate.kind === "own_action") {
    return { eligible: true };
  }

  // App practices require at least MIN_APP_PRACTICE_GAP_MINUTES (15m) (D-L3-4, RT3)
  if (availableGapMinutes < MIN_APP_PRACTICE_GAP_MINUTES) {
    return {
      eligible: false,
      reason: `Available gap (${availableGapMinutes}m) is under 15m minimum required for app practice`,
    };
  }

  const durationMinutes = candidate.practice?.minutes ?? candidate.minutes ?? 2;
  const usableGap = availableGapMinutes - PRACTICE_BUFFER_MINUTES;

  if (availableGapMinutes >= 120) {
    if (durationMinutes > TIME_FIT_RUNG_LIMITS.rung_4) {
      return { eligible: false, reason: `Duration (${durationMinutes}m) exceeds 30m ceiling` };
    }
  } else if (availableGapMinutes >= 60) {
    if (durationMinutes > TIME_FIT_RUNG_LIMITS.rung_3) {
      return { eligible: false, reason: `Duration (${durationMinutes}m) exceeds 15m ceiling for 60-119m gap` };
    }
  } else if (availableGapMinutes >= 30) {
    if (durationMinutes > TIME_FIT_RUNG_LIMITS.rung_2) {
      return { eligible: false, reason: `Duration (${durationMinutes}m) exceeds 5m ceiling for 30-59m gap` };
    }
  } else {
    // 15–29 min
    if (durationMinutes > TIME_FIT_RUNG_LIMITS.rung_1) {
      return { eligible: false, reason: `Duration (${durationMinutes}m) exceeds 2m ceiling for 15-29m gap` };
    }
  }

  if (durationMinutes > usableGap) {
    return {
      eligible: false,
      reason: `Duration (${durationMinutes}m) exceeds usable gap after 5m buffer (${usableGap}m)`,
    };
  }

  return { eligible: true };
}
