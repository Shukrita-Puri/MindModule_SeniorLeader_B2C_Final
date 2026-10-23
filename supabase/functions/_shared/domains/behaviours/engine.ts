// [KIND: engine] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Behaviour Signals Engine (SIG).
// Evaluates shared behaviour signals across all families with precedence and suppression.
// Source: Part 2 Layer 5 (Section 4).

import type { BehaviourSignal } from "./types.ts";
import { CRISIS_SUPPRESSED_SIGNALS } from "./constants.ts";
import { evaluateLoadSignals } from "./steps/step-s1-load.ts";
import { evaluateStakesSignals } from "./steps/step-s2-stakes.ts";
import { evaluateStateSignals } from "./steps/step-s3-state.ts";
import { evaluateTravelSignals } from "./steps/step-s4-travel.ts";
import { evaluateConferenceSignals } from "./steps/step-s5-conference.ts";
import { evaluateAvailabilitySignals } from "./steps/step-s6-availability.ts";
import { evaluateCrisisSignals } from "./steps/step-s7-crisis.ts";

export class BehaviourEngine {
  public evaluate(bundle: any): BehaviourSignal[] {
    // 1. Gather signals from all 7 families
    const rawSignals: BehaviourSignal[] = [
      ...evaluateLoadSignals(bundle),
      ...evaluateStakesSignals(bundle),
      ...evaluateStateSignals(bundle),
      ...evaluateTravelSignals(bundle),
      ...evaluateConferenceSignals(bundle),
      ...evaluateAvailabilitySignals(bundle),
      ...evaluateCrisisSignals(bundle),
    ];

    const hasCrisis = rawSignals.some((s) => s.name === "crisis");
    const hasTravel = rawSignals.some((s) => s.precedenceRank === 2);

    // 2. Apply Section 4.4 Precedence and Suppression Rules
    const filteredSignals = rawSignals.filter((signal) => {
      // Crisis suppression (Rank 1)
      if (hasCrisis && CRISIS_SUPPRESSED_SIGNALS.includes(signal.name)) {
        return false;
      }

      // Travel suppression (Rank 2)
      if (hasTravel && (signal.name === "secondWind" || signal.name === "deepWorkProtection" || signal.name === "prepCliff")) {
        return false;
      }

      return true;
    });

    // 3. Sort by precedence rank ascending (1 = highest priority)
    return filteredSignals.sort((a, b) => a.precedenceRank - b.precedenceRank);
  }
}

export const behaviourEngine = new BehaviourEngine();

export function evaluateBehaviourSignals(bundle: any): BehaviourSignal[] {
  return behaviourEngine.evaluate(bundle);
}
