// OWNERSHIP: engineering. Single source of truth for the Brief's prompt
// contract version. Downstream consumers (Plan, Nudges, Insights) import
// this so the `loadBriefBehaviourSnapshot` query can disambiguate Briefs
// when prompt-version bumps mid-day produce multiple rows in the same
// (user, local_date, time_window) bucket.
//
// Bump this constant whenever the brief prompt contract or canonical-output
// behaviour changes — a bump intentionally invalidates all prior cached briefs.
// v6.5 — P0 2026-06-21: deterministic Brief fallback no longer rendered;
// LLM failure now returns awaiting state and persists brief_source='awaiting'.
// Bump invalidates every cached brief written under v6.4 (including stale
// 'deterministic' rows that would have leaked banned phrases like
// "Close strong." / "Steady the system ahead of the day ahead" /
// "protecting the edge" via the COALESCE generated columns).
export const BRIEF_PROMPT_VERSION = 'v6.5-no-deterministic-fallback';