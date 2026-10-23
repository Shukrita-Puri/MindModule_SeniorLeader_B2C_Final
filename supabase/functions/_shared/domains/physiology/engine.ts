// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Physiology Domain Engine.
// Source: Part 2 Layer 2 (Section 5.1.1).

import type { PhysiologyFacts, RawBiometrics, BiometricBaselines } from "./types.ts";
import { stepEvaluateFreshness } from "./steps/rd1-freshness.ts";
import { stepComputePhysiologyScore } from "./steps/rd3-score-tier.ts";
import { stepDerivePills } from "./steps/rd4-pills.ts";

export interface PhysiologyEngineInput {
  raw: RawBiometrics;
  baselines?: BiometricBaselines | null;
  nowUtc?: Date;
  isCarriedOver?: boolean;
}

export class PhysiologyEngine {
  /**
   * Evaluates physiological readiness, MRS tier, signal pills, and caps.
   */
  public evaluate(input: PhysiologyEngineInput): PhysiologyFacts {
    const now = input.nowUtc ?? new Date();
    const freshness = stepEvaluateFreshness(input.raw, now);

    const { score, tier, capReason } = stepComputePhysiologyScore({
      raw: input.raw,
      baselines: input.baselines,
      freshness,
    });

    const pills = stepDerivePills({
      raw: input.raw,
      baselines: input.baselines,
      freshness,
    });

    return {
      score,
      tier,
      capReason,
      pills,
      rawSignals: input.raw,
      freshness,
      isCarriedOver: input.isCarriedOver ?? false,
    };
  }
}

export const physiologyEngine = new PhysiologyEngine();

export function evaluatePhysiology(input: PhysiologyEngineInput): PhysiologyFacts {
  return physiologyEngine.evaluate(input);
}
