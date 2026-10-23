// [KIND: barrel] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Public entry point for Layer 3 Interventions domain.
// Source: Part 2 Layer 3 (Section 13.5).

export * from "./types.ts";
export * from "./constants.ts";
export * from "./engine/index.ts";
export * from "./selector/index.ts";
export * from "./catalogue/index.ts";

import { composeDayInterventions, type ComposeDayInput } from "./engine/compose-day.ts";
import type { DayInterventionsPlan } from "./types.ts";

/**
 * Recommends interventions across the three daily plan slots.
 * Sole orchestrator entry for features (Plan, Nudges, Brief).
 */
export function recommendInterventions(input: ComposeDayInput): DayInterventionsPlan {
  return composeDayInterventions(input);
}
