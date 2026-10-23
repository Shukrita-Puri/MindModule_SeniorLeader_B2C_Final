// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Load Domain Types.
// Source: Part 2 Layer 2 (Section 4.5).

export type LoadLevel = "light" | "normal" | "heavy";

export type LoadReason =
  | "volume"
  | "weight"
  | "decision"
  | "travel"
  | "conference"
  | "high_stakes_anchor"
  | "open_day"
  | "personal_day"
  | "baseline";

export interface HighStakesItemSummary {
  itemId: string;
  title: string;
  category: string;
  subtype: string | null;
  stakes: string;
  startUtc?: string | null;
}

export interface WorkOnNonWorkingDayFact {
  active: boolean;
  isFullWorkingDay: boolean; // >= 2 meetings, 1 high-stakes, or >= 120m work
  meetingCount: number;
  workMinutes: number;
  label: string; // e.g. "Working weekend", "Working on leave"
}

export interface LoadFacts {
  level: LoadLevel;
  reasons: LoadReason[];
  lightReason: string | null;
  personalDay: boolean;
  halfDay: boolean;
  highStakesAnchor: HighStakesItemSummary | null;
  highStakesItems: HighStakesItemSummary[];
  decisionHeavy: boolean;
  travelLoad: boolean;
  landingMeeting: boolean;
  workMeetingCount: number;
  focusMinutes: number;
  workOnNonWorkingDay: WorkOnNonWorkingDayFact | null;
  recoveryOwed: boolean;
  recoveryReason: string | null;
  decisionDensity: number;
}
