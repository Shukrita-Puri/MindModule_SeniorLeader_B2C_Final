// OWNERSHIP: engineering. Single source of truth for the Brief's prompt
// contract version. Downstream consumers (Plan, Nudges, Insights) import
// this so the `loadBriefBehaviourSnapshot` query can disambiguate Briefs
// when prompt-version bumps mid-day produce multiple rows in the same
// (user, local_date, time_window) bucket.
//
// Bump this constant whenever the brief prompt contract or canonical-output
// behaviour changes — a bump intentionally invalidates all prior cached briefs.
export const BRIEF_PROMPT_VERSION = 'v6.4-beat-weighted-vocab-paired';