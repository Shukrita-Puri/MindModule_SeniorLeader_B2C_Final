// [KIND: spec] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Load pattern specifications.
// Source: Part 2 Layer 4 (Section 4C).

import type { PatternSpec } from "../types.ts";

export const LOAD_SPECS: PatternSpec[] = [
  {
    id: "heavy_load",
    name: "Heavy Day Load Impact on Next Day Readiness",
    family: "load",
    metric: "prs",
    lag: "next_morning",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "harm",
  },
  {
    id: "consecutive_heavy",
    name: "Consecutive Heavy Days Compounding Cost",
    family: "load",
    metric: "hrv",
    lag: "multi_day",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "harm",
  },
  {
    id: "late_meeting",
    name: "Late Meeting Impact on Overnight Sleep",
    family: "load",
    metric: "deep_sleep",
    lag: "next_morning",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "harm",
  },
];
