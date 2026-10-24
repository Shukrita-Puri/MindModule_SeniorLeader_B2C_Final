// [KIND: step] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Selector Stage IS4: Select primary and alternate interventions with fallbacks.
// Source: Part 2 Layer 3 (Section 8.2, IS4, 8.5).

import type {
  InterventionCandidate,
  InterventionNeed,
  ScoredCandidate,
  SelectionResult,
} from "../types.ts";
import { pickAlternateCandidate } from "./policies/alternate.ts";
import { getDefaultIntervention } from "./default-set.ts";
import { getStaticRouteChoice } from "./static-route.ts";

export interface SelectParams {
  slotId: string;
  need: InterventionNeed;
  ranked: ScoredCandidate[];
  rejected: Array<{ interventionId: string; reason: string }>;
  anchorCategory?: string | null;
  phase?: string;
}

export function stepSelectIntervention(params: SelectParams): SelectionResult {
  const decisionId = `dec_${params.slotId}_${Date.now()}`;

  // 1. Match from ranked candidates
  if (params.ranked.length > 0) {
    const primary = params.ranked[0];
    const alternate = pickAlternateCandidate(primary.candidate, params.ranked);

    return {
      decisionId,
      slotId: params.slotId,
      need: params.need,
      chosen: primary.candidate,
      alternate,
      outcome: "match",
      score: primary.score,
      reasons: primary.reasons,
      eligibleCandidates: params.ranked.map((r) => ({
        id: r.candidate.id,
        score: r.score,
        relevance: r.subScores ? (r.subScores.capabilityMatch + r.subScores.comboMatch) / 2 : r.score,
      })),
      rejected: params.rejected,
      versions: {
        interventions: "2026-10-23",
        spine: "spine.v2.20261023",
      },
    };
  }

  // 2. Default set fallback (IS5 / D-L3-18)
  const defaultCandidate = getDefaultIntervention("pause");
  const staticRoute = getStaticRouteChoice(params.anchorCategory, params.phase);

  return {
    decisionId,
    slotId: params.slotId,
    need: params.need,
    chosen: defaultCandidate,
    alternate: staticRoute,
    outcome: "default_set",
    score: 50,
    reasons: ["Fallback to guaranteed default set (slot never empty)"],
    eligibleCandidates: [],
    rejected: params.rejected,
    versions: {
      interventions: "2026-10-23",
      spine: "spine.v2.20261023",
    },
  };
}
