// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Mix Domain Types.
// Source: Part 2 Layer 2 (Section 4.6).

export type ContextSwitchingLevel = "low" | "medium" | "high";

export interface PredominantFact {
  active: boolean;
  type: "category" | "subtype";
  id: string;
  name: string;
  count: number;
  share: number;
}

export interface MixedFact {
  active: boolean;
  categories: string[];
  label: string; // e.g. "Mixed: board and pitches"
}

export interface BackToBackChain {
  startUtc: string;
  endUtc: string;
  durationHours: number;
  categories: string[];
  meetingCount: number;
}

export interface BackToBackFact {
  isBackToBackDay: boolean;
  totalChainHours: number;
  longestChainHours: number;
  chains: BackToBackChain[];
  reachesDenseDay: boolean;
}

export interface ContextSwitchItem {
  timeWindow: string; // e.g. "10:00–12:00"
  fromCategory: string;
  toCategory: string;
  gapMinutes: number;
}

export interface ContextSwitchingFact {
  level: ContextSwitchingLevel;
  switchCount: number;
  switches: ContextSwitchItem[];
}

export interface MixFacts {
  active: boolean;
  predominant: PredominantFact | null;
  mixed: MixedFact | null;
  backToBack: BackToBackFact;
  contextSwitching: ContextSwitchingFact;
  composition: {
    categoryCounts: Record<string, number>;
    subtypeCounts: Record<string, number>;
    totalWorkMeetings: number;
  };
}
