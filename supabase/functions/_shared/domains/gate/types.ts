// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Types for Layer 2 Gate Domain.
// Source: Part 2 Layer 2 (Section 5.1.6).

export type StateConfidenceLevel = "high" | "moderate" | "low";

export interface HorizonScore {
  coverage: number; // 0.0 - 1.0
  quality: number; // 0.0 - 1.0
  blended: number; // coverage * quality
}

export interface HorizonCoverageFacts {
  version: number;
  immediate: HorizonScore;
  tactical: HorizonScore;
  strategic: HorizonScore;
  weightTier: "T0" | "T1" | "T2" | "T3";
}

export interface GateFacts {
  isOpen: boolean;
  cardsAwaiting: boolean;
  reason: string | null;
  stateConfidence: StateConfidenceLevel;
  wearableLessMode: boolean;
  horizonCoverage: HorizonCoverageFacts;
}
