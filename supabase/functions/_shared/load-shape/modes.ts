// Load Shape — canonical A–H → DemandMode map.
//
// This file is the forward-looking owner of the mapping. The private
// `modeOf()` map inside cause-effect-engine's `classifyDominantDayType`
// is intentionally NOT edited or extracted for launch safety; a test
// (`modes.test.ts`) asserts the two agree on every category where the
// labels are shared (A, B, D, E, G), so they cannot silently diverge.
//
// Post-launch follow-up: delete the engine's private map and import
// CATEGORY_TO_MODE from here.
//
// Differences vs the engine's private map (deliberate, additive):
//   C → 'visibility' (engine folds C into 'performance')
//   F → 'social'     (engine folds F into 'logistical')
//   H → 'rhythmic'   (engine returns null for H)

import type { DemandMode, EventCategory } from "./types.ts";

export const CATEGORY_TO_MODE: Record<EventCategory, DemandMode> = {
  A: "governance",
  B: "performance",
  C: "visibility",
  D: "relational",
  E: "cognitive",
  F: "social",
  G: "logistical",
  H: "rhythmic",
};

/** Categories whose mode label is shared with cause-effect-engine's private map. */
export const MODE_LABELS_SHARED_WITH_ENGINE: EventCategory[] = [
  "A",
  "B",
  "D",
  "E",
  "G",
];

export function modeForCategory(category: EventCategory): DemandMode {
  return CATEGORY_TO_MODE[category];
}
