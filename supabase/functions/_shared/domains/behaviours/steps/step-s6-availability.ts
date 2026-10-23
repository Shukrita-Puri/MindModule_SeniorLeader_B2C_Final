// [KIND: step] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Step S6: Evaluate Availability & Rhythm Signals.
// Source: Part 2 Layer 5 (Section 4.3).

import type { BehaviourSignal } from "../types.ts";
import { SIGNAL_PRECEDENCE_MAP } from "../constants.ts";

export function evaluateAvailabilitySignals(bundle: any): BehaviourSignal[] {
  const signals: BehaviourSignal[] = [];

  const dayProfile = bundle.dayProfile;
  const windowProfile = bundle.windowProfile;
  const load = dayProfile?.load;
  const weekAhead = dayProfile?.weekAhead;
  const contextual = dayProfile?.contextualFacts;

  // 1. workingNonWorkingDay
  if (load?.workOnNonWorkingDay?.isWorkOnNonWorkingDay) {
    const isFull = load.workOnNonWorkingDay.isFullWorkingDay;
    signals.push({
      name: "workingNonWorkingDay",
      severity: isFull ? "high" : "medium",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.workingNonWorkingDay,
      evidencePointers: [`L2 load: work on non-working day (${load.workOnNonWorkingDay.label})`],
      reason: `Active work commitments on a scheduled non-working day (${load.workOnNonWorkingDay.label})`,
    });
  }

  // 2. weekAhead
  if (weekAhead?.isActive) {
    signals.push({
      name: "weekAhead",
      severity: "medium",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.weekAhead,
      evidencePointers: [`L2 week ahead: active mode (${weekAhead.reason})`],
      reason: "Weekly look-ahead planning mode active",
    });
  }

  // 3. morningAnchor
  if (windowProfile?.window === "morning") {
    signals.push({
      name: "morningAnchor",
      severity: "low",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.morningAnchor,
      evidencePointers: ["L2 window: morning window set up mode"],
      reason: "Morning baseline orientation and day setup",
    });
  }

  // 4. eveningClose
  if (windowProfile?.window === "evening") {
    signals.push({
      name: "eveningClose",
      severity: "low",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.eveningClose,
      evidencePointers: ["L2 window: evening window close mode"],
      reason: "Evening day closure and recovery protection",
    });
  }

  // 5. recoveryOwed
  if (contextual?.recoveryOwed) {
    signals.push({
      name: "recoveryOwed",
      severity: "medium",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.recoveryOwed,
      evidencePointers: ["L2 contextual: recoveryOwed flag active"],
      reason: "Cumulative physiological debt requires protected pacing and rest",
    });
  }

  return signals;
}
