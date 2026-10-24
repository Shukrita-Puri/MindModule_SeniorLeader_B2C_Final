// [KIND: step] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Confidence evaluation and two-window check.
// Source: Part 2 Layer 4 (Section 6, N-L4-10, N-L4-12).

import {
  MIN_EFFECT_PCT_EMERGING,
  MIN_EFFECT_PCT_STRONG,
  MIN_MEASURED_N_EMERGING,
  MIN_MEASURED_N_STRONG,
} from "../constants.ts";
import type { ConfidenceTier, MetricComparison } from "../types.ts";

/**
 * Checks if the effect holds in both halves of the chronological sample window (N-L4-10).
 * Prevents brief anomalous clusters from flipping a pattern to 'strong'.
 */
export function checkTwoWindowStability(
  comparisons: MetricComparison[]
): boolean {
  if (comparisons.length < MIN_MEASURED_N_STRONG) return false;

  const sorted = [...comparisons].sort((a, b) => a.date.localeCompare(b.date));
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  const avgFirst =
    firstHalf.reduce((sum, c) => sum + c.diffPct, 0) / firstHalf.length;
  const avgSecond =
    secondHalf.reduce((sum, c) => sum + c.diffPct, 0) / secondHalf.length;

  // Both halves must show an effect in the same direction with at least 8% magnitude
  const firstSignificant = Math.abs(avgFirst) >= 8;
  const secondSignificant = Math.abs(avgSecond) >= 8;
  const sameSign = Math.sign(avgFirst) === Math.sign(avgSecond);

  return firstSignificant && secondSignificant && sameSign;
}

/**
 * Evaluates the ConfidenceTier of an observed effect.
 */
export function evaluateConfidence(
  comparisons: MetricComparison[],
  avgEffectPct: number
): {
  confidence: ConfidenceTier;
  twoWindowPassed: boolean;
} {
  const measuredN = comparisons.length;
  const absMagnitude = Math.abs(avgEffectPct);

  if (measuredN < MIN_MEASURED_N_EMERGING || absMagnitude < MIN_EFFECT_PCT_EMERGING) {
    return { confidence: "insufficient_data", twoWindowPassed: false };
  }

  if (measuredN >= MIN_MEASURED_N_STRONG && absMagnitude >= MIN_EFFECT_PCT_STRONG) {
    const twoWindowPassed = checkTwoWindowStability(comparisons);
    if (twoWindowPassed) {
      return { confidence: "strong", twoWindowPassed: true };
    }
  }

  return { confidence: "emerging", twoWindowPassed: false };
}
