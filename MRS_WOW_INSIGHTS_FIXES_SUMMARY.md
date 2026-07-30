# MRS, Week-on-Week & Insights — Fixes & Dev Implementation Summary

**Date:** July 30, 2026  
**Source:** Audit & Verification of `MRS_WOW_INSIGHTS_AUDIT_AND_GUIDE-2.md`  
**Status:** Code fix implemented & verified. TypeScript compilation passes with zero errors.

---

## 1. Executive Summary & Root Cause Findings

1. **MRS Scoring Math & Architecture:**
   - Confirmed spec-compliant. `compute-inner-readiness` is a pure calculator (0 DB calls) implementing MRS v4.
   - When users see *"minimum data / calendar only"* or *"awaiting signals"*, it is **not** a calculation bug. It occurs when wearable data is stale/missing (>24h) or when the 15-min cron (`build-executive-home-cards`) has not yet populated `daily_context_snapshot` for the current window.

2. **Week-on-Week (WoW) Delta:**
   - Math is architecturally correct (genuine arithmetic mean of daily readiness scores).
   - Shows `—` when history has `< 1` row in either week or when wearable signals are awaiting.
   - Self-populates automatically after ~5–7 days of consistent 15-min cron ticks and active wearable data sync.

3. **Insights Charts (Day / Month / 6M / 12M):**
   - **Root Cause Identified:** `inner_readiness_scores` table had **zero writers** during regular cron and brief generation runs.
   - **Fix Implemented:** Added `inner_readiness_scores` upsert writer to `build-executive-home-cards/index.ts` and `compute-outer-readiness/index.ts`.

---

## 2. Code Changes Made

### Fix I1: `inner_readiness_scores` Writer (The Critical Fix)

1. **`supabase/functions/build-executive-home-cards/index.ts`**
   - Imported `redactUserId` from `../_shared/identity/redact-user-id.ts`.
   - Right after `compute-inner-readiness` calculation, added an idempotent `upsert` to `inner_readiness_scores` when `mrsIsReady` is true and a numeric score is produced.
   - Saves `composite_score`, `energy_tier`, `time_of_day`, `check_in_outcome`, `clarity_level`, `confidence_level`, `full_context_statement`, `divergence_overlay`, `divergence_flag`, `hrv_deviation`, `layers_active`, `data_sources`, `confidence`, and `updated_at`.

2. **`supabase/functions/compute-outer-readiness/index.ts`**
   - Added `inner_readiness_scores` upsert logic directly alongside the `daily_context_snapshot` mirror block when `effectiveInnerScore` is a valid number.
   - Ensures historical readiness scores are captured whether invoked via home card orchestrator or outer readiness brief generation.

---

## 3. Verification & Test Results

- **TypeScript Compilation:** `npx tsc --noEmit` — ✅ Passed with 0 errors.
- **Unit Tests:** `deno test supabase/functions/mental-fitness-scores/index.test.ts` — ✅ 5/5 tests passed.

---

## 4. Post-Deploy Runtime Verification Checklist

Run these SQL queries in the Supabase SQL Editor after deploying the updated functions:

### 1. MRS & Wearable Sync Check (Runtime)
```sql
-- Check if Oura/wearable data is syncing:
SELECT summary_date, hrv_today, sleep_score, resting_heart_rate
FROM wearable_data
WHERE user_id = '<test_user_id>'
ORDER BY summary_date DESC
LIMIT 7;
```

### 2. Daily Snapshot Cron Check (Runtime)
```sql
-- Check if 15-min cron is writing snapshots for all windows:
SELECT snapshot_date, window, mrs_score, mrs_band, wearable_status, updated_at
FROM daily_context_snapshot
WHERE user_id = '<test_user_id>'
ORDER BY updated_at DESC
LIMIT 10;
```

### 3. Insights Timeseries Table Check (Post-Fix)
```sql
-- Verify inner_readiness_scores is populating:
SELECT score_date, time_of_day, composite_score, energy_tier, divergence_flag, updated_at
FROM inner_readiness_scores
WHERE user_id = '<test_user_id>'
ORDER BY score_date DESC, updated_at DESC
LIMIT 10;
```

---

## 5. Deployment Instructions

Deploy the two updated Edge Functions:
1. `supabase functions deploy build-executive-home-cards`
2. `supabase functions deploy compute-outer-readiness`
