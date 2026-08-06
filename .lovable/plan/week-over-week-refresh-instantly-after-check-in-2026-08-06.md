# Week-over-Week: refresh instantly after check-in

## What's happening now (verified)

The MRS card, Brief, Plan and signal pills all refresh immediately after a check-in because the two save paths explicitly clear and re-fetch their queries. The Week-over-Week panel does not: neither save path touches its query.

- `src/pages/DailyCheckIn.tsx` (lines 289-339) invalidates `energy-state`, `outer-readiness`, then after the `build-executive-home-cards` rebuild removes + invalidates `mrs-snapshot`, `current-brief-snapshot`, `mastery-plan-snapshot`. `mrs-weekly-delta` is not in either list.
- `src/pages/CheckInDetail.tsx` (lines 214-218) has the same gap.
- `src/hooks/useWeeklyMrsDelta.ts` uses `staleTime: 5 * 60 * 1000`, so the cached baseline answer is served for up to 5 minutes even on remount.
- The only place that invalidates `['mrs-weekly-delta']` is the Apple Calendar watcher in `src/App.tsx:241` — an unrelated trigger. That's why the panel eventually flips to refined, but late and by accident.

So the delay is purely a cache-invalidation gap on the client, not a scoring or cron issue. The server function already resolves the active metric from today's row, so it returns the refined view as soon as the refined score is in `daily_context_snapshot` — which the `build-executive-home-cards` call at check-in save already writes before the client returns.

## Changes

1. `src/pages/DailyCheckIn.tsx` — add `mrs-weekly-delta` to the post-rebuild refresh block (line ~332-339): `removeQueries` then `invalidateQueries`, alongside the three existing snapshot keys. Placed after the rebuild so the refetch reads the refined snapshot, not the pre-check-in one.
2. `src/pages/CheckInDetail.tsx` — same addition to its post-rebuild block (line ~214).
3. `src/hooks/useWeeklyMrsDelta.ts` — drop `staleTime` to `0` (or 30s) so an invalidation always triggers a real network refetch rather than serving the cached baseline answer. No change to the query key, request body, or response handling.

Nothing else changes: no edge function change, no scoring change, no UI/layout change, no new hook or query.

## Why this is enough

`removeQueries` + `invalidateQueries` on a hook with no stale window forces an immediate refetch the moment the check-in save finishes its rebuild, which is exactly the same mechanism the MRS score and Brief already use to flip to refined in the same instant.

## Verification

- Vitest: existing `WeeklyDeltaDial.test.tsx` and check-in suites stay green; add an assertion in the check-in tests that `mrs-weekly-delta` is invalidated after save.
- `tsgo` typecheck.
- Live check for a test user: read `daily_context_snapshot` before/after a check-in to confirm the refined score lands, then confirm `GET_WEEKLY_DELTA` returns `comparisonMetric: 'refined'` immediately after the rebuild call.
