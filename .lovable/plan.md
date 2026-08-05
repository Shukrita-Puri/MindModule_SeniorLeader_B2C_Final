# MRS Week-over-Week: plain weekly averages

Keep the card exactly as it is (This week / Last week / Progress). Only the numbers behind it change: they become straightforward weekly averages of whatever MRS scores exist, with no composition gating.

## What changes

**Server — `supabase/functions/mental-fitness-scores/index.ts`**

1. Rewrite `summarizeWeek()` to be a pure average:
   - Per row, the usable score is `readiness_score_refined ?? readiness_score_baseline`.
   - Rows with `readiness_state === 'awaiting'` or both scores null are excluded (never counted as 0).
   - Return `{ average, scoredDays, totalDays }` plus the existing `composition`/`metric` fields (kept for response compatibility, no longer used to null the average).
   - Remove the `if (mixed || firstComposition === 'unknown') return { average: null }` branch.
2. Rewrite `computeWeeklyDeltaComparison()`:
   - Compute `thisWeekAvg` (Mon→today) and `lastWeekAvg` (last Mon→last Sun) from the new summaries, unrounded internally, rounded for output.
   - `delta = round(thisWeekAvg - lastWeekAvg)` and `percentChange` when both exist; otherwise both null with `reason = 'not_enough_history'`.
   - Never emit `composition_mismatch` or `awaiting_signals` as a suppression reason for the averages. Keep the fields in the response so nothing breaks, but they no longer gate.
   - Keep populating `baselineDelta`/`refinedDelta` from the same single delta (so the existing client contract still resolves a value) and add an explicit `delta` field.
3. `GET_WEEKLY_DELTA` handler: accept `lastSunday` as the end of the previous week window (still accept `lastToday` as a fallback for older clients) and pass it to the comparison. The DB fetch already spans `lastMonday → today`.

**Client — `src/hooks/useWeeklyMrsDelta.ts`**

- Send `lastSunday` (last Monday + 6 days) alongside the existing anchors.
- Read `delta` from the new top-level field, falling back to refined/baseline delta.
- Stop treating `reason` as a reason to blank `thisWeekAvg` / `lastWeekAvg`; only null values suppress.
- Add today's local date to the query key so the week refreshes when today flips from awaiting to scored, and invalidate `['mrs-weekly-delta']` where the MRS snapshot query is invalidated.

**Client — `src/components/home/mrs/WeeklyDeltaDial.tsx`**

- Show `thisWeekAvg` / `lastWeekAvg` whenever present, independent of `reason`.
- Progress shows the delta whenever both averages exist; otherwise `—`.
- No layout, styling, or copy-structure redesign.

## Expected result for the current data

```text
This week (Aug 3 87, Aug 4 87, Aug 5 awaiting) -> 87
Last week (Jul 30 65, Jul 31 94, Aug 1 74)     -> 78
Progress                                        -> +9
```

## Verification

- New Deno tests in `supabase/functions/mental-fitness-scores/index.test.ts` covering acceptance tests A–F (the existing composition-suppression tests are replaced, since that behaviour is intentionally retired).
- Existing Deno + Vitest suites, plus `tsgo` typecheck.
- Live `GET_WEEKLY_DELTA` call for the affected account, reporting scored-day counts, both averages, delta and trend, plus files changed.

Nothing in MRS scoring, gates, tiers, redistribution, Brief, Plan, or Nudges is touched.