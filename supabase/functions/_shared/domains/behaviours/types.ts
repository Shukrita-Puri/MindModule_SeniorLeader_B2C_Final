// [KIND: types] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Types for Layer 5 Behaviours (Signals) Domain.
// Source: Part 2 Layer 5 (Section 4).

export type Severity = "low" | "medium" | "high";

export type BehaviourSignalName =
  // Load & Shape of Day
  | "denseDayMode"
  | "contextSwitchingCost"
  | "prepCliff"
  | "decisionDensityHigh"
  | "deepWorkProtection"
  | "multiCalendarLoad"
  // Stakes
  | "prepWindowOpen"
  | "upwardReporting"
  | "boardLevelOutcome"
  | "postGovernanceOffload"
  | "dualEmotionalStakes"
  | "stackedStakes"
  | "interpersonalStakes"
  | "stakesBuildUp"
  // State
  | "vetoRisk"
  | "decisionLeakage"
  | "readinessGap"
  | "postPeak"
  | "secondWind"
  // Travel & Conference
  | "travelPreFlight"
  | "travelLanding"
  | "travelInFlight"
  | "longHaulRecovery"
  | "circadianShift"
  | "reentry"
  | "conferenceDay"
  | "conferenceEve"
  | "standaloneSpeaking"
  | "conferenceGapReset"
  // Availability & Rhythm
  | "workingNonWorkingDay"
  | "weekAhead"
  | "morningAnchor"
  | "eveningClose"
  | "recoveryOwed"
  // Crisis
  | "crisis";

export interface BehaviourSignal {
  name: BehaviourSignalName;
  severity: Severity;
  fired: boolean;
  precedenceRank: number;
  evidencePointers: string[];
  reason: string;
}

export interface BehaviourSignalRegistryEntry {
  name: BehaviourSignalName;
  family: "load" | "stakes" | "state" | "travel" | "conference" | "availability" | "crisis";
  precedenceRank: number;
  requiresWearable?: boolean;
  scope: "shared" | "ceo_pack";
  evaluator: (context: any) => { fired: boolean; severity: Severity; reason?: string; evidence?: string[] };
}
