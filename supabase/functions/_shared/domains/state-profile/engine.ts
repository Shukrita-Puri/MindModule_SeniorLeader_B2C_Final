// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// State Profile Engine.
// Evaluates all Pass 3 state engines and composes the canonical StateProfile.
// Source: Part 2 Layer 2 (Section 5.2).

import { evaluatePhysiology, type RawBiometrics, type BiometricBaselines } from "../physiology/index.ts";
import { evaluateSelfReport, type CheckInReading } from "../self-report/index.ts";
import { evaluateAgreement } from "../agreement/index.ts";
import { evaluateFit, type ScheduledDemandItem } from "../fit/index.ts";
import { evaluateTrajectory } from "../trajectory/index.ts";
import { evaluateGate, type HorizonCoverageInput } from "../gate/index.ts";
import { composeStateProfile } from "./composer.ts";
import type { StateProfile } from "./types.ts";
import type { PhysiologyTier } from "../physiology/types.ts";

export interface StateProfileEngineInput {
  rawBiometrics: RawBiometrics;
  baselines?: BiometricBaselines | null;
  checkIns?: CheckInReading[];
  scheduledItems?: ScheduledDemandItem[];
  hasCalendar: boolean;
  hasWearable: boolean;
  previousWindowTier?: PhysiologyTier | null;
  intradayHrBpm?: number | null;
  isCarriedOver?: boolean;
  nowUtc?: Date;
  coverageInput?: HorizonCoverageInput;
}

export class StateProfileEngine {
  public evaluate(input: StateProfileEngineInput): StateProfile {
    const now = input.nowUtc ?? new Date();

    // 1. Physiology
    const physiology = evaluatePhysiology({
      raw: input.rawBiometrics,
      baselines: input.baselines,
      nowUtc: now,
      isCarriedOver: input.isCarriedOver ?? false,
    });

    // 2. Self-Report
    const selfReport = evaluateSelfReport({
      baseTier: physiology.tier,
      checkIns: input.checkIns ?? [],
    });

    // 3. Agreement
    const agreement = evaluateAgreement({
      physiologyTier: physiology.tier,
      selfReportedTier: selfReport.selfReportedTier,
      physiologyFreshness: physiology.freshness,
    });

    // 4. Fit
    const fit = evaluateFit({
      refinedTier: selfReport.refinedTier,
      scheduledItems: input.scheduledItems ?? [],
      nowUtc: now,
    });

    // 5. Trajectory
    const trajectory = evaluateTrajectory({
      currentTier: selfReport.refinedTier,
      previousWindowTier: input.previousWindowTier,
      intradayHrBpm: input.intradayHrBpm,
      restingHrBaselineBpm: input.baselines?.restingHrBaselineBpm,
    });

    // 6. Gate
    const gate = evaluateGate({
      hasCalendar: input.hasCalendar,
      hasWearable: input.hasWearable,
      physiologyFreshness: physiology.freshness,
      isCarriedOver: input.isCarriedOver,
      hasCheckInToday: (input.checkIns && input.checkIns.length > 0) ?? false,
      coverageInput: input.coverageInput,
    });

    // 7. Compose State Profile
    return composeStateProfile({
      physiology,
      selfReport,
      agreement,
      fit,
      trajectory,
      gate,
      nowUtc: now,
    });
  }
}

export const stateProfileEngine = new StateProfileEngine();

export function evaluateStateProfile(input: StateProfileEngineInput): StateProfile {
  return stateProfileEngine.evaluate(input);
}
