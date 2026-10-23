// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Physiology Domain Types.
// Source: Part 2 Layer 2 (Section 5.1.1).

import type { CANONICAL_PHYSIOLOGY_TIERS } from "./constants.ts";

export type PhysiologyTier = (typeof CANONICAL_PHYSIOLOGY_TIERS)[number] | "uncalibrated";

export type PillColor = "green" | "amber" | "red" | "grey";

export interface SignalPill {
  name: "decision_readiness" | "physical_reserves" | "resilience_capacity";
  color: PillColor;
  score: number; // 0–100
  freshness: "fresh" | "stale" | "missing";
  contributors: string[];
}

export interface RawBiometrics {
  hrvMs?: number | null;
  restingHrBpm?: number | null;
  sleepMinutes?: number | null;
  sleepEfficiencyPercent?: number | null;
  readingTimestampUtc?: string | null;
}

export interface BiometricBaselines {
  hrvBaselineMs: number;
  restingHrBaselineBpm: number;
  sleepBaselineMinutes: number;
}

export interface PhysiologyFacts {
  score: number | null; // 0–100 or null when uncalibrated
  tier: PhysiologyTier;
  capReason: string | null;
  pills: {
    decisionReadiness: SignalPill;
    physicalReserves: SignalPill;
    resilienceCapacity: SignalPill;
  };
  rawSignals: RawBiometrics;
  freshness: "fresh" | "stale" | "missing";
  isCarriedOver: boolean;
}
