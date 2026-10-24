// [KIND: spec] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Anticipation Load pattern specification.
// Source: Part 2 Layer 4 (Section 4C, N-L4-3).

import type { PatternSpec } from "../types.ts";

export const ANTICIPATION_SPECS: PatternSpec[] = [
  {
    id: "anticipation_load",
    name: "Pre-Event Anticipation Load on Demanding Days",
    family: "anticipation",
    metric: "calm",
    lag: "same_day",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "harm",
  },
];
