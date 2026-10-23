// [KIND: fallback] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Static Route deterministic fallback.
// Source: Part 2 Layer 3 (Section 8.5).

import type { InterventionCandidate } from "../types.ts";
import { getDefaultIntervention } from "./default-set.ts";

export const ROW_FIRST_CHOICES: Record<string, string> = {
  "A-pre": "box-breathing",
  "A-post": "release-exhale-new",
  "B-pre": "confidence-through-evidence",
  "B-post": "softness-release-new",
  "C-pre": "presence-grounding-new",
  "C-post": "vagus-wind-down",
  "D-pre": "fudoshin-immovable-mind",
  "D-post": "softness-release-new",
  "E-pre": "single-thread-focus",
  "E-post": "detachment-observer-new",
  "J-pre": "grounding-touch",
  "J-post": "release-exhale-new",
};

export function getStaticRouteChoice(
  anchorCategory?: string | null,
  phase?: string
): InterventionCandidate {
  const key = `${anchorCategory?.toUpperCase() ?? "E"}-${phase ?? "pre"}`;
  const choiceId = ROW_FIRST_CHOICES[key];

  if (choiceId) {
    return {
      id: choiceId,
      title: choiceId.replace(/-/g, " "),
      kind: "practice",
      modality: "somatic",
      minutes: 2,
      capabilities: ["reduce_arousal", "steady_composure"],
    };
  }

  return getDefaultIntervention("pause");
}
