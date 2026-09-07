# Trip windows reaching the brief's Light Day call

## Storage check (done)

Checked against the live database first: the `trips` array already exists inside `travel_state.meta`, and August is already backfilled. Shukrita's row holds

```text
trips: [{ start: 2026-08-09, end: 2026-08-17, source: calendar,
          evidence: [flight, stay], confidence: high }]
```

and the hourly job refreshed every row at 13:00 today (two other people have trips too). So no migration and no new backfill are needed — that work landed in the previous change.

## What is broken

Light Day classification does not see those windows everywhere.

- The plan generator and the home cards pass the trip window through, so they classify a trip run correctly.
- The brief (`compute-outer-readiness`) builds its own inputs for `classifyLightDay` and passes no trip window and no shared availability — so on an interior day of a confirmed trip it can still read the day as an ordinary quiet workday.

## Fix — `compute-outer-readiness/index.ts` only

1. Use the trip window already hydrated in this run (from `travel_state.meta.trips` via the travel hydration) — do not re-fetch or re-derive it.
2. Pass that trip window and the away distance into the `classifyLightDay` call, matching the shape the plan generator already uses.
3. Reuse the availability result the run already computes instead of deriving a second one.
4. Verify the plan generator's `availability` object is built with the trip window; wire the field if it is missing, with no other logic change.

## Tests (added to existing suites, no new files)

- Interior day of the 9–17 August window: brief, plan and nudges return the same Light Day verdict and the same availability state.
- First day of the trip: travel-day classification consistent across all three surfaces.
- Last day of the trip: same.

## Not in scope

Schema changes, UI, new modules, the attendee-relationship resolver loop (parked for a later change), and everything else in the travel or scoring stack.

## Technical notes

- Files touched: `supabase/functions/compute-outer-readiness/index.ts`, possibly `supabase/functions/generate-mastery-plan/index.ts` (one field), plus existing test suites.
- Deploy: `compute-outer-readiness`, and `generate-mastery-plan` if the field change is needed. Server-side only — identical on iOS and web.
