// [KIND: step] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Step S1: Evaluate Load & Shape of Day Signals.
// Source: Part 2 Layer 5 (Section 4.3).

import type { BehaviourSignal } from "../types.ts";
import { SIGNAL_PRECEDENCE_MAP } from "../constants.ts";

export function evaluateLoadSignals(bundle: any): BehaviourSignal[] {
  const signals: BehaviourSignal[] = [];

  const mix = bundle.dayProfile?.mix;
  const load = bundle.dayProfile?.load;
  const phase = bundle.windowProfile?.phase;
  const minsToNextHighStakes = bundle.windowProfile?.minutesToNextHighStakes;

  // 1. denseDayMode
  const chainHours = mix?.backToBack?.longestChainHours ?? 0;
  const contextSwitching = mix?.contextSwitching?.level ?? "low";

  if (chainHours >= 4.0) {
    const isHigh = chainHours >= 6.0 || contextSwitching === "high";
    signals.push({
      name: "denseDayMode",
      severity: isHigh ? "high" : "medium",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.denseDayMode,
      evidencePointers: [`L2 mix: ${chainHours}h longest chain`, `switching: ${contextSwitching}`],
      reason: `Consecutive back-to-back chain of ${chainHours}h requires dense-day communication limits`,
    });
  }

  // 2. contextSwitchingCost
  if (contextSwitching === "high" || contextSwitching === "medium") {
    signals.push({
      name: "contextSwitchingCost",
      severity: contextSwitching === "high" ? "high" : "medium",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.contextSwitchingCost,
      evidencePointers: [`L2 mix switching: ${contextSwitching}`],
      reason: `Context switching level is ${contextSwitching}; cognitive switching drain active`,
    });
  }

  // 3. prepCliff
  if (minsToNextHighStakes != null && minsToNextHighStakes <= 60 && minsToNextHighStakes > 0) {
    const isHigh = minsToNextHighStakes <= 30;
    signals.push({
      name: "prepCliff",
      severity: isHigh ? "high" : "medium",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.prepCliff,
      evidencePointers: [`L2 window: ${minsToNextHighStakes}m until high stakes item`],
      reason: `Pre-meeting window closing (${minsToNextHighStakes}m remaining); transition buffer closing`,
    });
  }

  // 4. decisionDensityHigh
  if (load?.decisionHeavy) {
    signals.push({
      name: "decisionDensityHigh",
      severity: "high",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.decisionDensityHigh,
      evidencePointers: ["L2 load: decisionHeavy flag active"],
      reason: "Elevated cluster of high-consequence decision items today",
    });
  }

  return signals;
}
