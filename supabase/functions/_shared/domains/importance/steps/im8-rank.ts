// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step IM8: 4-Part Weighting and Anchor Ranking.
// Source: Part 2 Layer 2 (Section 4.9, IM5-IM8, N-IM2).

import type { RankedAnchor } from "../types.ts";
import { MATURITY_TIER_WEIGHTS, CATEGORY_BASE_SCORES } from "../constants.ts";

export interface UnrankedAnchorInput {
  anchorId: string;
  kind: RankedAnchor["kind"];
  title: string;
  category?: string | null;
  subtype?: string | null;
  startUtc?: string | null;
  stakes: number;    // K
  urgency: number;   // U
  tactical: number;  // T
  strategic: number; // S
  tier?: "T0" | "T1" | "T2" | "T3";
  isUserTagOverride: boolean;
  evidence: RankedAnchor["evidence"];
}

export function stepRankAnchors(inputs: UnrankedAnchorInput[]): RankedAnchor[] {
  const ranked: RankedAnchor[] = [];

  for (const item of inputs) {
    const tier = item.tier ?? "T1";
    const weights = MATURITY_TIER_WEIGHTS[tier];

    // Assert weights sum to 1 and wS >= wU (N-IM2 invariant)
    const baseWeightedScore =
      weights.wK * item.stakes +
      weights.wU * item.urgency +
      weights.wT * item.tactical +
      weights.wS * item.strategic;

    // User's voice outside the sum (IM6): priority tags & Week Ahead choices always win
    const totalScore = item.isUserTagOverride
      ? 1000 + baseWeightedScore
      : Math.round(baseWeightedScore * 10) / 10;

    ranked.push({
      anchorId: item.anchorId,
      kind: item.kind,
      title: item.title,
      category: item.category,
      subtype: item.subtype,
      startUtc: item.startUtc,
      totalScore,
      subScores: {
        stakes: item.stakes,
        urgency: item.urgency,
        tactical: item.tactical,
        strategic: item.strategic,
      },
      tier,
      isUserTagOverride: item.isUserTagOverride,
      evidence: item.evidence,
    });
  }

  // Sort: score desc, then tactical desc, then strategic desc, then stakes order, then start time
  return ranked.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.subScores.tactical !== a.subScores.tactical) return b.subScores.tactical - a.subScores.tactical;
    if (b.subScores.strategic !== a.subScores.strategic) return b.subScores.strategic - a.subScores.strategic;

    const baseA = CATEGORY_BASE_SCORES[a.category ?? ""] ?? 0;
    const baseB = CATEGORY_BASE_SCORES[b.category ?? ""] ?? 0;
    if (baseB !== baseA) return baseB - baseA;

    const tA = a.startUtc ? new Date(a.startUtc).getTime() : 0;
    const tB = b.startUtc ? new Date(b.startUtc).getTime() : 0;
    return tA - tB;
  });
}
