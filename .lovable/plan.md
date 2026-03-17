

# Audit: `/executive-home` Cross-Device Content Consistency

## Source-of-Truth Map

```text
Page Load → useAuth (user.id)
  │
  ├─ TodayStateCard
  │    └─ useQuery['energy-state', user.id] → computeEnergyState()
  │         ├─ DB: wearable_data (HRV) ✅
  │         ├─ FALLBACK: getLocalWearableData() ⚠️ DIVERGENCE RISK
  │         ├─ DB: calendar_connections + calendar_events ✅
  │         ├─ DB: daily_checkins (via edge fn) ✅
  │         └─ Edge Fn: compute-inner-readiness ✅
  │
  ├─ StrategicIntentionCard
  │    └─ useOuterReadiness → fetchOuterReadiness()
  │         ├─ computeEnergyState() (same query key, shared) ✅
  │         ├─ getTodayCheckin() → DB via edge fn ✅
  │         └─ Edge Fn: compute-outer-readiness ✅
  │
  ├─ DailyRitual
  │    └─ loadPlan()
  │         ├─ sessionStorage cache: plan-data-{date}-{period} ⚠️ DIVERGENCE RISK
  │         ├─ DB: daily_ritual_completions (via getTodayRitual) ✅
  │         ├─ DB: daily_checkins (via getCheckinForWindow) ✅
  │         └─ Edge Fn: generate-mastery-plan ✅
  │
  ├─ JitCarousel
  │    └─ Receives preEventPlan from DailyRitual (same data path) ✅
  │
  └─ Hero (greeting, video)
       └─ Time-of-day + energyTier → intentional device-local ✅ (not a bug)
```

## Identified Divergence Sources

### BUG 1 (HIGH): `energyStateEngine.ts` — localStorage wearable fallback

Lines 206-216: If the DB query returns no wearable row (e.g., RLS issue, network blip), it falls back to `getLocalWearableData()`. Device A (phone with Apple Health sync) has local HRV data; Device B (desktop) does not. This produces **different Inner Readiness scores, tiers, and recommendations** for the same user.

**Fix**: Remove the localStorage fallback. If DB has no wearable data, treat it as `hasWearable = false` — which is the correct state. The local cache is a write-through performance layer, not a source of truth. The backend `compute-inner-readiness` edge function already handles the no-wearable case gracefully.

### BUG 2 (MEDIUM): `DailyRitual.tsx` — sessionStorage plan cache

Lines 279-301: The plan is cached in `sessionStorage` per device. If Device A generates a plan and Device B loads later (or has stale session), they can show different plans. The cache bypass logic (line 267-276) correctly invalidates on check-in changes, but if no check-in happened, the stale cache persists per device.

**Fix**: Add the energy state hash to the session cache key validation. The existing `plan-loaded-*` flag should also store the energy tier + score, and invalidate if the current energy state differs. This is already partially described in the memory (`ux/mastery-plan-cache-validation`) but the implementation only checks check-in time, not energy state hash.

### NOT A BUG: `wearableContextAnalyzer.ts` localStorage fallback

`getWearableContext()` has a localStorage fallback (line 102-127), but it's only called from `MicroInterventions.tsx` which is NOT rendered on `/executive-home`. No impact.

### NOT A BUG: `useCalendarSync.ts` local storage

Calendar data on executive-home flows through `energyStateEngine.ts` which reads directly from DB (`calendar_events` table), not from local storage. No impact.

### NOT A BUG: Hero video/greeting

Time-of-day presentation differences are intentional and don't affect content.

## Fix Plan

### Fix 1: Remove localStorage wearable fallback from `energyStateEngine.ts`
- Delete lines 206-216 (the `getLocalWearableData()` fallback block)
- Remove the import of `getLocalWearableData`
- Add a diagnostic log when DB returns no wearable data
- This ensures both devices get identical wearable input (DB-only)

### Fix 2: Add energy-state hash validation to DailyRitual sessionStorage cache
- In `DailyRitual.tsx` `loadPlan()`, after fetching from session cache, compare the stored energy tier/score against the current energy state
- If they differ, invalidate the cache and regenerate
- Store the hash alongside the plan data in sessionStorage

### Fix 3: Add diagnostic logging
- In `computeEnergyState`: log whether wearable data came from DB or was absent
- In `DailyRitual.loadPlan`: log whether session cache was used or fresh plan generated
- In `useOuterReadiness`: already has logging ✅

### Files to change:
1. **`src/utils/energyStateEngine.ts`** — Remove localStorage fallback, add diagnostic log
2. **`src/components/home/DailyRitual.tsx`** — Add energy hash validation to session cache, add diagnostic log

