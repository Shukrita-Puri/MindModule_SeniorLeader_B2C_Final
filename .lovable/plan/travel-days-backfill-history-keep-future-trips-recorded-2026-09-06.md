# Travel days: backfill history, keep future trips recorded

## Why the current data looks empty

Verified against the live database:

- `travel_state` holds one row per person — the *current* state only (`state`, last known position, `meta`). Nothing stores which **days** were travel days, so a trip on 10-16 August cannot show once it ends.
- `travel_location_pings` stores raw position fixes only (`lat`, `lng`, `accuracy_m`, `source`, `timezone`, `captured_at`) — no day or trip concept, and only 116 rows total, all from one phone, ending 27 August. It cannot answer "was 12 August a travel day?".
- Shukrita's state row is now `not_travelling` (last change's backfill ran) and the hourly job is live — her `meta.last_sync_at` is 20:00 today.
- Her August trip does exist in calendar history (BA 183 on 9 Aug, DoubleTree stay 9-17 Aug, BA 188 on 17 Aug). Nothing travel-like exists on 1 September.

So the gap is that trip windows are never persisted anywhere — not sync frequency.

## What to build — no new tables

### 1. Persist trip windows inside `travel_state.meta`

`travel_state.meta` is already a free-form JSON field on a table that is fully wired (grants, RLS, service-role writes, read path). Add a `trips` array to it:

```text
meta.trips = [
  { start: "2026-08-09", end: "2026-08-17", source: "calendar",
    evidence: ["flight", "stay"], confidence: "high", updated_at: ... },
  ...
]
```

No migration, no new grants, no new read wiring — every existing reader of `travel_state` gets it for free.

### 2. Backfill from calendar history

A one-off pass over `calendar_events` that:

- finds trip evidence (flights, hotel/stay entries, offsite/conference entries) using the existing A-H resolver — no new taxonomy;
- merges overlapping evidence into continuous windows (9-17 Aug becomes one trip, not three isolated days);
- writes those windows into each person's `meta.trips`, preserving existing `meta` keys.

Run for everyone so history is consistent.

### 3. Keep future trips recorded

`travel-state-sync` (already running hourly) gains one extra step per run: rebuild `meta.trips` for the window "30 days back to 30 days forward" from calendar evidence, and stamp a trip as location-confirmed when a fresh fix inside the window agrees. Location evidence may confirm or extend a trip, never delete a calendar-derived one — same fail-open contract as the rest of the travel code.

### 4. Read path

`hydrate-travel-day.ts` gains a first evidence rung: if today falls inside a `meta.trips` window, it is a travel day. The existing timezone / distance / state rungs stay underneath unchanged. Brief, plan and nudges then treat those dates as travel days automatically, with no new screen.

### 5. Run it now

After deploying, trigger the sync once by hand and verify Shukrita's `meta.trips` contains 9-17 August. For 1 September I will report what her calendar actually holds rather than invent a trip — current data shows no travel evidence on that date.

## Technical notes

- Files touched: `supabase/functions/travel-state-sync/index.ts`, new `supabase/functions/travel-state-sync/trip-windows.ts` (window builder + unit tests), `supabase/functions/_shared/travel/hydrate-travel-day.ts`.
- Backfill executed as a one-off script through the sync function itself (`?mode=backfill`), so window-building logic exists in exactly one place.
- Trip evidence reuses `resolveEvent()` / existing event categories; no parallel classifier.

## Separate: the 47 backend test failures

Unrelated to travel; four groups:

- 44 in `compute-outer-readiness` (`body_copy`, `index`, `redundancy`) fail with HTTP 401 — those tests call the deployed function and the sandbox has no auth token. Environmental, not a code defect.
- `ledger-evolution.test.ts` — structural day-flag detection returns true where the test expects false.
- `plan-why-window-signals.test.ts` and `subcategory_persistence_test.ts` — source-text assertions that no longer match current imports.
- `v5_validation_test.ts` — rejects the live deep link `/plan?mode=week-ahead`, which is a valid route today.

Not part of this change. Say the word and I will fix the last four (the 401 group needs a token, not a fix).
