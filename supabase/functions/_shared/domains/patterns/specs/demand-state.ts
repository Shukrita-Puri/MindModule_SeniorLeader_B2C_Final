// [KIND: spec] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Demand dimension to state pattern specifications.
// Source: Part 2 Layer 4 (Section 4C, Layer4 Cross-Layer additions).

import type { PatternSpec } from "../types.ts";

export const DEMAND_STATE_SPECS: PatternSpec[] = [
  {
    id: "demand_state_emotional",
    name: "High Emotional Demand Meetings Impact on Energy",
    family: "demand_state",
    metric: "energy",
    lag: "same_day",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "harm",
  },
  {
    id: "demand_state_cognitive",
    name: "High Cognitive Demand Impact on Clarity",
    family: "demand_state",
    metric: "clarity",
    lag: "same_day",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "harm",
  },
  {
    id: "demand_state_relational",
    name: "High Relational Demand Impact on Calm",
    family: "demand_state",
    metric: "calm",
    lag: "same_day",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "harm",
  },
];
