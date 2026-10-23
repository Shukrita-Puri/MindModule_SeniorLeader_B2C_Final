// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Types for Layer 2 Remaining Domain.
// Source: Part 2 Layer 2 (Section 5.4).

export interface ScheduledMomentItem {
  id: string;
  title?: string;
  category: string;
  startUtc: string;
  endUtc: string;
}

export interface RemainingFacts {
  completedItemsCount: number;
  remainingItemsCount: number;
  highestCompletedCategory: string | null;
  highestRemainingStakes: string | null;
  backToBackRemainingCount: number;
  openGapsMinutes: number;
  decisionLeakageRisk: boolean;
  leakageReason?: string | null;
}
