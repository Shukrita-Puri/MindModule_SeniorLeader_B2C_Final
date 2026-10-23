// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Open Loops Domain Types.
// Source: Part 2 Layer 2 (Section 4.10).

export interface OpenLoopItem {
  id: string;
  source: "email" | "slack" | "teams";
  title: string;
  ageHours: number;
  stakes: "low" | "medium" | "high";
  linkedCalendarItemId?: string | null;
}

export interface OpenLoopsFacts {
  active: boolean;
  openLoopsCount: number;
  decisionsPendingCount: number;
  items: OpenLoopItem[];
}
