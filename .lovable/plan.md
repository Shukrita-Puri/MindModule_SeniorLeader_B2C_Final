## Root cause (verified from DB)

Phase 1 backfill *did* populate `signal_summary.performance_lift` earlier, but the new v6 engine recompute overwrote it with all-null blocks. The diagnostics row makes the cause unambiguous:

| User | rows in last 30d | rows in last 60d | RHR days 30d | RHR days 60d | sleep_score days 60d |
|---|---|---|---|---|---|
| `google-oauth2\|111878…691` | 9 | 15 | **6** | **11** | 0 |
| `linkedin\|9JQfhVmok6` | 0 | 0 | 0 | 0 | 0 |
| `linkedin\|DFUJTWpo4O` | 0 | 0 | 0 | 0 | 0 |

`cause-effect-engine/index.ts` ships with `const WINDOW_DAYS = 30` (line 53). The engine queries `wearable_data` with `gte("summary_date", startStr)` where `startStr` is `today − WINDOW_DAYS`. So for the only user who has wearable data:

- RHR-recovery block needs ≥7 RHR days → has **6** in 30d (gate `insufficient_rhr_days`), but **11** in 60d (would pass).
- Sleep→Peak needs sleep_score → has **0** even at 60d (correctly `no_sleep_score_rows`, an Apple Health reality, not a code bug).

The two `linkedin` users simply have no wearable rows at all in any window — diagnostics correctly emit `no_rhr_rows` / `no_sleep_score_rows`, and the UI will render "Awaiting…" lines (already wired in `PerformanceLiftBlocks` from the v6 diagnostics work). Nothing more to ship for them.

Separately, the screenshot's three bullets ("Mondays run sharpest on Energy 88% …", "Thursdays slip on Energy …", "12 Sundays in a row on Sharpness …") come from `mindRhythmPatterns.topThree` in `performance-rhythm-insights/index.ts`, which still mines four dimensions including `energy` and `sharpness`. Those metrics are no longer tracked product-wide, so the findings are misleading.

## Fix

### 1. Restore engine window to 60 days
`supabase/functions/cause-effect-engine/index.ts`
- Change `const WINDOW_DAYS = 30` → `60`.
- Keep the `body.days` override (clamped 14–90) so callers can still narrow.
- No gate, baseline, or signal-quality rule changes. `MIN_OCCURRENCES_EMERGING`, ≥7-day, mean−1σ all untouched.

### 2. Drop Energy + Sharpness from rhythm pattern mining
`supabase/functions/performance-rhythm-insights/index.ts`
- Stop building `energySeries` (`buildOutcomeSeries`) and `sharpnessSeries` (`buildLevelSeries('mental_sharpness_level')`).
- Stop calling `mineSeries(...)` for those two dimensions.
- Drop them from the weighted merge (`energy: 0.10`, `sharpness: 0.20`) and from the `allFindings` concat.
- Keep `clarity` and `confidence` as the only two dimensions surfaced in `mindRhythmPatterns`.
- `RhythmDimension` type narrows to `'clarity' | 'confidence'`. The card already key-strings `f.dimension` so the label badge keeps working.

### 3. Re-run the admin backfill so the engine writes 60-day diagnostics + lift
After deploy, hit `admin-backfill-causality` once. Expectation:
- `google-oauth2|111878…691`: `rhr_recovery_window` becomes a real value (11 RHR days, gate now passes); `sleep_to_peak` stays null with reason `no_sleep_score_rows`; `hr_event_lift` likely still `all_subtypes_below_min_occurrences` but with `hrSamplesDays > 0`.
- Two `linkedin` users: diagnostics unchanged (no wearable data exists). Card shows the "Awaiting resting heart rate data from Apple Health" line — honest and expected.

### 4. No client changes
`PerformanceRhythmCard.tsx` already:
- Reads `data.performanceLift` and `data.performanceDiagnostics` from the edge response.
- Renders `PerformanceLiftBlocks` whenever `performanceLift` is truthy, and the block component itself prints the "Awaiting <reason>" footer when individual blocks are null.

So once the engine repopulates, the new blocks appear under "When You Perform Best" automatically, and the misleading Energy/Sharpness bullets disappear because they're no longer mined.

## Out of scope
- HealthKit ingestion. The pipeline is correct — devices simply aren't writing sleep_score / minute-level HR.
- Any loosening of `MIN_OCCURRENCES_EMERGING`, the ≥7-day gate, or the mean−1σ recovery filter.
- Removing the admin-bypass secret on the engine (user said leave it).
- Phase 2 Recovery Time tab.

## Files

```text
supabase/functions/cause-effect-engine/index.ts         (WINDOW_DAYS 30 → 60)
supabase/functions/performance-rhythm-insights/index.ts (drop energy + sharpness dims)
```

Then invoke `admin-backfill-causality` once and verify with:

```sql
select user_id, jsonb_pretty(payload->'diagnostics'->'counts'),
       jsonb_pretty(signal_summary->'performance_lift'->'rhr_recovery_window')
from causality_findings
order by updated_at desc limit 3;
```
