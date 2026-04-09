

# Wearable Chips & Calibration Overhaul

## Critical Bug Discovered

The wearable context query in `compute-outer-readiness` (line 1953) references **three columns that don't exist** in the `wearable_data` table:
- `recorded_date` → should be `summary_date`
- `heart_rate` → column doesn't exist in table
- `sleep_duration` → should be `total_sleep_minutes`

This means `wearableContext` has likely been null for all users, so **all wearable-aware theme, lean-on, and watch-for logic has been inactive**.

---

## Changes

### File 1: `supabase/functions/compute-outer-readiness/index.ts`

**1a. Fix broken wearable query (line ~1951-1957)**
- `recorded_date` → `summary_date`
- Remove `heart_rate` (not in schema — remove `peakHR` from `WearableContext` interface too)
- `sleep_duration` → `total_sleep_minutes`, map to `sleepDuration` in context

**1b. Add RHR + sleep duration baselines (line ~2346-2370)**
- Currently only computes `hrvDeviation` and `sleepDeviation` (from `sleep_score`)
- Add `resting_heart_rate` and `total_sleep_minutes` to the baseline query
- Compute `rhrDeviation = ((todayRHR - avgRHR) / avgRHR) * 100`
- When `sleep_score` is null (Apple Health), compute `sleepDeviation` from `total_sleep_minutes` instead
- Apply Apple Health correction: `effectiveSleep = total_sleep_minutes * 0.85` when `source = 'apple-healthkit'`

**1c. Replace absolute RHR flags in wearableContext (line ~1971-1972)**
- Current: `rhrElevated = rhr > 75` (absolute — broken for fit/unfit users)
- New: query 30-day RHR baseline in the same block, set `rhrElevated` based on deviation > +10%

**1d. Add new fields to response payload**
- `rhrDeviation` (number | null)
- `rhrBaseline`, `hrvBaseline`, `sleepBaseline` (for chip back-label context like "vs your 51ms avg")
- `wearableDataSource` (string, e.g. "apple-healthkit")
- `hasHistoricalData` (boolean, `wearableDaysConnected >= 7`)

### File 2: `src/components/home/DecisionReadinessBrief.tsx`

**2a. Replace binary 7-day gate with 4-tier calibration model**

```text
Tier       Condition                          Chip Behaviour
─────────  ─────────────────────────────────  ──────────────────────────────
none       No wearable connected              Zero physio chips. Prompt chip.
absolute   Days 1-2, no historical data       Absolute thresholds + "· establishing baseline"
partial    Days 3-6                            Deviation from short history + "· early reading"
full       7+ days OR has historical data      Full deviation logic, all qualifiers
```

**2b. Replace absolute RHR chip logic with deviation-based**
- Current: `rhrVal > 85` RED, `> 75` AMBER (broken for fit users)
- New: `rhrDeviation > +20%` RED, `+10-20%` AMBER, else omit

**2c. Add absolute-tier fallback thresholds** (days 1-2, no history)
- HRV: < 20ms RED, 20-40ms AMBER, > 70ms GREEN
- Sleep: < 360min RED, 360-420 AMBER (duration); < 60 RED, > 75 GREEN (score)
- RHR: > 90 RED, 80-90 AMBER

**2d. Suppress "unusual for you" for Apple Health** when < 14 days data (measurement inconsistency)

**2e. Enhance tap-to-flip back-labels with baseline context**
- Full tier: `"HRV: 42ms (−18% vs your 51ms avg)"`
- Absolute tier: `"HRV: 42ms (baseline not yet established)"`

**2f. Update no-wearable and calibrating chip text**
- `none`: "Connect wearable for full intelligence"
- `absolute`: chips appear with "· establishing baseline"
- `partial`: chips appear with "· early reading"

---

## Auth / Dev Mode — No Changes Needed

All edge functions already handle both paths:
- `compute-outer-readiness` uses `verifyAuth0JWT` from `_shared/auth.ts` which includes `x-dev-user-id` header bypass
- `persist-wearable-data` uses `authenticateRequest` from the same module
- Client-side `devInterceptor.ts` auto-injects `x-dev-user-id` on all `supabase.functions.invoke()` calls in dev mode

---

## Files Modified
1. `supabase/functions/compute-outer-readiness/index.ts` — fix broken query columns, add RHR/sleep baselines, Apple Health correction, new response fields
2. `src/components/home/DecisionReadinessBrief.tsx` — tiered calibration model, deviation-based RHR chips, enhanced back-labels, Apple Health qualifier suppression

