

# Two-Part Fix: Today's 3 Visibility + Backend Tag Infrastructure

## Part A: Today's 3 Visibility Bug

**Root cause confirmed**: The edge function works (returns 3 horizonModules, status 200 via curl). The browser call fails with `FunctionsFetchError: Failed to fetch` — a transient network error during build/deploy cycles. The `loadPlan()` catch block (line 242) sets `loading = false` without setting `plan`, so `horizonModules` stays null → `onEmpty()` fires → DailyRitual fallback renders "Your plan is being prepared."

**Fix**: Add retry logic to `loadPlan()` — on `FunctionsFetchError`, retry up to 2 times with a 2-second delay before giving up. This handles transient edge function unavailability during deploys.

Additionally, the `onEmpty` callback fires permanently (no way to recover once set). Add a mechanism so that if a retry succeeds later, `prioritiesEmpty` resets to `false`.

### Changes
**`src/components/home/TodayThreePriorities.tsx`**:
- Add retry logic (2 retries, 2s delay) in `loadPlan()` when the error is a `FunctionsFetchError`
- Signal non-empty state when plan loads successfully (call an `onLoad` callback or reset via the existing `onEmpty` pattern)

**`src/pages/ExecutiveHome.tsx`**:
- Reset `prioritiesEmpty` to `false` when `TodayThreePriorities` successfully loads (add `onLoad` prop or modify the `onEmpty` approach)

---

## Part B: Backend Tag Infrastructure for sanctuary_content_metadata

**Current state**: `sanctuary_content_metadata` has 0 rows and lacks the 6 new columns (horizon, meta_skill, is_foundational, moment, state_signal, duration_band).

### Step 1: Database Migration
Add 6 columns to `sanctuary_content_metadata`:
```sql
ALTER TABLE sanctuary_content_metadata 
ADD COLUMN IF NOT EXISTS horizon text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS meta_skill text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS is_foundational boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS moment text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS state_signal text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS duration_band text DEFAULT 'short';
```

### Step 2: Populate Tag Data
Since `sanctuary_content_metadata` has 0 rows, we need to INSERT (not UPDATE) rows for all 40 practices. Each row maps `content_id` to the 6 tag fields per the spec provided. All 40 practices from the spec will be inserted.

### Step 3: Edge Function Update (generate-mastery-plan)
Update content scoring in `buildHorizonModules()` to:

1. **Fetch metadata tags** — JOIN or separate query for `sanctuary_content_metadata` horizon/moment/state_signal/meta_skill/is_foundational/duration_band
2. **Horizon filter** — Slot 1 requires `horizon-immediate`, Slot 2 prefers `tactical`/`immediate`, Slot 3 prefers `strategic`
3. **State signal boost** — Add scoring weights: body-under-load +15, masked-high +20, clarity-low +15, confidence-low +15, poor-sleep +10
4. **Foundational filter** — Users with < 7 check-ins: at least 2 of 3 slots must be `is_foundational = true`
5. **Duration band filter** — High/extreme calendar load: only `micro`/`short` for slots 1 & 2

No existing scoring logic is removed — these additions layer on top.

## Files Modified

| File | Change |
|------|--------|
| `src/components/home/TodayThreePriorities.tsx` | Add retry logic for transient network errors, add success callback |
| `src/pages/ExecutiveHome.tsx` | Reset `prioritiesEmpty` on successful load |
| Database migration | Add 6 columns to `sanctuary_content_metadata` |
| Database data | Insert 40 rows with tag assignments per spec |
| `supabase/functions/generate-mastery-plan/index.ts` | Fetch and apply metadata tags in content scoring |

