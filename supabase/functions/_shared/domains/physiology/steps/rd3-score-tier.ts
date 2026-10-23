// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step RD3: Physiology Score, Tier, and Cap Evaluation.
// Source: Part 2 Layer 2 (Section 5.1.1, RD3).

import type { RawBiometrics, BiometricBaselines, PhysiologyTier } from "../types.ts";
import { HRV_DEFICIT_RATIO, SHORT_SLEEP_MINUTES } from "../constants.ts";

export function stepComputePhysiologyScore(params: {
  raw: RawBiometrics;
  baselines?: BiometricBaselines | null;
  freshness: "fresh" | "stale" | "missing";
}): {
  score: number | null;
  tier: PhysiologyTier;
  capReason: string | null;
} {
  if (params.freshness === "missing" || params.freshness === "stale") {
    return {
      score: null,
      tier: "uncalibrated",
      capReason: params.freshness === "missing" ? "No wearable readings available" : "Wearable readings are stale (>24h)",
    };
  }

  const baselines = params.baselines ?? {
    hrvBaselineMs: 50,
    restingHrBaselineBpm: 60,
    sleepBaselineMinutes: 450, // 7.5h
  };

  const rawHrv = params.raw.hrvMs ?? baselines.hrvBaselineMs;
  const rawRhr = params.raw.restingHrBpm ?? baselines.restingHrBaselineBpm;
  const rawSleep = params.raw.sleepMinutes ?? baselines.sleepBaselineMinutes;

  // Normalized ratios
  const hrvRatio = rawHrv / baselines.hrvBaselineMs; // >1 is good, <1 is deficit
  const rhrRatio = baselines.restingHrBaselineBpm / Math.max(1, rawRhr); // higher RHR is worse
  const sleepRatio = rawSleep / baselines.sleepBaselineMinutes;

  // Weighted score (0–100)
  let rawScore = Math.round((hrvRatio * 40 + rhrRatio * 30 + sleepRatio * 30));
  rawScore = Math.max(0, Math.min(100, rawScore));

  let tier: PhysiologyTier = "steady";
  if (rawScore >= 85) tier = "optimal";
  else if (rawScore >= 70) tier = "primed";
  else if (rawScore >= 55) tier = "steady";
  else if (rawScore >= 40) tier = "managing";
  else if (rawScore >= 25) tier = "depleted";
  else tier = "overloaded";

  let capReason: string | null = null;

  // Check caps (RD-01): HRV >= 15% deficit or short sleep (<6h) caps tier at 'managing'
  const hrvDeficit = (baselines.hrvBaselineMs - rawHrv) / baselines.hrvBaselineMs;
  if (hrvDeficit >= HRV_DEFICIT_RATIO && rawSleep < SHORT_SLEEP_MINUTES) {
    if (tier === "optimal" || tier === "primed" || tier === "steady") {
      tier = "managing";
      capReason = "HRV 15%+ below baseline and short sleep (<6h)";
      rawScore = Math.min(48, rawScore);
    }
  } else if (hrvDeficit >= HRV_DEFICIT_RATIO) {
    if (tier === "optimal" || tier === "primed") {
      tier = "steady";
      capReason = "HRV 15%+ below baseline";
      rawScore = Math.min(62, rawScore);
    }
  }

  return {
    score: rawScore,
    tier,
    capReason,
  };
}
