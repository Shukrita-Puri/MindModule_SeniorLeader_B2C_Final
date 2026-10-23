// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Agreement Domain Engine.
// Evaluates agreement between physiological state and self-reported state.
// Source: Part 2 Layer 2 (Section 5.1.3).

import type { PhysiologyTier } from "../physiology/types.ts";
import { CANONICAL_PHYSIOLOGY_TIERS } from "../physiology/constants.ts";
import { DIVERGENCE_TIER_THRESHOLD } from "./constants.ts";
import type { AgreementFacts, BodyMindDivergence, DivergenceDirection } from "./types.ts";

export interface AgreementEngineInput {
  physiologyTier: PhysiologyTier;
  selfReportedTier: PhysiologyTier | null;
  physiologyFreshness: "fresh" | "stale" | "missing";
}

export class AgreementEngine {
  public evaluate(input: AgreementEngineInput): AgreementFacts {
    // Without body data (no wearable, or stale): engine skipped and emits nothing
    if (
      input.physiologyFreshness === "missing" ||
      input.physiologyFreshness === "stale" ||
      input.physiologyTier === "uncalibrated"
    ) {
      return {
        hasDivergence: false,
        divergence: null,
        skippedReason: "missing_body_data",
      };
    }

    if (!input.selfReportedTier || input.selfReportedTier === "uncalibrated") {
      return {
        hasDivergence: false,
        divergence: null,
        skippedReason: "missing_self_report",
      };
    }

    const bodyIdx = CANONICAL_PHYSIOLOGY_TIERS.indexOf(input.physiologyTier as any);
    const selfIdx = CANONICAL_PHYSIOLOGY_TIERS.indexOf(input.selfReportedTier as any);

    if (bodyIdx === -1 || selfIdx === -1) {
      return {
        hasDivergence: false,
        divergence: null,
      };
    }

    const tierDiff = bodyIdx - selfIdx; // positive if bodyIdx > selfIdx (i.e. body is lower tier)
    const gapSize = Math.abs(tierDiff);

    if (gapSize < DIVERGENCE_TIER_THRESHOLD) {
      return {
        hasDivergence: false,
        divergence: null,
      };
    }

    const direction: DivergenceDirection = tierDiff > 0 ? "body_lower" : "body_higher";
    const summary =
      direction === "body_lower"
        ? `Body readiness (${input.physiologyTier}) is noticeably lower than self-reported state (${input.selfReportedTier})`
        : `Body readiness (${input.physiologyTier}) is noticeably higher than self-reported state (${input.selfReportedTier})`;

    const divergence: BodyMindDivergence = {
      direction,
      tierGapSize: gapSize,
      bodyTier: input.physiologyTier,
      selfReportTier: input.selfReportedTier,
      requiresSecondSignal: true, // Rule: divergence never raises state anchor without a second signal
      summary,
    };

    return {
      hasDivergence: true,
      divergence,
    };
  }
}

export const agreementEngine = new AgreementEngine();

export function evaluateAgreement(input: AgreementEngineInput): AgreementFacts {
  return agreementEngine.evaluate(input);
}
