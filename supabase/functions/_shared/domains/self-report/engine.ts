// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Self-Report Domain Engine.
// Source: Part 2 Layer 2 (Section 5.1.2).

import type { PhysiologyTier } from "../physiology/types.ts";
import type { CheckInReading, SelfReportFacts } from "./types.ts";
import { stepExtractLatestCheckIn } from "./steps/sr1-latest-checkin.ts";
import { stepRefinePhysiologyTier } from "./steps/sr2-refine-tier.ts";

export interface SelfReportEngineInput {
  baseTier: PhysiologyTier;
  checkIns: CheckInReading[];
}

export class SelfReportEngine {
  public evaluate(input: SelfReportEngineInput): SelfReportFacts {
    const { latest, composite, selfReportedTier } = stepExtractLatestCheckIn(input.checkIns);
    const { refinedTier, refineEffect, refineStepsApplied } = stepRefinePhysiologyTier(
      input.baseTier,
      composite,
      selfReportedTier
    );

    return {
      checkIn: latest,
      compositeScore: composite,
      selfReportedTier,
      refinedTier,
      refineEffect,
      refineStepsApplied,
    };
  }
}

export const selfReportEngine = new SelfReportEngine();

export function evaluateSelfReport(input: SelfReportEngineInput): SelfReportFacts {
  return selfReportEngine.evaluate(input);
}
