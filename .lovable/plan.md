# Three fixes — Executive Home polish + WoW dial (spec-aligned)

## 1. Resurrect "Today's Priorities" card on Executive Home

`TodayThreePriorities` already renders the 3 horizon-classified priority practices on `/executive-home`, but it renders bare today — no card shell, no eyebrow — which visually disconnects it from the Performance Readiness Brief sitting directly above it in a `card-hero` shell.

Change in `src/pages/ExecutiveHome.tsx` (around L289):
- Wrap the existing `<TodayThreePriorities />` in `<div className="rounded-xl card-hero p-4 animate-fade-in">` — identical to `DecisionReadinessBrief` (L1882).
- Above the priorities, render the same eyebrow row as the brief (DecisionReadinessBrief L1884–1892), with `Today's Priorities` on the left and the same time · date label on the right (e.g. `Afternoon · Wed 3 June`).
- Extract the existing `getTimeLabel()` / `getDateLabel()` helpers from `DecisionReadinessBrief` into a tiny shared util (`src/components/home/timeLabel.ts`) and import in both files so the eyebrow text matches exactly.

No edits inside `TodayThreePriorities` itself.

## 2. Remove the dark gradient behind the MRS score

`src/components/home/mrs/MrsGauge.tsx` fills the orb body with two tinted radial gradients (`mrs-orb`, `mrs-orb-shadow`) that wash the disc in the tier colour (the sandy/green ball behind the number).
- Drop both orb-fill `<circle>` calls.
- Keep the outer halo (`mrs-glow`), the track ring, the coloured arc, and the specular highlight.
- Result: white disc, coloured arc only — the green ring does the colour coding.

## 3. WoW dial — spec-aligned calculation + state-matched rendering

### Spec (from user, canonical)

Two parallel series, identical formula, different input column.

```text
weekDelta = ROUND( AVG(score, this Mon→today)  −  AVG(score, last Mon→Sun) )

baseline series → readiness_score_baseline (always populated)
refined  series → readiness_score_refined  (NULL days excluded from AVG)
```

Disk shows whichever series matches today's `readiness_state` (Baseline or Refined). If the refined series has < 3 days this week + last week combined, fall back to baseline delta but keep state label honest. If `lastWeekAvg` for the chosen series is NULL, the row is hidden (delta = null → "Building your weekly trend").

Arc colour by delta direction: `> +1 → green`, `< −1 → red`, otherwise neutral (already implemented in `WeeklyDeltaDial`).

### Server changes — `supabase/functions/mental-fitness-scores/index.ts` (GET_WEEKLY_DELTA, L95–198)

- Continue collapsing `brief_snapshots` to one row per `local_date` (last-write-wins by `created_at`).
- Build two daily series from the same row set:
  - `baselineDay = baseline_score ?? refined_score` (historical rows have only `refined_score` populated — treat them as the baseline series for back-compat, matching what the spec calls "always populated").
  - `refinedDay = refined_score` only when the day has a check-in (i.e. `refined_state = 'refined'` OR a non-null `refined_score` paired with a `daily_checkin_id` for that day's snapshot). Days without a check-in are excluded from the refined average.
- Compute `baselineThisAvg / baselineLastAvg / refinedThisAvg / refinedLastAvg` exactly as in the spec; `ROUND` deltas to integers.
- Derive `todayState` robustly:
  - If today's row has `refined_state = 'refined'` OR (`refined_score IS NOT NULL` AND a same-day `daily_checkin_id` exists) → `'refined'`.
  - Else → `'baseline'`.
- Add `refinedDays` (count of non-null refined days across this + last week) so the client can apply the "< 3 days → fall back" rule.

Return:
```ts
{
  baselineDelta, refinedDelta,
  baselineThisAvg, baselineLastAvg, refinedThisAvg, refinedLastAvg,
  todayState, refinedDays
}
```

### Client changes — `src/hooks/useWeeklyMrsDelta.ts`

- Drop `staleTime` to `30_000` and add `refetchOnMount: 'always'` so a stale empty payload (cached from before the two-state migration) doesn't pin the dial.
- New selection rule, lifted directly from the spec:
  ```ts
  const refinedUsable = refinedDelta !== null && (refinedDays ?? 0) >= 3;
  const mode: 'baseline' | 'refined' =
    (todayState === 'refined' && refinedUsable) ? 'refined' : 'baseline';
  const delta = mode === 'refined' ? refinedDelta : baselineDelta;
  ```
- Keep `enabled: !!userId` and `console.warn` on failure.

### Component — `src/components/home/mrs/WeeklyDeltaDial.tsx`

- Existing direction colour logic (`>+1 green`, `<−1 red`, else neutral) already drives both the arc fill and the centred number — no math change.
- Tint the floating glass badge ring with the same `colorVar` at low opacity so the green/red signal reads at a glance.
- Caption stays `vs last week · {mode}`. When `delta === null`, keep `"Building your weekly trend"`.

## Out of scope
- No schema changes; no migrations.
- No edits to `compute-outer-readiness`, brief copy, scoring math, or `TodayThreePriorities` internals.
- No month-delta UI (spec mentions month windows but the dial only renders week today).

## Files touched
- `src/pages/ExecutiveHome.tsx` — wrap priorities in card + eyebrow.
- `src/components/home/timeLabel.ts` — new shared helper (extract `getTimeLabel`, `getDateLabel`).
- `src/components/home/DecisionReadinessBrief.tsx` — import from the shared helper.
- `src/components/home/mrs/MrsGauge.tsx` — remove tinted orb fills.
- `supabase/functions/mental-fitness-scores/index.ts` — spec-aligned two-series math, robust `todayState`, expose `refinedDays`.
- `src/hooks/useWeeklyMrsDelta.ts` — series selection per spec + tighter cache.
- `src/components/home/mrs/WeeklyDeltaDial.tsx` — badge ring tint on positive/negative delta.
