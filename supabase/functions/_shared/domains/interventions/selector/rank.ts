// [KIND: step] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Selector Stage IS3: Rank eligible candidates with scoring and bonuses.
// Source: Part 2 Layer 3 (Section 8.2, IS3, 8.4).

import type {
  InterventionCandidate,
  InterventionNeed,
  ScoredCandidate,
} from "../types.ts";
import { SELECTOR_WEIGHTS } from "../constants.ts";
import { NEED_TO_CAPABILITIES } from "../catalogue/capabilities.ts";
import { isUserFavourite } from "./policies/favourite.ts";

export interface RankParams {
  eligible: InterventionCandidate[];
  need: InterventionNeed;
  userGoals?: string[];
  userFavourites?: string[];
  priorCompletedIdsToday?: string[];
  recentCompletedIds14Days?: string[];
}

export function stepRankCandidates(params: RankParams): ScoredCandidate[] {
  const targetCapabilities = NEED_TO_CAPABILITIES[params.need] ?? [];
  const scored: ScoredCandidate[] = [];

  for (const candidate of params.eligible) {
    const reasons: string[] = [];

    // 1. Capability match score (up to 35 pts)
    const matchingCapabilities = candidate.capabilities.filter((c) =>
      targetCapabilities.includes(c)
    );
    const capScore = Math.min(
      SELECTOR_WEIGHTS.capabilityMatch,
      matchingCapabilities.length * 15
    );
    if (capScore > 0) {
      reasons.push(`Capabilities match (${matchingCapabilities.join(", ")})`);
    }

    // 2. Combo match (up to 25 pts)
    let comboScore = 0;
    if (candidate.practice) {
      comboScore = SELECTOR_WEIGHTS.comboExactMatch;
      reasons.push(`Recalibrate area ${candidate.practice.category}`);
    } else {
      comboScore = 20; // Own-action alignment
      reasons.push("Executive self-management action");
    }

    // 3. Goal alignment bonus (+14 pts, N-L3-5)
    let goalBonus = 0;
    if (params.userGoals && params.userGoals.length > 0 && candidate.practice?.goal_tags) {
      const hasGoalMatch = candidate.practice.goal_tags.some((tag) =>
        params.userGoals!.some((g) => tag.includes(g) || g.includes(tag))
      );
      if (hasGoalMatch) {
        goalBonus = SELECTOR_WEIGHTS.goalAlignmentBonus;
        reasons.push("Aligned with declared priority goals (+14)");
      }
    }

    // 4. Favourite bonus (+20 pts, D-L3-8)
    let favBonus = 0;
    if (isUserFavourite(candidate.id, params.userFavourites)) {
      favBonus = SELECTOR_WEIGHTS.favouriteBonus;
      reasons.push("User favourite practice (+20)");
    }

    // 5. Recency adjustment
    let recencyAdj = 0;
    if (params.priorCompletedIdsToday?.includes(candidate.id)) {
      recencyAdj += SELECTOR_WEIGHTS.recencyPenaltyToday; // -40
      reasons.push("Already completed today (-40)");
    } else if (params.recentCompletedIds14Days?.includes(candidate.id)) {
      recencyAdj += SELECTOR_WEIGHTS.recencyPenalty14Days; // -15
      reasons.push("Recently completed in past 14 days (-15)");
    }

    const totalScore = Math.max(0, capScore + comboScore + goalBonus + favBonus + recencyAdj);

    scored.push({
      candidate,
      score: totalScore,
      subScores: {
        capabilityMatch: capScore,
        comboMatch: comboScore,
        goalBonus,
        favouriteBonus: favBonus,
        recencyAdjustment: recencyAdj,
      },
      reasons,
    });
  }

  // Sort descending by score
  return scored.sort((a, b) => b.score - a.score);
}
