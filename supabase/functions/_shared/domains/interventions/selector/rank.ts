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
  anchorPhase?: "pre" | "during" | "post" | "day" | "evening";
  userGoals?: string[];
  userFavourites?: string[];
  practiceSuccessRates?: Record<string, number>;
  priorCompletedIdsToday?: string[];
  recentCompletedIds14Days?: string[];
}

export function stepRankCandidates(params: RankParams): ScoredCandidate[] {
  const targetCapabilities = NEED_TO_CAPABILITIES[params.need] ?? [];
  const scored: ScoredCandidate[] = [];

  for (const candidate of params.eligible) {
    const reasons: string[] = [];

    // IS4: Relevance = 0.40 × phase-and-horizon match + 0.35 × meta-skill overlap + 0.25 × success rate
    // 1. Phase and horizon match (0 to 1)
    let phaseMatch = 0.6;
    if (params.anchorPhase && candidate.practice?.moment?.includes(params.anchorPhase)) {
      phaseMatch = 1.0;
    } else if (candidate.practice) {
      phaseMatch = 0.6;
    } else {
      phaseMatch = 0.8; // Own action contextual fit
    }

    // 2. Meta-skill / capability overlap (0 to 1)
    const matchingCapabilities = candidate.capabilities.filter((c) =>
      targetCapabilities.includes(c)
    );
    const capOverlap = targetCapabilities.length > 0
      ? matchingCapabilities.length / targetCapabilities.length
      : 0.5;

    // 3. Success rate from Layer 4 Efficacy (0 to 1, default 0.5)
    const successRate = params.practiceSuccessRates?.[candidate.id] ?? 0.5;

    const relevance = 0.40 * phaseMatch + 0.35 * capOverlap + 0.25 * successRate;
    const baseRelevanceScore = Math.round(relevance * 100);

    reasons.push(
      `Relevance ${Math.round(relevance * 100)}% (phase: ${Math.round(phaseMatch * 100)}%, skills: ${Math.round(capOverlap * 100)}%, efficacy: ${Math.round(successRate * 100)}%)`
    );

    // Goal alignment bonus (+14 pts, N-L3-5)
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

    // Favourite bonus (+20 pts, D-L3-8)
    let favBonus = 0;
    if (isUserFavourite(candidate.id, params.userFavourites)) {
      favBonus = SELECTOR_WEIGHTS.favouriteBonus;
      reasons.push("User favourite practice (+20)");
    }

    // Recency adjustment
    let recencyAdj = 0;
    if (params.priorCompletedIdsToday?.includes(candidate.id)) {
      recencyAdj += SELECTOR_WEIGHTS.recencyPenaltyToday; // -40
      reasons.push("Already completed today (-40)");
    } else if (params.recentCompletedIds14Days?.includes(candidate.id)) {
      recencyAdj += SELECTOR_WEIGHTS.recencyPenalty14Days; // -15
      reasons.push("Recently completed in past 14 days (-15)");
    }

    const totalScore = Math.max(0, baseRelevanceScore + goalBonus + favBonus + recencyAdj);

    scored.push({
      candidate,
      score: totalScore,
      subScores: {
        capabilityMatch: Math.round(capOverlap * 35),
        comboMatch: Math.round(phaseMatch * 40),
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
