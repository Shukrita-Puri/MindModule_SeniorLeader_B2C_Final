// [KIND: engine] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Prediction Verification and Hit Rate Engine (E-L4-8).
// Source: Part 2 Layer 4 (Section 9, Scenario L4-6, N-L4-7).

import type { ConfidenceTier, PredictionRecord } from "../types.ts";

export interface PatternAccuracyResult {
  stableKey: string;
  totalChecks: number;
  correctHits: number;
  hitRatePct: number;
  adjustedConfidence: ConfidenceTier;
  allowQuoting: boolean;
}

/**
 * Computes prediction hit-rate and adjusts confidence (Scenario L4-6).
 * If hit rate < 50% after 5+ checks, confidence is demoted one step.
 * If demoted from emerging or hit rate < 40%, stops being quoted at the gate.
 */
export function evaluatePredictionAccuracy(
  stableKey: string,
  baseConfidence: ConfidenceTier,
  predictions: PredictionRecord[]
): PatternAccuracyResult {
  const verified = predictions.filter(
    (p) => p.stableKey === stableKey && p.isCorrect !== undefined
  );

  if (verified.length < 5) {
    return {
      stableKey,
      totalChecks: verified.length,
      correctHits: verified.filter((p) => p.isCorrect).length,
      hitRatePct: 100,
      adjustedConfidence: baseConfidence,
      allowQuoting: true,
    };
  }

  const hits = verified.filter((p) => p.isCorrect).length;
  const hitRatePct = Math.round((hits / verified.length) * 100);

  // Scenario L4-6: 2 of 6 came true (33%) -> down a step; stops being quoted
  let adjustedConfidence = baseConfidence;
  let allowQuoting = true;

  if (hitRatePct < 50) {
    if (baseConfidence === "strong") {
      adjustedConfidence = "emerging";
    } else {
      adjustedConfidence = "insufficient_data";
      allowQuoting = false;
    }
  }

  if (hitRatePct < 40) {
    allowQuoting = false;
  }

  return {
    stableKey,
    totalChecks: verified.length,
    correctHits: hits,
    hitRatePct,
    adjustedConfidence,
    allowQuoting,
  };
}
