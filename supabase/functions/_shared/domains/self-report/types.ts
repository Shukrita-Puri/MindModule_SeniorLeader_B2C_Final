// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Types for Layer 2 Self-Report Domain.
// Source: Part 2 Layer 2 (Section 5.1.2).

import type { PhysiologyTier } from "../physiology/types.ts";

export interface CheckInReading {
  timestampUtc: string;
  emotionLevel?: number | null; // 1–5
  regulationLevel?: number | null; // 1–5
  clarityLevel?: number | null; // 1–5
  energyLevel?: number | null; // 1–5
  pressureLevel?: number | null; // 1–5 (1 Overloaded, 5 Spacious)
  chargeResidue?: boolean | null;
  words?: string[];
  notes?: string | null;
}

export type RefineEffect = "lifted" | "lowered" | "none";

export interface SelfReportFacts {
  checkIn: CheckInReading | null;
  compositeScore: number | null; // 1–5
  selfReportedTier: PhysiologyTier | null;
  refinedTier: PhysiologyTier;
  refineEffect: RefineEffect;
  refineStepsApplied: number;
}
