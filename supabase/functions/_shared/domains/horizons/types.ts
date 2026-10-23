// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Types for Layer 2 Horizons Domain.
// Source: Part 2 Layer 2 (Section 5.4).

export interface HighStakesAheadItem {
  id: string;
  title?: string;
  category: string;
  startTime: string;
}

export interface LookBackFacts {
  yesterdayLivedLoad: "heavy" | "moderate" | "light";
  yesterdayRanHeavierThanPlanned: boolean;
  lastNightSleepMinutes: number | null;
  recoveryOwed: boolean;
}

export interface LookAheadFacts {
  tomorrowPlannedLoad: "heavy" | "moderate" | "light";
  tomorrowWeekAheadMode: boolean;
  firstHighStakesItemTomorrow: HighStakesAheadItem | null;
}

export interface HorizonsFacts {
  lookBack: LookBackFacts;
  lookAhead: LookAheadFacts;
}
