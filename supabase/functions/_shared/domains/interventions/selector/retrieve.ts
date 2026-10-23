// [KIND: step] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Selector Stage IS1: Retrieve candidates matching need and surface.
// Source: Part 2 Layer 3 (Section 8.2, IS1).

import type { InterventionCandidate, InterventionNeed, PracticeDefinition } from "../types.ts";
import { OWN_ACTIONS_CATALOGUE } from "../catalogue/own-actions.ts";
import { NEED_TO_CAPABILITIES } from "../catalogue/capabilities.ts";

export interface RetrieveParams {
  surface: "plan" | "nudges" | "brief";
  need: InterventionNeed;
  catalogue: PracticeDefinition[];
  allowOwnActions?: boolean;
}

export function stepRetrieveCandidates(params: RetrieveParams): InterventionCandidate[] {
  const candidates: InterventionCandidate[] = [];
  const targetCapabilities = NEED_TO_CAPABILITIES[params.need] ?? [];

  // 1. Retrieve Recalibrate practices
  for (const practice of params.catalogue) {
    if (!practice.visible) continue;
    if (!practice.surfaces.includes(params.surface)) continue;

    // Check if practice matches any target capabilities
    const hasCapability = practice.capabilities.some((c) =>
      targetCapabilities.includes(c)
    );

    if (hasCapability) {
      candidates.push({
        id: practice.id,
        title: practice.title,
        kind: "practice",
        modality: practice.sub_type,
        minutes: practice.minutes,
        capabilities: practice.capabilities,
        practice,
      });
    }
  }

  // 2. Retrieve own actions if allowed
  if (params.allowOwnActions) {
    for (const action of OWN_ACTIONS_CATALOGUE) {
      if (action.needs.includes(params.need)) {
        candidates.push({
          id: action.id,
          title: action.title,
          kind: "own_action",
          capabilities: targetCapabilities,
          ownAction: action,
        });
      }
    }
  }

  return candidates;
}
