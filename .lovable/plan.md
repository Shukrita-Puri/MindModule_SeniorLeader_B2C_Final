# Fix broken week-ahead calendar query + unify calendars into one feed

Two related problems, both confirmed against the live database.

## What is broken

1. **Bad calendar query (56+ silent failures/day).** The brief engine and the Mastery Plan builder both request `source`, `calendar_name` and `calendar_summary` from the calendar view. Those columns do not exist anywhere in the calendar table (verified: the table has 20 columns and none of them are these three). Postgres rejects the whole query, both call sites ignore the error, so week-ahead detection (end of holiday, end of PTO, end of long weekend, planning day) always runs on an empty calendar and users get the wrong brief and plan mode. The nudges engine already worked around this months ago with an explicit comment — the other two were never updated.

2. **Primary vs secondary calendar model is wrong.** Today web clients are routed to a different view that keeps only ONE provider's events and throws away the rest. That contradicts the intended rule: every connected calendar counts; Apple only wins when the *same* invite appears twice.

## The rule we want (one calendar column for the whole app)

- All connected calendars (Google, Microsoft, Apple) contribute events, on iOS and on web alike.
- When the same slot appears more than once (same title, same start, same duration), keep exactly one copy, preferring Apple, then Google, then Microsoft.
- No provider is ever dropped wholesale.

The existing `primary_calendar_events` view already implements exactly this. The web-only view is the odd one out and gets retired.

## Changes

**A. Fix the failing query**
- In the brief engine and the Mastery Plan builder, select only real columns: `title, start_time, end_time, is_all_day, is_organizer, attendees_count`.
- Stop swallowing the error: destructure `{ data, error }`, log a clear warning when it fires, and keep the existing fail-open behaviour so a calendar outage never blocks a brief or plan.
- Holiday-feed detection that relied on `source`/`calendar_summary` degrades gracefully to `null` (same as nudges does today); holiday classification continues via event title plus the country holiday table.

**B. One calendar feed on every platform**
- Make the shared calendar helper always resolve to `primary_calendar_events`, on web as well as iOS, so the platform wrapper becomes a no-op passthrough.
- Leave the web view in place, unused, for one release as a rollback, then drop it in a follow-up migration.
- The four consumers (brief, plan, JIT events, nudges) need no call-site changes beyond A — they all read the same view name.

**C. Verify**
- Re-run the two fixed queries directly against the database and confirm rows come back.
- Confirm a duplicated invite across two providers returns a single row from the unified view.
- Redeploy the brief engine, plan builder, JIT and nudges functions, then check the logs are clean of the `column ... does not exist` error and that `[week-ahead-hydration]` now logs non-empty event counts.
- Run the existing test suite.

## Technical notes

- Files: `supabase/functions/compute-outer-readiness/index.ts` (~5016), `supabase/functions/generate-mastery-plan/index.ts` (~4942), `supabase/functions/_shared/calendar-provider.ts`.
- No schema migration is required for the fix itself; deduplication already lives in `primary_calendar_events` (`DISTINCT ON (user_id, identity_key)` ordered apple > google > microsoft).
- `hydrateWeekAheadInputs` already tolerates missing `source`/`calendarSummary`, so its signature stays unchanged.
