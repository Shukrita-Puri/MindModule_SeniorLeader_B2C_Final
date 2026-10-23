// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step N-CG1 & N-CG2: Horizon coverage and weight tier derivation.
// Source: Part 2 Layer 2 (Section 5.1.6, N-CG1, N-CG2).

import {
  STRATEGIC_FLOOR_QUALITY_DAYS,
  STRATEGIC_FULL_QUALITY_DAYS,
  STRATEGIC_GOALS_TARGET,
  TACTICAL_PATTERN_TARGET,
  TACTICAL_WEARABLE_DAYS_TARGET,
  WEARABLE_QUALITY_FULL_HOURS,
  WEARABLE_QUALITY_ZERO_HOURS,
} from "../constants.ts";
import type { HorizonCoverageFacts, HorizonScore } from "../types.ts";

export interface HorizonCoverageInput {
  // Immediate
  hasClassifiedItemsToday: boolean;
  hasFreshWearableReading: boolean;
  hasCheckInToday: boolean;
  wearableAgeHours?: number | null;

  // Tactical
  patternsCountWith3PlusOccurrences?: number;
  wearableDaysInLast30?: number;
  meanPatternConfidence?: number; // 0.0 - 1.0 (strong=1.0, emerging=0.6)

  // Strategic
  declaredGoalsCount?: number;
  daysSinceGoalsConfirmed?: number;

  // Account age floor
  accountAgeDays?: number;
}

export function stepComputeHorizonCoverage(
  input: HorizonCoverageInput
): HorizonCoverageFacts {
  // 1. Immediate Horizon
  // Classified items (1), fresh wearable reading (1), today's checkin (1)
  let immFound = 0;
  if (input.hasClassifiedItemsToday) immFound += 1;
  if (input.hasFreshWearableReading) immFound += 1;
  if (input.hasCheckInToday) immFound += 1;
  const immCoverage = immFound / 3.0;

  // Quality is wearable's age (1.0 up to 12h, falling to 0 at 36h)
  let immQuality = 1.0;
  if (input.wearableAgeHours != null) {
    if (input.wearableAgeHours <= WEARABLE_QUALITY_FULL_HOURS) {
      immQuality = 1.0;
    } else if (input.wearableAgeHours >= WEARABLE_QUALITY_ZERO_HOURS) {
      immQuality = 0.0;
    } else {
      const span = WEARABLE_QUALITY_ZERO_HOURS - WEARABLE_QUALITY_FULL_HOURS;
      immQuality = Math.max(
        0,
        1.0 - (input.wearableAgeHours - WEARABLE_QUALITY_FULL_HOURS) / span
      );
    }
  } else if (!input.hasFreshWearableReading) {
    immQuality = 0.5;
  }

  const immediate: HorizonScore = {
    coverage: Number(immCoverage.toFixed(2)),
    quality: Number(immQuality.toFixed(2)),
    blended: Number((immCoverage * immQuality).toFixed(2)),
  };

  // 2. Tactical Horizon
  // Patterns (target 6), days with wearable data in last 30 (target 21)
  const patterns = Math.min(1.0, (input.patternsCountWith3PlusOccurrences ?? 0) / TACTICAL_PATTERN_TARGET);
  const daysWearable = Math.min(1.0, (input.wearableDaysInLast30 ?? 0) / TACTICAL_WEARABLE_DAYS_TARGET);
  const tacCoverage = (patterns + daysWearable) / 2.0;
  const tacQuality = input.meanPatternConfidence ?? 0.8;

  const tactical: HorizonScore = {
    coverage: Number(tacCoverage.toFixed(2)),
    quality: Number(tacQuality.toFixed(2)),
    blended: Number((tacCoverage * tacQuality).toFixed(2)),
  };

  // 3. Strategic Horizon
  // Declared goals (target 2); quality is recency (1.0 up to 180 days, 0.3 at 365)
  const stratCoverage = Math.min(
    1.0,
    (input.declaredGoalsCount ?? 0) / STRATEGIC_GOALS_TARGET
  );
  let stratQuality = 1.0;
  const daysConfirmed = input.daysSinceGoalsConfirmed ?? 0;
  if (daysConfirmed <= STRATEGIC_FULL_QUALITY_DAYS) {
    stratQuality = 1.0;
  } else if (daysConfirmed >= STRATEGIC_FLOOR_QUALITY_DAYS) {
    stratQuality = 0.3;
  } else {
    const span = STRATEGIC_FLOOR_QUALITY_DAYS - STRATEGIC_FULL_QUALITY_DAYS;
    const progress = (daysConfirmed - STRATEGIC_FULL_QUALITY_DAYS) / span;
    stratQuality = 1.0 - progress * 0.7; // drops from 1.0 to 0.3
  }

  const strategic: HorizonScore = {
    coverage: Number(stratCoverage.toFixed(2)),
    quality: Number(stratQuality.toFixed(2)),
    blended: Number((stratCoverage * stratQuality).toFixed(2)),
  };

  // 4. Weight Tier derivation (N-CG2)
  // Tactical blended score: T0 < 0.25, T1 < 0.50, T2 < 0.75, T3 >= 0.75
  let tierScore = tactical.blended;
  let coverageTier: "T0" | "T1" | "T2" | "T3" = "T0";
  if (tierScore >= 0.75) coverageTier = "T3";
  else if (tierScore >= 0.5) coverageTier = "T2";
  else if (tierScore >= 0.25) coverageTier = "T1";
  else coverageTier = "T0";

  // Account age as a floor (take the lower of age tier and coverage tier)
  const ageDays = input.accountAgeDays ?? 30;
  let ageTier: "T0" | "T1" | "T2" | "T3" = "T0";
  if (ageDays >= 30) ageTier = "T3";
  else if (ageDays >= 14) ageTier = "T2";
  else if (ageDays >= 7) ageTier = "T1";
  else ageTier = "T0";

  const tierRank = { T0: 0, T1: 1, T2: 2, T3: 3 };
  const minRank = Math.min(tierRank[coverageTier], tierRank[ageTier]) as 0 | 1 | 2 | 3;
  const weightTier = (["T0", "T1", "T2", "T3"] as const)[minRank];

  return {
    version: 1,
    immediate,
    tactical,
    strategic,
    weightTier,
  };
}
