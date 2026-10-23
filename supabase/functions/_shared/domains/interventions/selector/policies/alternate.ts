// [KIND: policy] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Favourite and Alternate Selection Policies.
// Source: Part 2 Layer 3 (Section 8.2, D-L3-8).

import type { InterventionCandidate, ScoredCandidate } from "../../types.ts";

export function isUserFavourite(candidateId: string, favourites?: string[]): boolean {
  if (!favourites || favourites.length === 0) return false;
  return favourites.includes(candidateId);
}

export function pickAlternateCandidate(
  chosen: InterventionCandidate,
  eligibleRanked: ScoredCandidate[]
): InterventionCandidate | null {
  for (const item of eligibleRanked) {
    if (item.candidate.id === chosen.id) continue;

    // Pick candidate from same area or complementary capability
    if (item.candidate.kind === chosen.kind) {
      return item.candidate;
    }
  }

  // Fallback to second best eligible candidate
  const fallback = eligibleRanked.find((i) => i.candidate.id !== chosen.id);
  return fallback ? fallback.candidate : null;
}
