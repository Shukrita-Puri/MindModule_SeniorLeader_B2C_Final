// [KIND: constants] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Constants for Layer 5 Behaviours (Signals) Domain.
// Source: Part 2 Layer 5 (Section 4.3, 4.4).

import type { BehaviourSignalName } from "./types.ts";

/** Precedence rank table (1 highest, 10 lowest) from Section 4.4. */
export const SIGNAL_PRECEDENCE_MAP: Record<BehaviourSignalName, number> = {
  // Rank 1: Crisis
  crisis: 1,

  // Rank 2: Travel in-flight / landing / pre-flight
  travelLanding: 2,
  travelPreFlight: 2,
  travelInFlight: 2,
  longHaulRecovery: 2,
  circadianShift: 2,

  // Rank 3: Reentry
  reentry: 3,

  // Rank 4: High stakes anchors
  dualEmotionalStakes: 4,
  stackedStakes: 4,
  boardLevelOutcome: 4,
  upwardReporting: 4,
  interpersonalStakes: 4,
  prepWindowOpen: 4,
  standaloneSpeaking: 4,

  // Rank 5: State signals
  vetoRisk: 5,
  decisionLeakage: 5,
  readinessGap: 5,
  postPeak: 5,

  // Rank 6: Conference
  conferenceDay: 6,
  conferenceEve: 6,
  conferenceGapReset: 6,

  // Rank 7: Load & Shape of day
  denseDayMode: 7,
  contextSwitchingCost: 7,
  decisionDensityHigh: 7,
  multiCalendarLoad: 7,
  prepCliff: 7,

  // Rank 8: Availability / non-working day work
  workingNonWorkingDay: 8,

  // Rank 9: Carried recovery / build-up
  recoveryOwed: 9,
  stakesBuildUp: 9,
  postGovernanceOffload: 9,

  // Rank 10: Routine rhythms & background protection
  weekAhead: 10,
  morningAnchor: 10,
  eveningClose: 10,
  secondWind: 10,
  deepWorkProtection: 10,
};

/** Default chain hours to trigger dense day mode (Section 4.3). */
export const DENSE_DAY_CHAIN_HOURS_THRESHOLD = 4.0;
export const DENSE_DAY_HIGH_CHAIN_HOURS = 6.0;

/** Prep cliff window in minutes (Section 4.3). */
export const PREP_CLIFF_MEDIUM_MAX_MIN = 60;
export const PREP_CLIFF_HIGH_MAX_MIN = 30;

/** Signals suppressed when crisis is active (Section 4.4, Rank 1). */
export const CRISIS_SUPPRESSED_SIGNALS: BehaviourSignalName[] = [
  "weekAhead",
  "morningAnchor",
  "secondWind",
  "deepWorkProtection",
];
