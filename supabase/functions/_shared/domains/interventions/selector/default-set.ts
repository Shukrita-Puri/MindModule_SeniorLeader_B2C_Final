// [KIND: fallback] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Default Set for Guaranteed Non-Empty Slots.
// Source: Part 2 Layer 3 (Section 8.5, D-L3-18).

import type { InterventionCandidate } from "../types.ts";
import { DEFAULT_PRACTICE_SET } from "../constants.ts";

export function getDefaultIntervention(
  area: "pause" | "flow" | "reenergise" = "pause"
): InterventionCandidate {
  const practiceId = DEFAULT_PRACTICE_SET[area] ?? DEFAULT_PRACTICE_SET.pause;
  const title =
    area === "flow"
      ? "Presence Grounding"
      : area === "reenergise"
      ? "Vagus Nerve Wind Down"
      : "Box Breathing";

  return {
    id: practiceId,
    title,
    kind: "practice",
    modality: "somatic",
    minutes: 2,
    capabilities: area === "flow" ? ["steady_composure", "prime_presence"] : ["reduce_arousal", "steady_composure"],
  };
}
