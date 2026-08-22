# Include Saturday and Sunday in the Stress Load engine

The grid already renders a full Mon–Sun week on screen. The two weekend columns are empty because the engine drops weekend events before any maths. This run widens the engine's bucket set so Saturday and Sunday are calculated like any other day.

## What changes

- The Stress Load day set goes from Mon–Fri to Mon–Sun.
- Weekend events with heart-rate samples inside their window now contribute to cells, sample counts, confidence tiers, "peak / quietest cell" and "heaviest day" exactly as weekday events already do.
- No formula, weight, threshold or gate changes: the same per-event maths (event-window peak HR minus resting baseline) applies, only the set of days included widens.

## Safety (pre-launch)

- Payload shape is unchanged — `days`, `cells`, `n`, `confidence` stay the same structures, just seven rows instead of five. The card already builds its columns from a fixed Mon–Sun list and tolerates extra/missing days, so an old cached payload keeps rendering correctly.
- `signal_summary` (read by smart nudges) is untouched, so nudges and deep links are unaffected.
- The engine version is bumped so each user recomputes once on next card load; if a recompute fails, the previously cached payload is still served.
- Burnout, Recovery and the "When You Perform Best" card are not touched.

## Technical notes

- `supabase/functions/cause-effect-engine/index.ts`: `DAY_LABELS` becomes `['Mon'..'Sun']`; `dayIndex()` maps day-of-week `0=Sun..6=Sat` to `(d + 6) % 7` instead of returning `-1` for weekends. Accumulators, cells, `n`, confidence, day totals and `topDay` all derive from `DAY_LABELS`, so they widen automatically.
- Bump `ENGINE_VERSION` 6 → 7 to trigger the one-time recompute.
- Deploy `cause-effect-engine`, then verify against the account's known weekend rows (15 Aug Sat, 9 Aug Sun) that the Sat/Sun cells populate with the expected deltas.
- Also update the weekend note in `docs/INSIGHTS_DRAIN_AND_LIFT_CARDS_AUDIT.md` (open question 5) to reflect that weekends are now bucketed.
- Verification: typecheck, build, existing insights tests, read-only query reconciling one Sat and one Sun cell, and a mobile screenshot of the Stress Load tab.
