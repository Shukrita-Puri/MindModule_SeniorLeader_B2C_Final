// [KIND: constants] [LAYER: 0] [TIERS: 1] [AUDIENCE: universal]
// Domain constants for Layer 0 Engagement.
// Source: Part 2 Layer 0 (Section 9, 12.1), Spine (Section 9.7).

export const ENGAGEMENT_ACTIONS = [
  "viewed",
  "opened",
  "completed",
  "skipped",
  "dismissed",
  "snoozed",
  "liked",
  "disliked",
  "rated",
  "reviewed",
  "cancelled",
  "corrected",
] as const;

export type EngagementAction = (typeof ENGAGEMENT_ACTIONS)[number];

export const ENGAGEMENT_REF_KINDS = [
  "item",
  "anchor",
  "slot",
  "nudge",
  "brief",
  "practice",
  "pattern",
] as const;

export type EngagementRefKind = (typeof ENGAGEMENT_REF_KINDS)[number];

/**
 * Maximum engagement event retention period in days.
 * Reason: 365 days of user interaction history enables Layer 4 causality and efficacy analysis (Spine 9.1).
 */
export const ENGAGEMENT_RETENTION_DAYS = 365;
