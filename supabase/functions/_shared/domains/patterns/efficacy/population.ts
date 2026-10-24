// [KIND: step] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Population priors and Empirical Bayes shrinkage.
// Source: Part 2 Layer 4 (Section 7B, N-L4-16, Scenario L4-15).

import {
  MIN_POPULATION_USERS,
  SHRINKAGE_K,
} from "../constants.ts";

export interface ShrinkageParams {
  observedRate: number; // 0.0 to 1.0
  sampleN: number;
  populationUserCount: number;
  populationRate?: number; // e.g. average rate across users
}

/**
 * Applies Empirical Bayes shrinkage with k = 5 (Section 7B).
 * If population user count < 20, the population rate is not used; prior defaults to 0.5 (Scenario L4-15).
 */
export function computeShrunkRate(params: ShrinkageParams): number {
  const { observedRate, sampleN, populationUserCount, populationRate } = params;

  // Scenario L4-15: fewer than 20 users -> use neutral 0.5 prior
  const prior =
    populationUserCount >= MIN_POPULATION_USERS && typeof populationRate === "number"
      ? populationRate
      : 0.5;

  const k = SHRINKAGE_K;
  const shrunk = (sampleN * observedRate + k * prior) / (sampleN + k);
  return Math.round(shrunk * 100) / 100;
}
