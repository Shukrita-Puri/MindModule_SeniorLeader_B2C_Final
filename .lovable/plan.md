# Travel days: backfill history, keep future trips recorded

## Why the current data looks empty

Verified against the live database:

- `travel_state` holds exactly one row per person — the *current* state only. There is no per-day travel record anywhere, so a trip on 10-16 August can never "show" after it ends.
- Shukrita's row is now `not_travelling`, last location 27 August (the backfill from the previous fix ran).
- Her August trip does exist in her calendar history (BA 183 on 9 Aug, DoubleTree stay 9-17 Aug, BA 188 on 17 Aug).
- The hourly job is registered by the migration created in the last change; I will confirm it is live and has actually fired before relying on it.

So the gap is storage shape, not sync frequency.

## What to build

### 1. A per-day travel record

New table `travel_days`: one row per person per calendar day, with the day, whether it is a travel day, the trip window it belongs to, the evidence that produced it (calendar / location / timezone), and a confidence marker. Backend-owned writes, person-scoped reads.

### 2. Backfill from calendar history

A one-off pass over `calendar_events` that:

- finds trip evidence (flights, hotel/stay entries, offsite/conference entries) using the existing A-H event resolver — no new taxonomy;
- joins overlapping evidence into trip windows (so 9-17 Aug becomes one continuous window rather than three isolated days);
- writes one `travel_days` row per day in each window, marked as calendar-derived.

Run it for everyone, not just Shukrita, so history is consistent.

### 3. Keep future trips recorded

Extend `travel-state-sync` so each hourly run also writes/refreshes `travel_days` for today and the next 14 days from calendar evidence, and upgrades a day's evidence to location-based when a fresh location fix confirms it. Location evidence may promote a day, never erase a calendar-derived one — same fail-open contract as the rest of the travel code.

### 4. Read path

`hydrate-travel-day.ts` gains `travel_days` as its first evidence rung, above timezone/distance/state. Brief, plan and nudges then treat those dates as travel days automatically, with no new screen.

### 5. Run it now

Trigger the hourly job once by hand after deploying, then verify Shukrita's rows for 10-16 August and 1 September exist (1 September only if her calendar actually contains trip evidence for it — current data shows none, and I will report that rather than invent a trip).

## Technical notes

- Files: new migration for `travel_days` (+ GRANTs and RLS), new `supabase/functions/travel-state-sync/travel-days.ts` (window builder, unit-tested), edits to `travel-state-sync/index.ts` and `_shared/travel/hydrate-travel-day.ts`, plus a one-off backfill executed with the data tool.
- Trip evidence reuses `resolveEvent()` / existing event categories; no parallel classifier.
- Backfill window: all `calendar_events` history currently stored.

## Separate: the 47 backend test failures

Unrelated to travel; they fall into four groups:

- 44 in `compute-outer-readiness` (`body_copy`, `index`, `redundancy` tests) fail with HTTP 401 — those tests call the deployed function and the sandbox has no auth token. Environmental, not a code defect.
- `ledger-evolution.test.ts` — structural day-flag detection returns true where the test expects false.
- `plan-why-window-signals.test.ts` and `subcategory_persistence_test.ts` — source-text assertions that no longer match the current imports.
- `v5_validation_test.ts` — rejects the live deep link `/plan?mode=week-ahead`, which is a valid route today.

Not part of this change. Say the word and I will fix the last four (the 401 group needs a token, not a fix).
