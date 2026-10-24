// [KIND: spec] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Recovery and Travel pattern specifications.
// Source: Part 2 Layer 4 (Section 4C, Scenario L4-4).

import type { PatternSpec } from "../types.ts";

export const RECOVERY_SPECS: PatternSpec[] = [
  {
    id: "recovery_half_life",
    name: "Recovery Half Life from Demanding Clusters",
    family: "recovery",
    metric: "hrv",
    lag: "multi_day",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "harm",
  },
  {
    id: "travel_recovery",
    name: "Travel Trip Recovery Duration",
    family: "recovery",
    metric: "prs",
    lag: "multi_day",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "harm",
  },
];
