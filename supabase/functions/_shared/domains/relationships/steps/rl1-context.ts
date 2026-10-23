// [KIND: step] [LAYER: 1] [TIERS: 3] [AUDIENCE: universal]
// Step RL1: User Context Builder.
// Source: Part 2 Layer 1 (Section 3).
// Principle: Built per user; NO hardcoded default company context.

import type { CompanyContextProfile } from "../types.ts";

/**
 * Creates an empty/default user context profile when none is persisted yet.
 * Invariant: Outside directions remain UNKNOWN until the user's context exists.
 */
export function buildEmptyUserContext(userId: string): CompanyContextProfile {
  return {
    userId,
    userOrgDomain: null,
    sectorsSoldTo: [],
    partners: [],
    investors: [],
    declaredDomains: [],
  };
}
