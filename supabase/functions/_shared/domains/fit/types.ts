// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Types for Layer 2 Fit Domain.
// Source: Part 2 Layer 2 (Section 5.1.4).

import type { PhysiologyTier } from "../physiology/types.ts";

export interface ScheduledDemandItem {
  id: string;
  title?: string;
  category: string;
  startUtc: string;
  endUtc?: string;
  isHighStakes?: boolean;
}

export interface ReadinessDemandGap {
  size: "moderate" | "severe";
  itemsAhead: ScheduledDemandItem[];
  minutesUntilFirst: number;
  summary: string;
}

export interface FitFacts {
  hasGap: boolean;
  readinessDemandGap: ReadinessDemandGap | null;
}
