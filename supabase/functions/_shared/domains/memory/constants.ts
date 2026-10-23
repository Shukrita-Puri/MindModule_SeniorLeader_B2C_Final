// [KIND: constants] [LAYER: memory] [TIERS: 0-3] [AUDIENCE: universal]
// Memory Service Constants & Expiry Rules.
// Source: Knowledge & Memory Spine (Section 9.2, 9.3, 9.6; Decisions 20, 22, 39).

import type { CorrectionScope, MemoryKind, MemoryTier } from "../../spine/vocabularies.ts";

/**
 * Correction scopes in strict narrowest-to-broadest precedence order.
 * Narrowest match always wins (Spine 9.3).
 */
export const CORRECTION_SCOPE_PRECEDENCE: readonly CorrectionScope[] = [
  "THIS_EVENT",
  "THIS_SERIES",
  "TITLE_PATTERN",
  "PERSON",
  "ORGANISATION",
] as const;

/**
 * Storage prefixes for scoped memory keys in `title_norm` (Spine 9.3).
 */
export const SCOPE_KEY_PREFIXES: Record<CorrectionScope, string> = {
  THIS_EVENT: "event:",
  THIS_SERIES: "series:",
  TITLE_PATTERN: "pattern:",
  PERSON: "person:",
  ORGANISATION: "org:",
};

/**
 * Memory expiry rules by kind.
 * Reason: Inferred memories must not persist indefinitely without human confirmation (Spine 9.2, 9.6).
 * Declared and observed facts persist until modified/deleted or data retention limits hit.
 */
export const MEMORY_EXPIRY_DAYS: Record<MemoryKind, number | null> = {
  declared: null, // Retained until changed or revoked
  observed: 365, // Retained per source retention policy (Layer 0, 12.6: 365 days)
  behavioural: 365, // Retained per store
  pattern: 90, // Recomputed nightly, expires if not refreshed within 90 days
  inferred: 90, // Inferred memory expires after 90 days unless user-confirmed (Spine 9.2)
};

/**
 * Memory trust hierarchy when sources disagree (Spine 9.2).
 * Higher rank = higher trust. Declared always beats inferred.
 */
export const MEMORY_TRUST_RANK: Record<MemoryKind, number> = {
  declared: 5,
  observed: 4,
  pattern: 3,
  behavioural: 2,
  inferred: 1,
};

/**
 * Minimum occurrences required before an observation or behaviour is eligible to become a pattern.
 * Reason: 3 occurrences prevent one-off noise from distorting patterns (Spine 9.2).
 */
export const MIN_PATTERN_OCCURRENCES = 3;

/**
 * Memory tiers description (Spine 9.1).
 */
export const MEMORY_TIERS: readonly MemoryTier[] = [0, 1, 2, 3] as const;
