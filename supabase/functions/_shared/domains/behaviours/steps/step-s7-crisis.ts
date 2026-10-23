// [KIND: step] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Step S7: Evaluate Crisis Signals.
// Source: Part 2 Layer 5 (Section 4.3).

import type { BehaviourSignal } from "../types.ts";
import { SIGNAL_PRECEDENCE_MAP } from "../constants.ts";

export function evaluateCrisisSignals(bundle: any): BehaviourSignal[] {
  const signals: BehaviourSignal[] = [];
  const crisis = bundle.dayProfile?.crisis;

  if (crisis?.isCrisisDay) {
    signals.push({
      name: "crisis",
      severity: "high",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.crisis,
      evidencePointers: [`L2 crisis: active episode (${crisis.activeEpisode?.state})`],
      reason: "Urgent crisis episode active; overrides normal rhythms with crisis stabilization",
    });
  }

  return signals;
}
