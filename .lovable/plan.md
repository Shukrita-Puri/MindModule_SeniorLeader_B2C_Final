## Goal

Make it impossible for an Apple Health-derived block (`sleep_to_peak`, `rhr_recovery_window`, `hr_event_lift`, `category_lift`) to disappear silently. When a block is null, the exact reason — and the counts behind it — must be queryable from the DB and visible in edge logs. No gates are loosened.

## Findings (no fix needed in ingestion)

Confirmed by reading `src/utils/healthKitCapacitor.ts` and `supabase/functions/persist-wearable-data/index.ts`:

- HealthKit bridge already reads HRV, RHR, minute-level HR, and sleep samples (`healthKitCapacitor.ts:278`) and forwards `hr_samples` per day (`:435`).
- `persist-wearable-data` already maps `resting_heart_rate`, `hr_samples`, `sleep_score` into `wearable_data` (`:176`, `:180`, `:184`).
- For user `google-oauth2|111878424918915566691`, the ingestion path is wired. Root cause is **HealthKit on that device is not returning `sleep_score` or minute-level HR samples** (likely no sleep tracking + no Apple Watch worn during events). Not a code bug.

Conclusion: the fix is **observability**, not ingestion. We add a structured diagnostic block written to DB on every engine run.

## Plan

### 1. New DB table: `wearable_signal_diagnostics`

One row per `(user_id, computed_at)` cause-effect-engine run. Columns:

- `user_id text`
- `computed_at timestamptz default now()`
- `window_days int` (60)
- `engine_version int`
- `sleep_score_day_count int`         — days with `sleep_score > 0`
- `rhr_day_count int`                  — days with `resting_heart_rate > 0`
- `hrv_day_count int`
- `hr_samples_day_count int`           — days where `hr_samples` array is non-empty
- `rhr_recovered_day_count int`        — days passing `rhrMean − 1σ`
- `rhr_window_bucket_counts jsonb`     — `{morning, afternoon, evening}` brief counts on recovered days
- `event_days_with_hr int`             — calendar event count whose day has `hr_samples`
- `gate_reasons jsonb`                 — `{ sleep_to_peak: "...", rhr_recovery_window: "...", hr_event_lift: "...", category_lift: "..." }`. Each value is either `"ok"` or one of the named gates below.

RLS: deny by default. `service_role` ALL. `authenticated` SELECT scoped to `user_id = auth.jwt() ->> 'sub'` so users can see their own diagnostics.

### 2. Engine instrumentation (`supabase/functions/cause-effect-engine/index.ts`)

Inside the `performance_lift` IIFE, replace silent early-returns with named reasons. Sentinel values:

- `sleep_to_peak`:
  - `no_sleep_score_rows` (count == 0)
  - `insufficient_sleep_days` (count < 7)
  - `no_prs_baseline`
  - `insufficient_next_day_prs` (`nextDayPrs.length < MIN_OCCURRENCES_EMERGING`)
  - `ok`
- `rhr_recovery_window`:
  - `no_rhr_rows`
  - `insufficient_rhr_days` (< 7)
  - `no_recovered_days_after_filter` (recoveredDays empty after `mean − 1σ`)
  - `bucket_below_min_occurrences` (all windows < `MIN_OCCURRENCES_EMERGING`)
  - `no_positive_lift`
  - `ok`
- `hr_event_lift`:
  - `no_hr_samples` (`hrSamplesByDay` empty)
  - `no_resting_baseline`
  - `no_event_day_overlap` (had samples but no event start/end fell inside any sample)
  - `all_subtypes_below_min_occurrences`
  - `ok`
- `category_lift`: same pattern, derived from `hr_event_lift` outcome.

Counts (`sleepDayCount`, `rhrDayCount`, `recoveredDayCount`, `winAcc` lengths, `hrSamplesByDay.size`, `eventDaysWithHr`) are accumulated inline and returned alongside the reason. Engine still computes and returns the same `performance_lift` shape — the diagnostics ride alongside.

After computing, insert one row into `wearable_signal_diagnostics`. Also `console.log("[cause-effect][diag]", JSON.stringify(diag))` so it appears in edge function logs.

Engine version bump → `6`.

### 3. Surface in payload

Add `diagnostics: WearableDiagnostics` to the engine response (and the `signal_summary.performance_lift_diagnostics` key on `causality_findings`) so downstream consumers and the existing card can display *"sleep block unavailable because no sleep_score rows"* instead of a blank.

### 4. UI hint (small, isolated)

In `PerformanceLiftBlocks` (consumed by `PerformanceRhythmCard`), when a block is null AND a diagnostic reason exists, render a single muted line: `Awaiting <reason>` (mapped to human strings). No layout change, no new card.

### 5. Tests (`supabase/functions/cause-effect-engine/diagnostics_test.ts`)

Deno tests exercising the diagnostic builder as a pure function (extracted into `buildPerformanceLift(...)` so it's unit-testable):

- Zero sleep_score rows → `sleep_to_peak.reason === "no_sleep_score_rows"`, `sleepDayCount === 0`.
- 11 RHR days, only 2 pass mean−1σ → `rhr_recovery_window.reason === "no_recovered_days_after_filter"` or `bucket_below_min_occurrences` depending on bucket counts.
- No `hr_samples` anywhere → `hr_event_lift.reason === "no_hr_samples"`.
- All gates pass with synthetic 14-day perfect data → all `ok`.

### 6. Manual verification

After deploy, hit `admin-backfill-causality` for the 3 active users, then:

```sql
select user_id, computed_at, gate_reasons, sleep_score_day_count,
       rhr_day_count, rhr_recovered_day_count, hr_samples_day_count
from wearable_signal_diagnostics
order by computed_at desc limit 9;
```

Expectation for `google-oauth2|111878424918915566691`:
`gate_reasons.sleep_to_peak = "no_sleep_score_rows"`, `sleep_score_day_count = 0`, `hr_event_lift = "no_hr_samples"`, `rhr_recovery_window = "bucket_below_min_occurrences"` with `rhr_recovered_day_count ≈ 2`.

## Out of scope

- HealthKit bridge changes — already writes everything required.
- Relaxing any gate (`MIN_OCCURRENCES_EMERGING`, ≥7-day, mean−1σ) — explicitly forbidden.
- Phase 2 Recovery Time tab — already shipped.

## Files changed

```text
supabase/migrations/<ts>_wearable_signal_diagnostics.sql   (new)
supabase/functions/cause-effect-engine/index.ts            (+ diagnostics, engine v6)
supabase/functions/cause-effect-engine/diagnostics_test.ts (new)
src/components/insights/PerformanceCausalityCard.tsx       (or PerformanceRhythmCard — "Awaiting X" line)
mem://reliability/wearable-signal-diagnostics.md           (new memory)
```
