// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step SR2: Apply check-in refine to physiology tier (at most one step).
// Source: Part 2 Layer 2 (Section 5.1.2, Step 2).

import type { PhysiologyTier } from "../../physiology/types.ts";
import { CANONICAL_PHYSIOLOGY_TIERS } from "../../physiology/constants.ts";
import {
  HIGH_SELF_REPORT_THRESHOLD,
  LOW_SELF_REPORT_THRESHOLD,
  MAX_CHECKIN_REFINE_STEPS,
} from "../constants.ts";
import type { RefineEffect } from "../types.ts";

export function stepRefinePhysiologyTier(
  baseTier: PhysiologyTier,
  compositeScore: number | null,
  selfReportedTier: PhysiologyTier | null
): {
  refinedTier: PhysiologyTier;
  refineEffect: RefineEffect;
  refineStepsApplied: number;
} {
  // If baseTier is uncalibrated, refinedTier takes selfReportedTier or stays uncalibrated
  if (baseTier === "uncalibrated") {
    return {
      refinedTier: selfReportedTier ?? "uncalibrated",
      refineEffect: "none",
      refineStepsApplied: 0,
    };
  }

  if (compositeScore === null) {
    return {
      refinedTier: baseTier,
      refineEffect: "none",
      refineStepsApplied: 0,
    };
  }

  const baseIndex = CANONICAL_PHYSIOLOGY_TIERS.indexOf(baseTier);
  if (baseIndex === -1) {
    return {
      refinedTier: baseTier,
      refineEffect: "none",
      refineStepsApplied: 0,
    };
  }

  // Lift by at most 1 step if self-report is high
  if (compositeScore >= HIGH_SELF_REPORT_THRESHOLD && baseIndex > 0) {
    const refinedIndex = Math.max(0, baseIndex - MAX_CHECKIN_REFINE_STEPS);
    return {
      refinedTier: CANONICAL_PHYSIOLOGY_TIERS[refinedIndex],
      refineEffect: "lifted",
      refineStepsApplied: 1,
    };
  }

  // Lower by at most 1 step if self-report is low
  if (
    compositeScore <= LOW_SELF_REPORT_THRESHOLD &&
    baseIndex < CANONICAL_PHYSIOLOGY_TIERS.length - 1
  ) {
    const refinedIndex = Math.min(
      CANONICAL_PHYSIOLOGY_TIERS.length - 1,
      baseIndex + MAX_CHECKIN_REFINE_STEPS
    );
    return {
      refinedTier: CANONICAL_PHYSIOLOGY_TIERS[refinedIndex],
      refineEffect: "lowered",
      refineStepsApplied: 1,
    };
  }

  return {
    refinedTier: baseTier,
    refineEffect: "none",
    refineStepsApplied: 0,
  };
}
