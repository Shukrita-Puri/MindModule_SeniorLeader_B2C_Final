# MRS Week-over-Week: plain weekly averages

Keep the existing card, hook and edge function exactly as they are structurally. Only the window and averaging semantics change. No new component, hook, API, table, or UI.

## Consumers confirmed

`summarizeWeek` / `computeWeeklyDeltaComparison` are used only by `mental-fitness-scores/index.ts` and its Deno test. `thisWeekAvg` / `lastWeekAvg` / `baselineDelta` / `refinedDelta` / `reason` flow only through `useWeeklyMrsDelta.ts` → `MrsPage.tsx` → `WeeklyDeltaDial.tsx` (+ its Vitest file). `App.tsx:240` already invalidates `['mrs-weekly-delta']`, so the existing refresh path is reused.

## Server — `supabase/functions/mental-fitness-scores/index.ts`

1. `summarizeWeek()` becomes a plain average over the supplied date range:
   - Row score = `readiness_score_refined ?? readiness_score_baseline`, kept only when finite.
   - `readiness_state === 'awaiting'` and both-null rows are excluded (never zero).
   - Returns `{ average, scoredDays, totalDays }`; `composition` stays only as diagnostic metadata and no longer nulls the average. The `mixed || unknown → average: null` branch is deleted.
2. `computeWeeklyDeltaComparison()` takes explicit calendar-week boundaries — `thisMonday → today` and `lastMonday → lastSunday` — and returns one authoritative value per concept: `thisWeekAvg`, `lastWeekAvg`, `delta`. Full precision internally, rounded at the output edge.
   - `delta` is set whenever both averages exist, regardless of composition. Otherwise `delta = null` with `reason = 'not_enough_history'`.
   - `composition_mismatch` / `awaiting_signals` are no longer produced as suppression reasons.
   - `baselineDelta` / `refinedDelta` are removed from the comparison result and the response, since the only consumers are the hook and tests updated in this change — no misleading duplicate semantics kept.
3. `GET_WEEKLY_DELTA` accepts `lastSunday` (falling back to `lastMonday + 6` when an older client omits it). `lastToday` is no longer used for the window at all, so weekday truncation is structurally impossible; it is accepted and ignored for request compatibility.

## Client — `src/hooks/useWeeklyMrsDelta.ts`

- Sends `lastSunday` alongside the existing anchors.
- Reads the single top-level `delta`; `mode` continues to come from `todayState` for the existing "Read" label.
- `thisWeekAvg` / `lastWeekAvg` are passed through whenever numeric — `reason` no longer blanks them.
- Query key gains today's local date (`['mrs-weekly-delta', userId, todayISO]`), reusing the existing `App.tsx` invalidation rather than adding a second refresh mechanism.

## Client — `src/components/home/mrs/WeeklyDeltaDial.tsx`

- Renders `thisWeekAvg` / `lastWeekAvg` when present, independent of `reason`.
- Progress shows the delta when both averages exist, otherwise `—`.
- No layout, copy-system, icon, or state changes.

## Provenance

Source table `daily_context_snapshot`; score `readiness_score_refined ?? readiness_score_baseline`; this week `Monday → today`; last week `previous Monday → previous Sunday`. No schema change, no new persistence.

## Expected result for the current data

```text
This week (Aug 3 87, Aug 4 87, Aug 5 awaiting) -> 87
Last week (Jul 30 65, Jul 31 94, Aug 1 74)     -> 78
Progress                                        -> +9
```

## Verification

- Deno tests in `mental-fitness-scores/index.test.ts` covering: full previous week Mon→Sun (mandatory anti-truncation regression), awaiting rows excluded, mixed composition within a week, baseline-week vs refined-week, missing previous week, today's score changing the current-week average, and the real-data case (87 / ~78 / ~+9). The existing composition-suppression tests are replaced, since that behaviour is intentionally retired.
- Vitest update for `WeeklyDeltaDial.test.tsx` (last-week value renders with mismatched composition), plus the existing suites and `tsgo` typecheck.
- Live DB read confirming Aug 3/4 = 87, Aug 5 awaiting, Jul 30/31/Aug 1 = 65/94/74, then a live `GET_WEEKLY_DELTA` call reporting each week's dates, scored days, average, and the delta.
- Report commit SHA, files changed, and files intentionally unchanged.

Nothing in MRS scoring, gates, tiers, redistribution, Brief, Plan, or Nudges is touched.