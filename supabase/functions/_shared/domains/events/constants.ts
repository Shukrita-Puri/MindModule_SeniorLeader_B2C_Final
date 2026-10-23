// [KIND: constants] [LAYER: 1] [TIERS: 0-3] [AUDIENCE: universal]
// Domain constants for Layer 1 Demand and A–J Event Intelligence.
// Source: Part 2 Layer 1 (Section 1), Final Design (§4, §6).

import type { CategoryLetter } from "../../spine/categories.ts";

/**
 * The single, shared stakes order across the entire application (Layer 1, Section 1).
 * Reason: Aligns JIT v2, Importance Engine, and A–J stakes ranking on one immutable hierarchy:
 * J (Incidents) > A (Board/Gov) > C (Media/Public) > B (Pitches/Deals) > D (People) >
 * F (Conferences) > G (Travel) > E (Strategic) > I (Ops/Admin) > H (Personal).
 */
export const SHARED_STAKES_ORDER: Record<CategoryLetter, number> = {
  J: 42,
  A: 40,
  C: 32,
  B: 30,
  D: 22,
  F: 18,
  G: 12,
  E: 10,
  I: 8,
  H: 5,
};

/**
 * High-stakes threshold.
 * Reason: Any work item with a base of 30 or higher (J, A, C, B) or an explicit high-stakes stamp
 * (e.g. layoffs, performance escalations) qualifies as a high-stakes demand event (Layer 1, Section 1).
 */
export const HIGH_STAKES_BASE_THRESHOLD = 30;

/**
 * Machine classification confidence thresholds (Final Design §6.3, 6.4).
 * Reason:
 * - inferred_high (>=0.75): Strong multi-family evidence; dependable machine reading.
 * - inferred_medium (0.55-0.75): Balanced reading; subtype only used if subtype confidence is high enough.
 * - uncertain (<0.55): Lowest confidence; prime candidate for the single daily clarifying question.
 */
export const CONFIDENCE_HIGH_THRESHOLD = 0.75;
export const CONFIDENCE_MEDIUM_THRESHOLD = 0.55;

export const TAXONOMY_VERSION = "2026.10.A_J";
export const CLASSIFIER_VERSION = "v3.1_domain";
