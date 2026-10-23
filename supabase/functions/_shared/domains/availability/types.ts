// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Availability Domain Types.
// Source: Part 2 Layer 2 (Section 4.2).

export type AvailabilityFrame =
  | "leave"
  | "long_weekend"
  | "public_holiday"
  | "weekend"
  | "workday";

export type RunPosition = "first" | "middle" | "last" | "single";

export interface LeaveInfo {
  source: "declared" | "explicit" | "inferred";
  partialHours?: { start: string; end: string } | null;
  inferred: boolean;
  confidence: "high" | "medium" | "low";
  evidence: string[];
}

export interface AvailabilityFacts {
  frame: AvailabilityFrame;
  isWorkingDay: boolean;
  leave: LeaveInfo | null;
  publicHoliday: {
    name: string;
    region: string | null;
    source: string;
  } | null;
  longWeekend: {
    startDate: string;
    endDate: string;
  } | null;
  runPosition: RunPosition | null;
  possibleLeave: boolean;
}
