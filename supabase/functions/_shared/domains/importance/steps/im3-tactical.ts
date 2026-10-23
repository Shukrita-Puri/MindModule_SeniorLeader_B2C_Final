// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step IM3: Tactical Signals with Decay.
// Source: Part 2 Layer 2 (Section 4.9, IM3, N-IM3).

import type { CandidateItem } from "./im1-candidates.ts";
import type { AnchorEvidence } from "../types.ts";
import { SKIP_HALF_LIFE_DAYS } from "../constants.ts";

export interface TacticalInputData {
  patternElevatedHeartRate?: boolean;
  heartRateDeltaPercent?: number;
  pastOccurrenceCount?: number;
  recentOutcomeReviewBad?: boolean;
  skipDaysAgo?: number | null;
}

export function stepTacticalScore(
  candidate: CandidateItem,
  tacticalData?: TacticalInputData,
): {
  tactical: number; // T
  evidence: AnchorEvidence[];
} {
  const evidence: AnchorEvidence[] = [];
  let tactical = 20; // baseline tactical

  if (tacticalData?.patternElevatedHeartRate) {
    const delta = tacticalData.heartRateDeltaPercent ?? 40;
    const basis = tacticalData.pastOccurrenceCount ?? 3;
    tactical += 25;
    evidence.push({
      horizon: "tactical",
      sourceLayer: "L4 patterns",
      fact: "Elevated heart rate pattern detected on past occurrences",
      measure: `+${delta}% HR above baseline`,
      basis: `Last ${basis} occurrences`,
      confidence: "high",
    });
  }

  if (tacticalData?.recentOutcomeReviewBad) {
    tactical += 15;
    evidence.push({
      horizon: "tactical",
      sourceLayer: "T2 memory",
      fact: "User outcome review flagged difficulty on previous occurrence",
      confidence: "medium",
    });
  }

  // Tactical skip decay: 0.5^(age / 30) (N-IM3)
  if (typeof tacticalData?.skipDaysAgo === "number") {
    const decayMultiplier = Math.pow(0.5, tacticalData.skipDaysAgo / SKIP_HALF_LIFE_DAYS);
    const skipPenalty = Math.round(15 * decayMultiplier);
    tactical = Math.max(0, tactical - skipPenalty);
    if (skipPenalty > 2) {
      evidence.push({
        horizon: "tactical",
        sourceLayer: "T2 memory",
        fact: "Decayed skip penalty applied",
        measure: `-${skipPenalty} pts (age: ${tacticalData.skipDaysAgo}d)`,
        confidence: "medium",
      });
    }
  }

  return {
    tactical: Math.min(100, tactical),
    evidence,
  };
}
