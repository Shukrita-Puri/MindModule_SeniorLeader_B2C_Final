## Where wearable patterns live today

**Stored values** (canonical source = `wearable_data` table):
- `hrv` — numeric, per `summary_date`
- `resting_heart_rate` — integer
- `sleep_score` — integer (0–100)
- `total_sleep_minutes` — integer (sleep *duration*)
- `deep_sleep_minutes`, `rem_sleep_minutes`, `steps`, `active_calories`, `heart_rate`
- **`sleep_efficiency` is NOT stored.** It is derived on the fly inside `supabase/functions/compute-outer-readiness/index.ts` (lines 1745–1762) from `raw_data.efficiency` / `raw_data.sleep.efficiency` / `time_in_bed`, and lives only in the brief response as `wearableContext.sleepEfficiency`.

**Where wearable signals are *used* today**:
1. `compute-outer-readiness/index.ts` — builds `wearableContext` for the Cognitive (HRV + Sleep) and Resilience (Sleep Efficiency anchor + Mind overlay) pills.
2. `_shared/signal-engine/checkin-pattern-aggregator.ts → getPillQualifiers` — produces moment-only qualifiers (`delta3d`, `vsBaselinePct`, `durationDelta7d`, `scoreVsBaseline`) shown bracketed on the homepage pills. **No DOW / streak / cell mining.**
3. `performance-rhythm-insights/index.ts` — fetches `hrv` + `rhr` only for the Cause-Effect block (HRV × event-type correlations). It does **not** mine wearable rhythm patterns into the "Performance Patterns" top-3 — that list is currently 100% check-in driven (`clarity / emotion / pressure / regulation`).

**Surface that renders patterns**: `src/components/insights/PerformanceRhythmCard.tsx` reads `data.mindRhythmPatterns.topThree` and renders the "Performance Patterns" block (lines 1406–1442).

---

## What we're building

Add 4 new "wearable dimensions" (`hrv`, `sleep_score`, `sleep_duration`, `sleep_efficiency`) into the existing Performance Patterns ranking, mined with the same DOW / time-of-day / consecutive-run engine the 4 Mind dims use, so a finding like "5 Mondays in a row your HRV dropped below baseline" can win a top-3 slot alongside Clarity / Emotion patterns. The exact same numeric series powers the Cognitive and Resilience pills, ensuring the homepage tooltip and Insights bullets stay consistent.

---

## Plan

### Step 1 — DB migration: persist `sleep_efficiency`

Add column + backfill so the pattern miner can read 30 days of efficiency without re-parsing `raw_data` per row.

```text
ALTER TABLE public.wearable_data
  ADD COLUMN sleep_efficiency smallint
  CHECK (sleep_efficiency IS NULL OR sleep_efficiency BETWEEN 0 AND 100);

-- Backfill: derive from raw_data.efficiency / sleep.efficiency / time_in_bed.
UPDATE public.wearable_data
SET sleep_efficiency = ...derivation...
WHERE sleep_efficiency IS NULL;
```

Update `persist-wearable-data` (Oura + HealthKit code paths) to compute and write `sleep_efficiency` on every sync, reusing the existing derivation logic from `compute-outer-readiness` (extracted to a shared helper `_shared/wearable/derive-sleep-efficiency.ts`).

`compute-outer-readiness` switches to reading the stored column with the in-line derivation kept only as a fallback for rows synced before the migration.

### Step 2 — Extend `_shared/signal-engine/checkin-pattern-aggregator.ts`

Add a new pure function:

```typescript
export type WearableDim = 'hrv' | 'sleep_score' | 'sleep_duration' | 'sleep_efficiency';

export function buildWearableDailySeries(
  rows: WearableRow[],   // last 30d
  dim: WearableDim,
  baselines: { hrv?: number; sleep_score?: number; sleep_duration?: number; sleep_efficiency?: number }
): Array<{ date: string; di: number; tw: 0|1|2; positive: boolean; negative: boolean; value: number }>;
```

Band definitions (positive = "good day", negative = "bad day"):

| Dim              | Positive band              | Negative band               |
|------------------|----------------------------|-----------------------------|
| `hrv`            | value ≥ baseline           | value ≤ baseline × 0.90     |
| `sleep_score`    | ≥ 75                       | ≤ 60                        |
| `sleep_duration` | ≥ 420 min (7 h)            | ≤ 360 min (6 h)             |
| `sleep_efficiency`| ≥ 85                      | ≤ 75                        |

`tw` is fixed at `0` (morning) since wearables write one row per night — but the field is kept so the existing `mineSeries` shape stays compatible (time-of-day patterns will simply never trigger for wearable dims, only DOW + consecutive-run).

### Step 3 — `performance-rhythm-insights/index.ts` rewrite

1. Extend the wearable query to pull `sleep_score, total_sleep_minutes, sleep_efficiency` (currently only `hrv, resting_heart_rate`).
2. Compute 30-day baselines per dim once (same shape that `compute-outer-readiness` already uses).
3. Build 4 new series via `buildWearableDailySeries` and feed each into the existing `mineSeries` function. Add to `RhythmDimension`:
   ```ts
   type RhythmDimension =
     | 'clarity' | 'emotion' | 'pressure' | 'regulation'
     | 'hrv' | 'sleep_score' | 'sleep_duration' | 'sleep_efficiency';
   ```
4. Provide `vocab` per wearable dim, e.g.:
   ```ts
   { dimension: 'hrv', appLabel: 'HRV',
     positivePhrase: 'recovered', negativePhrase: 'depressed',
     longPositiveLabel: 'above baseline', longNegativeLabel: '≥10% below baseline' }
   ```
5. Extend `DIMENSION_BONUS` so wearable findings can win but don't dominate cognition:
   ```ts
   const DIMENSION_BONUS = {
     clarity: 0.15, regulation: 0.12, emotion: 0.10, pressure: 0.08,
     hrv: 0.13, sleep_score: 0.11, sleep_duration: 0.11, sleep_efficiency: 0.09,
   };
   ```
6. Keep the diversity guard intact (≤2 per dimension, ≤2 per kind) so the top-3 never becomes "all sleep".
7. Keep the existing HRV × event-type Cause-Effect block untouched — it serves a different question.

### Step 4 — `compute-outer-readiness` reuses the same series

`getPillQualifiers` (the SSOT for homepage pill brackets) already pulls 14d of wearable + check-in rows. Extend it to also return the same series the rhythm function uses, ensuring identical numbers in both surfaces:

- Cognitive pill tooltip now shows e.g. "HRV 48 (−6% vs baseline · 5-day streak below baseline)" — the "5-day streak" string comes from the shared aggregator, not from Insights.
- Resilience pill tooltip now shows e.g. "Sleep Efficiency 82 (−4 vs baseline · Mondays trend low)" when the DOW finding exists.

No new round trip — `compute-outer-readiness` already echoes `pillQualifiers`; we just enrich its payload.

### Step 5 — Frontend (`PerformanceRhythmCard.tsx`)

Minor only:
- Update `RhythmFinding.dimension` type union to include the 4 new wearable dims.
- `dimLabel` formatter already auto-titles, but rename `'sleep_score'` → `"Sleep Score"`, `'sleep_duration'` → `"Sleep Duration"`, `'sleep_efficiency'` → `"Sleep Efficiency"` via a tiny label map. **No layout changes.**
- "Data source note" line: include "Sleep" alongside existing "HRV reading" count.

### Step 6 — Docs + memory

- Update `docs/MRS_V3_SPECIFICATION.md` §8.1: add wearable dim qualifier fields.
- Update memories: `mem://architecture/signal-engine/checkin-pattern-aggregator` (rename to `signal-pattern-aggregator` to reflect expanded scope), and `mem://integrations/wearable/database-schema-standard` to list `sleep_efficiency`.

---

## Files touched

| File | Change |
|------|--------|
| `supabase/migrations/<ts>_add_sleep_efficiency.sql` | new column + backfill |
| `supabase/functions/_shared/wearable/derive-sleep-efficiency.ts` | new (extracted helper) |
| `supabase/functions/_shared/signal-engine/checkin-pattern-aggregator.ts` | add `buildWearableDailySeries`, extend `PillQualifiers` |
| `supabase/functions/persist-wearable-data/index.ts` | write `sleep_efficiency` |
| `supabase/functions/compute-outer-readiness/index.ts` | read stored `sleep_efficiency`, enrich pill qualifiers |
| `supabase/functions/performance-rhythm-insights/index.ts` | wire 4 wearable series into `mineSeries`, extend `RhythmDimension` |
| `src/components/insights/PerformanceRhythmCard.tsx` | label map for wearable dims |
| `docs/MRS_V3_SPECIFICATION.md` + 2 memory files | docs |

## Acceptance criteria

- Wearable findings can appear in `mindRhythmPatterns.topThree` when statistical gates pass (≥7 obs / ≥3 consecutive).
- Same `delta3d` / `streak` numbers shown on the homepage pill tooltips and the Insights Performance Patterns bullets.
- `sleep_efficiency` is persisted on every new sync; existing 30-day history is backfilled.
- Diversity guard prevents 3 sleep findings from filling the top-3.
- HRV × event-type Cause-Effect block on /insights is unchanged.
- MRS pill tiers unchanged — wearable patterns are **display-only enrichment**, never alter pill tier (per existing MRS v3 contract).