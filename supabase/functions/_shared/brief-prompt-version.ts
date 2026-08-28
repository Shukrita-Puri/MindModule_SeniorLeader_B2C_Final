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
// v6.7 — Brief day-shape awareness: the prompt now carries the same
// deterministic day-shape signals the Plan (JIT v2) reads (public holiday,
// PTO/OOO, travel by type with phase, conference, full-day events) plus a
// matching persona directive. Bump invalidates cached v6.6 briefs so off-day
// and travel days regenerate with the correct framing.
// v6.8 — COACH retired as a Lean On / Watch For source on the LLM path.
// The deterministic path was already gated (COACH_SOURCE_ENABLED = false);
// this bump invalidates cached v6.7 briefs that still carry "· COACH" pairs.
// v6.9 — Weekend / non-workday awareness for beat (c). The deterministic
// builder now routes every off-day shape (weekend, long weekend, public
// holiday, PTO/OOO, personal leave, personal travel) through a recovery or
// light week-prep directive before any pillar branch, so no off-day brief can
// emit meeting / call / stakeholder language. Bump invalidates cached v6.8
// weekend briefs carrying the workday directive.
// v7.2 — CEO behaviour flags now carry an editorial priority tier (LEAD /
// CONTEXT / AMBIENT) and the prompt block prefixes each flag accordingly.
// This tells the LLM which deterministic signals must drive the brief's
// primary narrative and which provide supporting texture. Bump invalidates
// cached v7.1 briefs that lack the LEAD/CONTEXT marker.
// v7.3 — Priority ladder is now a 0–11 numeric rank; exactly one flag is
// marked [LEAD] (top-ranked after severity) and all others [CONTEXT], with an
// explicit instruction not to split attention. Deterministic fallback flags now
// carry copyHint / stake / evidence / anchorEvent end-to-end so all four beats
// can be populated from the CEO copy pack. Bump invalidates cached v7.2 briefs.
// v7.4 — Time-to-event precision. Deterministic copy and the CEO copy pack now
// render a bucketed time clause ("in 45 minutes", "in about 3 hours", "later
// today") from _shared/brief/time-phrase.ts instead of generic "within 24
// hours" prose, and the thin-signal deterministic line is retired. Bump
// invalidates cached v7.3 briefs whose anchor timing is now stale.
// v7.7 — Calendar-load honesty. The deterministic builder now names the day's
// load with the same qualitative vocabulary as the CALENDAR signal pill
// (light / busy / heavy), reserves "open day" for true zero-event workdays,
// and uses remaining (not total) meetings later in the day. Bump invalidates
// cached v7.6 rows that still say "no calendar demand in view" on days that
// actually hold events.
export const BRIEF_PROMPT_VERSION = 'v7.7-calendar-load-honesty';