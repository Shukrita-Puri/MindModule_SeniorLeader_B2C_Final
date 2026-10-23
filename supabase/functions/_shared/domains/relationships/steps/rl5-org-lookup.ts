// [KIND: step] [LAYER: 1] [TIERS: 3] [AUDIENCE: universal]
// Step RL5: Organisation Lookup & Suffix Hints.
// Source: Part 2 Layer 1 (Section 3).

import type { OrganisationType } from "../types.ts";
import { SUFFIX_HINTS } from "../constants.ts";

export interface SuffixHintResult {
  orgType: OrganisationType;
  confidence: number;
  source: string;
}

/**
 * Checks domain suffix for starting organizational hint.
 * Invariant (RL5): Suffix hint sets starting confidence only (0.4); it NEVER decides alone.
 */
export function checkSuffixHint(domain: string): SuffixHintResult | null {
  const clean = domain.toLowerCase().trim();
  for (const [suffix, type] of Object.entries(SUFFIX_HINTS)) {
    if (clean.endsWith(suffix)) {
      return {
        orgType: type,
        confidence: 0.45,
        source: `suffix_hint:${suffix}`,
      };
    }
  }
  return null;
}
