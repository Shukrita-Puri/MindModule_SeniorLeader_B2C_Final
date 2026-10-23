// [KIND: step] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Step S5: Evaluate Conference Signals.
// Source: Part 2 Layer 5 (Section 4.3).

import type { BehaviourSignal } from "../types.ts";
import { SIGNAL_PRECEDENCE_MAP } from "../constants.ts";

export function evaluateConferenceSignals(bundle: any): BehaviourSignal[] {
  const signals: BehaviourSignal[] = [];
  const conf = bundle.dayProfile?.conference;

  if (!conf?.isConferenceDay) {
    return signals;
  }

  // 1. conferenceDay
  const isSpeaking = conf.role === "speaking";
  signals.push({
    name: "conferenceDay",
    severity: isSpeaking ? "high" : "medium",
    fired: true,
    precedenceRank: SIGNAL_PRECEDENCE_MAP.conferenceDay,
    evidencePointers: [`L2 conference: Day ${conf.dayNumber ?? 1} of ${conf.totalDays ?? 1}, role: ${conf.role}`],
    reason: `Multi-session conference day active (role: ${conf.role})`,
  });

  // 2. standaloneSpeaking
  if (conf.standaloneSpeaking) {
    signals.push({
      name: "standaloneSpeaking",
      severity: "high",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.standaloneSpeaking,
      evidencePointers: ["L2 conference: standaloneSpeaking flag active"],
      reason: "High stakes drop-in standalone keynote or presentation",
    });
  }

  return signals;
}
