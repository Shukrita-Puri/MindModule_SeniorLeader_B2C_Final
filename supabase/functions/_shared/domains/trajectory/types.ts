// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Types for Layer 2 Trajectory Domain.
// Source: Part 2 Layer 2 (Section 5.1.5).

import type { PhysiologyTier } from "../physiology/types.ts";

export type StateChangeDirection = "up" | "flat" | "down";

export interface HrDriftFact {
  isDriftingUp: boolean;
  percentDrift: number;
  currentHrBpm: number;
  baselineHrBpm: number;
}

export interface TrajectoryFacts {
  stateChange: StateChangeDirection;
  hrDrift: HrDriftFact | null;
  stateExpectedVsActual: "better" | "expected" | "worse";
}
