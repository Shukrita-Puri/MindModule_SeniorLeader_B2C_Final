// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Trajectory Domain Engine.
// Evaluates state change across windows, intraday HR drift, and expected vs actual trajectory.
// Source: Part 2 Layer 2 (Section 5.1.5).

import type { PhysiologyTier } from "../physiology/types.ts";
import { CANONICAL_PHYSIOLOGY_TIERS } from "../physiology/constants.ts";
import { HR_DRIFT_THRESHOLD_RATIO } from "./constants.ts";
import type { HrDriftFact, StateChangeDirection, TrajectoryFacts } from "./types.ts";

export interface TrajectoryEngineInput {
  currentTier: PhysiologyTier;
  previousWindowTier?: PhysiologyTier | null;
  intradayHrBpm?: number | null;
  restingHrBaselineBpm?: number | null;
  expectedTrajectoryTier?: PhysiologyTier | null;
}

export class TrajectoryEngine {
  public evaluate(input: TrajectoryEngineInput): TrajectoryFacts {
    // 1. State change compared to previous window
    let stateChange: StateChangeDirection = "flat";
    const currentIdx = CANONICAL_PHYSIOLOGY_TIERS.indexOf(input.currentTier as any);
    const prevIdx = input.previousWindowTier
      ? CANONICAL_PHYSIOLOGY_TIERS.indexOf(input.previousWindowTier as any)
      : -1;

    if (currentIdx !== -1 && prevIdx !== -1) {
      if (currentIdx < prevIdx) {
        stateChange = "up"; // Lower index = higher tier
      } else if (currentIdx > prevIdx) {
        stateChange = "down"; // Higher index = lower tier
      }
    }

    // 2. Intraday HR drift
    let hrDrift: HrDriftFact | null = null;
    if (
      input.intradayHrBpm != null &&
      input.restingHrBaselineBpm != null &&
      input.restingHrBaselineBpm > 0
    ) {
      const drift =
        (input.intradayHrBpm - input.restingHrBaselineBpm) / input.restingHrBaselineBpm;
      const percentDrift = Math.round(drift * 100);
      const isDriftingUp = drift >= HR_DRIFT_THRESHOLD_RATIO;

      hrDrift = {
        isDriftingUp,
        percentDrift,
        currentHrBpm: input.intradayHrBpm,
        baselineHrBpm: input.restingHrBaselineBpm,
      };
    }

    // 3. Expected vs Actual trajectory
    let stateExpectedVsActual: "better" | "expected" | "worse" = "expected";
    if (input.expectedTrajectoryTier) {
      const expIdx = CANONICAL_PHYSIOLOGY_TIERS.indexOf(
        input.expectedTrajectoryTier as any
      );
      if (currentIdx !== -1 && expIdx !== -1) {
        if (currentIdx < expIdx) stateExpectedVsActual = "better";
        else if (currentIdx > expIdx) stateExpectedVsActual = "worse";
      }
    }

    return {
      stateChange,
      hrDrift,
      stateExpectedVsActual,
    };
  }
}

export const trajectoryEngine = new TrajectoryEngine();

export function evaluateTrajectory(input: TrajectoryEngineInput): TrajectoryFacts {
  return trajectoryEngine.evaluate(input);
}
