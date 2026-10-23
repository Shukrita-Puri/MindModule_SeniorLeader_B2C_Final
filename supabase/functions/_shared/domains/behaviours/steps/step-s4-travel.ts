// [KIND: step] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Step S4: Evaluate Travel Signals.
// Source: Part 2 Layer 5 (Section 4.3).

import type { BehaviourSignal } from "../types.ts";
import { SIGNAL_PRECEDENCE_MAP } from "../constants.ts";

export function evaluateTravelSignals(bundle: any): BehaviourSignal[] {
  const signals: BehaviourSignal[] = [];
  const travel = bundle.dayProfile?.travel;
  const contextual = bundle.dayProfile?.contextualFacts;

  if (!travel?.isTravelling && !contextual?.reentryRisk) {
    return signals;
  }

  // 1. travelLanding
  if (travel?.travelPhase === "in_transit" || travel?.travelPhase === "destination") {
    signals.push({
      name: "travelLanding",
      severity: "high",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.travelLanding,
      evidencePointers: [`L2 travel phase: ${travel.travelPhase}`],
      reason: "Transit/landing phase active; protect re-entry and pacing",
    });
  }

  // 2. circadianShift
  if (travel?.timeZoneShiftHours != null && Math.abs(travel.timeZoneShiftHours) >= 3) {
    signals.push({
      name: "circadianShift",
      severity: "high",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.circadianShift,
      evidencePointers: [`L2 travel: ${travel.timeZoneShiftHours}h time zone shift`],
      reason: "Substantial circadian time-zone shift requiring biological clock anchoring",
    });
  }

  // 3. reentry
  if (contextual?.reentryRisk || contextual?.firstDayBack) {
    signals.push({
      name: "reentry",
      severity: "medium",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.reentry,
      evidencePointers: ["L2 day profile: reentryRisk / firstDayBack active"],
      reason: "Return from multi-day trip or leave; re-entry compression risk",
    });
  }

  return signals;
}
