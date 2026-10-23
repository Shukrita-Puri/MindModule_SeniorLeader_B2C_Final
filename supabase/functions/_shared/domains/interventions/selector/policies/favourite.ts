// [KIND: policy] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Favourite Selection Policy.
// Source: Part 2 Layer 3 (Section 8.2, D-L3-8).

export function isUserFavourite(candidateId: string, favourites?: string[]): boolean {
  if (!favourites || favourites.length === 0) return false;
  return favourites.includes(candidateId);
}
