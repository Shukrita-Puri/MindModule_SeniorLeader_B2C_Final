

# Plan: Fix Wearable HRV Pipeline — 30-Day Historical Sync + Always-On Layer 3

## Problem Summary
The HealthKit integration queries 30 days of HRV data but **discards all but the latest sample**. Only one `hrv` value is sent per sync, and `hrv_samples` column stays NULL. This means:
- No baseline for 7 days (single sample = no deviation)
- Wearable never visibly impacts Inner Readiness unless divergence > 30 points
- No circadian/day-of-week HRV patterns possible

## Changes (6 files, 1 edge function redeploy)

### 1. `src/utils/healthKitCapacitor.ts` — Return ALL daily samples
- Change `queryHealthKitData()` to return an array of `{ date, hrv, hour }` for all samples (not just latest)
- Group samples by day, compute daily average
- Include hour-of-day for each sample (circadian tracking)
- Remove `limit: 50`, use `HKObjectQueryNoLimit` equivalent (remove limit param)

### 2. `src/services/wearableSyncService.ts` — Bulk persist all 30 days
- Change `syncHealthKitToBackend()` to send ALL daily samples in a single request
- New payload: `{ samples: [{ summary_date, hrv, hrv_samples: [{value, hour, timestamp}] }] }`
- Still sends to same `persist-wearable-data` endpoint but with bulk format

### 3. `supabase/functions/persist-wearable-data/index.ts` — Accept bulk + populate hrv_samples
- Accept either single `{ summary_date, hrv }` (backward compat) or `{ samples: [...] }`
- For each sample: upsert row with `hrv` (daily avg) + `hrv_samples` (raw JSONB array of `{value, hour, timestamp}`)
- This populates the currently-NULL `hrv_samples` column

### 4. `supabase/functions/compute-inner-readiness/index.ts` — Always-on Layer 3 + pattern detection
- **Layer 3 now fires even when ALIGNED**: Show HRV deviation % and educational context regardless of divergence threshold
- When aligned: "Your HRV is tracking X% [above/below] your 30-day baseline — your physiological state is [consistent with / slightly different from] how you feel."
- When aligned and deviation is minimal (< 5%): "Your HRV is steady at baseline — your body and mind are reading the same signal."
- **Pattern detection**: Accept optional `hrvPatternContext` from client (day-of-week + time-of-day aggregates) and include pattern observations like "3 Mondays this month show lower HRV while you reported feeling strong"

### 5. `src/utils/energyStateEngine.ts` — Compute HRV patterns from DB, send to scoring
- Before calling `compute-inner-readiness`, query `wearable_data` for 30-day history
- Compute: weekday vs weekend avg HRV, time-of-day patterns, day-of-week trends
- Send `hrvPatternContext` to the edge function for pattern-aware Layer 3 text
- Use 30-day baseline instead of 7-day for `wearableBaseline` (change `getUserHRVBaseline` window)

### 6. `src/components/home/TodayStateCard.tsx` — Remove "View insights" link
- Remove the bottom row with "View insights" CTA (per user request)
- Keep "Based on..." data sources text

### 7. `src/hooks/useWearableSync.ts` — Reduce stale threshold to 1 hour
- Change `STALE_THRESHOLD_MS` from 6 hours to 1 hour for more responsive sync

### 8. `src/utils/wearableContextAnalyzer.ts` — Expand baseline to 30 days
- Change `getUserHRVBaseline` from 7-day to 30-day window for richer baseline

## Data Flow After Changes

```text
HealthKit (30 days) → queryHealthKitData() returns ALL daily samples
  → syncHealthKitToBackend() sends bulk to edge function
    → persist-wearable-data upserts 30 rows with hrv + hrv_samples JSONB
      → energyStateEngine reads 30-day history, computes patterns
        → compute-inner-readiness uses patterns for always-on Layer 3
          → TodayStateCard shows HRV context even when aligned
```

## What Stays the Same
- All 4 scoring modes and their weights unchanged
- Divergence detection thresholds unchanged (>30 point gap)
- Tier mapping unchanged
- No UI layout or design changes beyond removing insights link
- No new tables or schema changes (uses existing `hrv_samples` JSONB column)

