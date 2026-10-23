// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Importance Domain Types.
// Source: Part 2 Layer 2 (Section 4.9, 4.9.1).

export type AnchorKind = "item" | "day" | "state";

export interface AnchorEvidence {
  horizon: "immediate" | "tactical" | "strategic";
  sourceLayer: string; // e.g. "L1 relationship", "L4 pattern", "T3 goal"
  fact: string;
  measure?: string | null;
  basis?: string | null;
  confidence: "high" | "medium" | "low";
}

export interface RankedAnchor {
  anchorId: string;
  kind: AnchorKind;
  title: string;
  category?: string | null;
  subtype?: string | null;
  startUtc?: string | null;
  totalScore: number;
  subScores: {
    stakes: number;    // K
    urgency: number;   // U
    tactical: number;  // T
    strategic: number; // S
  };
  tier: "T0" | "T1" | "T2" | "T3";
  isUserTagOverride: boolean;
  evidence: AnchorEvidence[];
}

export interface ExcludedCandidate {
  itemId: string;
  title: string;
  reason: string;
}

export interface ImportanceFacts {
  mode: "base" | "adjusted";
  horizonHours: number;
  anchors: RankedAnchor[];
  topItemAnchor: RankedAnchor | null;
  topDayAnchor: RankedAnchor | null;
  excluded: ExcludedCandidate[];
}
