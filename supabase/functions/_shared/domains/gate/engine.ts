// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Gate Domain Engine.
// Evaluates app readiness to speak (gate), cards awaiting status, confidence, and horizon coverage.
// Source: Part 2 Layer 2 (Section 5.1.6).

import {
  HorizonCoverageInput,
  stepComputeHorizonCoverage,
} from "./steps/n-cg1-coverage.ts";
import type { GateFacts, StateConfidenceLevel } from "./types.ts";

export interface GateEngineInput {
  hasCalendar: boolean;
  hasWearable: boolean;
  physiologyFreshness: "fresh" | "stale" | "missing";
  isCarriedOver?: boolean;
  hasCheckInToday?: boolean;
  coverageInput?: HorizonCoverageInput;
}

export class GateEngine {
  public evaluate(input: GateEngineInput): GateFacts {
    const wearableLessMode = !input.hasWearable;
    let isOpen = true;
    let cardsAwaiting = false;
    let reason: string | null = null;
    let stateConfidence: StateConfidenceLevel = "high";

    // 1. Calendar disconnected: gate closes immediately (ST-06)
    if (!input.hasCalendar) {
      isOpen = false;
      cardsAwaiting = true;
      reason = "Calendar is disconnected";
      stateConfidence = "low";
    }
    // 2. Wearable connected but missing data: gate closes with cards awaiting
    else if (input.hasWearable && input.physiologyFreshness === "missing") {
      isOpen = false;
      cardsAwaiting = true;
      reason = "Wearable data hasn't synced yet";
      stateConfidence = "low";
    }
    // 3. Wearable-less mode: check-ins only, lower confidence (ST-05)
    else if (wearableLessMode) {
      isOpen = true;
      cardsAwaiting = false;
      reason = "Wearable-less mode; check-ins only";
      stateConfidence = input.hasCheckInToday ? "moderate" : "low";
    }
    // 4. Stale wearable readings: gate stays open but with lower confidence
    else if (input.physiologyFreshness === "stale") {
      isOpen = true;
      cardsAwaiting = false;
      reason = "Wearable data is stale (>24h)";
      stateConfidence = "low";
    } else if (input.isCarriedOver) {
      stateConfidence = "moderate";
    }

    // 5. Horizon coverage (N-CG1, N-CG2)
    const covInput: HorizonCoverageInput = input.coverageInput ?? {
      hasClassifiedItemsToday: input.hasCalendar,
      hasFreshWearableReading: input.physiologyFreshness === "fresh",
      hasCheckInToday: input.hasCheckInToday ?? false,
    };
    const horizonCoverage = stepComputeHorizonCoverage(covInput);

    return {
      isOpen,
      cardsAwaiting,
      reason,
      stateConfidence,
      wearableLessMode,
      horizonCoverage,
    };
  }
}

export const gateEngine = new GateEngine();

export function evaluateGate(input: GateEngineInput): GateFacts {
  return gateEngine.evaluate(input);
}
