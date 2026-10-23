// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Types for Layer 2 Agreement Domain.
// Source: Part 2 Layer 2 (Section 5.1.3).

export type DivergenceDirection = "body_lower" | "body_higher" | "aligned";

export interface BodyMindDivergence {
  direction: DivergenceDirection;
  tierGapSize: number; // Positive integer difference in tiers
  bodyTier: string;
  selfReportTier: string;
  requiresSecondSignal: boolean; // Always true per Section 5.1.3 rule
  summary: string;
}

export interface AgreementFacts {
  hasDivergence: boolean;
  divergence: BodyMindDivergence | null;
  skippedReason?: "missing_body_data" | "missing_self_report" | null;
}
