// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Week-Ahead Domain Types.
// Source: Part 2 Layer 2 (Section 4.8).

export type WeekAheadReason =
  | "manual_override"
  | "end_of_pto"
  | "end_of_public_holiday"
  | "end_of_long_weekend"
  | "weekly_planning";

export interface WeekAheadFacts {
  isActive: boolean;
  reason: WeekAheadReason | null;
  lookbackDays: number;
  lookaheadDays: number;
}
