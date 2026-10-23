// [KIND: constants] [LAYER: 1] [TIERS: 3] [AUDIENCE: universal]
// Domain constants for Layer 1 Relationships and Context Engine.
// Source: Part 2 Layer 1 (Section 3), Final Design (§5).

/**
 * Shared organisation profile cache TTL in days.
 * Reason: Organisation domain types and sectors are durable corporate facts (Layer 1, Section 3).
 */
export const ORG_PROFILE_TTL_DAYS = 180;

/**
 * Person-level confirmed relationship memory validity in days.
 * Reason: Relationships stay warm for 1 quarter; unconfirmed relationships decay after 90 days (Spine 9.1).
 */
export const RELATIONSHIP_CACHE_DAYS = 90;

/**
 * Maximum public domain lookups allowed per user per day.
 * Reason: 50 lookups/day bounds external network egress while easily covering typical executive daily calendar churn.
 */
export const LOOKUP_BUDGET_PER_USER_PER_DAY = 50;

/**
 * External organisation lookup timeout in milliseconds.
 * Reason: 3000ms prevents slow external web servers from blocking sync.
 */
export const FETCH_TIMEOUT_MS = 3000;

/**
 * Maximum confidence allowed for machine/LLM relationship inference.
 * Reason: Machine inference can never graduate to certainty or overwrite user declared tags (Layer 1, Section 3).
 */
export const LLM_MAX_CONFIDENCE = 0.6;

/**
 * Executive company context refresh interval in days.
 * Reason: Company strategic focus, offerings, and investor updates refresh monthly.
 */
export const COMPANY_CONTEXT_REFRESH_DAYS = 30;

/**
 * Number of matching user tags on a series/person required to promote to remembered relationship.
 * Reason: 2 matching tags verify intentional habit without burdening the user with repeated tagging.
 */
export const PROMOTE_AFTER_MATCHING_TAGS = 2;

/**
 * Canonical set of consumer/personal email domains.
 * Rule RL7: Personal domains NEVER imply role alone; many executives and board members use personal email.
 */
export const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "yahoo.com",
  "ymail.com",
  "yahoo.co.uk",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "zoho.com",
]);

/**
 * Starting weak hints for top-level / second-level domain suffixes.
 * Rule RL5: Suffixes provide initial starting confidence only; they NEVER decide organisation type alone.
 */
export const SUFFIX_HINTS: Record<string, "education" | "government" | "health" | "non_profit"> = {
  ".edu": "education",
  ".edu.au": "education",
  ".ac.uk": "education",
  ".ac.jp": "education",
  ".sch.uk": "education",
  ".school.nz": "education",
  ".gov": "government",
  ".gov.uk": "government",
  ".gov.au": "government",
  ".gouv.fr": "government",
  ".gob.es": "government",
  ".govt.nz": "government",
  ".mil": "government",
  ".nhs.uk": "health",
  ".nhs.net": "health",
  ".org": "non_profit",
};
