// [KIND: spec] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Barrel index for all Layer 4 Pattern Specs.
// Source: Part 2 Layer 4 (Section 4C, 5.1).

import { DRAIN_LIFT_SPECS } from "./drain-lift.ts";
import { ANTICIPATION_SPECS } from "./anticipation.ts";
import { RECOVERY_SPECS } from "./recovery.ts";
import { LOAD_SPECS } from "./load.ts";
import { DEMAND_STATE_SPECS } from "./demand-state.ts";
import { DAY_PATTERN_SPECS } from "./day-patterns.ts";
import type { PatternSpec } from "../types.ts";

export const ALL_CANONICAL_SPECS: PatternSpec[] = [
  ...DRAIN_LIFT_SPECS,
  ...ANTICIPATION_SPECS,
  ...RECOVERY_SPECS,
  ...LOAD_SPECS,
  ...DEMAND_STATE_SPECS,
  ...DAY_PATTERN_SPECS,
];

export * from "./drain-lift.ts";
export * from "./anticipation.ts";
export * from "./recovery.ts";
export * from "./load.ts";
export * from "./demand-state.ts";
export * from "./day-patterns.ts";
