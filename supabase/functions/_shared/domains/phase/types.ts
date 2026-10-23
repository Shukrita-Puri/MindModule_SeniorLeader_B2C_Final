// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Types for Layer 2 Phase Domain.
// Source: Part 2 Layer 2 (Section 5.4).

export type AnchorPhase =
  | "pre_anchor"
  | "during_anchor"
  | "post_anchor"
  | "clear";

export interface PhaseAnchorItem {
  id: string;
  title?: string;
  category: string;
  startUtc: string;
  endUtc: string;
  isHighStakes?: boolean;
}

export interface PhaseFacts {
  phase: AnchorPhase;
  minutesToNextHighStakes: number | null;
  postDemandingGap: boolean;
  activeAnchor: PhaseAnchorItem | null;
  nextAnchor: PhaseAnchorItem | null;
  precedingAnchor: PhaseAnchorItem | null;
}
