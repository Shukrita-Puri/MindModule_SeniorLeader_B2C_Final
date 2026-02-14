

# Inner Readiness: DB Fix + Edge Function Cleanup

## Problem Summary

Three issues identified during audit:

1. **CheckInDetail bypasses edge functions** — clarity/confidence are saved via direct DB call which fails silently under Auth0 + RLS architecture
2. **Legacy V1 outcome mappings** still in edge function (`pause`, `power-up`, `presence`, `ready`)
3. **Old outcome-specific tier labels** still in edge function (redundant since UI uses tier-only labels)

The circadian calculation in the edge function is **correct** — no change needed.

## Plan

### Step 1: Fix CheckInDetail to route through edge function

The `CheckInDetail.tsx` page currently does:
```
supabase.from('daily_checkins').update({ clarity_level, confidence_level })
```

This fails silently because RLS blocks direct client access. Will refactor to call the `daily-checkins` edge function with a new `UPDATE_CLARITY_CONFIDENCE` action, matching the project's Auth0 architecture pattern.

**Files changed:**
- `src/pages/CheckInDetail.tsx` — use `saveCheckin()` or invoke edge function with Auth0 token
- `supabase/functions/daily-checkins/index.ts` — add `UPDATE_CLARITY_CONFIDENCE` action if not already present

### Step 2: Clean up edge function — remove legacy mappings

Remove from `compute-inner-readiness/index.ts`:
- Line 13: Delete `pause: 25, 'power-up': 20, presence: 35, ready: 80` (old V1 outcome keys)
- Lines 81-98: Replace outcome-specific tier labels with tier-only labels matching the UI:
  - depleted -> "Low Reserve"
  - managing -> "Moderate Capacity"  
  - strong -> "Strong Readiness"
  - peak -> "Peak Readiness"

### Step 3: Verify the daily-checkins edge function handles upsert correctly

Confirm that when a user checks in again on the same day, the edge function properly upserts (updates the existing row) rather than failing on a duplicate.

---

## Technical Details

### CheckInDetail fix (Step 1)

```text
Current (broken):
  CheckInDetail -> supabase.from('daily_checkins').update() -> RLS BLOCKS -> silent failure

Fixed:
  CheckInDetail -> getAccessTokenSilently() -> supabase.functions.invoke('daily-checkins', {
    action: 'UPDATE_CLARITY_CONFIDENCE',
    checkinDate, clarity, confidence
  }) -> edge function verifies Auth0 token -> service role updates DB
```

### Edge function cleanup (Step 2)

Felt state map reduced to 5 canonical outcomes only:
```
{ drained: 20, overwhelmed: 25, scattered: 35, steady: 55, focused: 80 }
```

Tier labels simplified to tier-only (no outcome branching):
```
{ depleted: 'Low Reserve', managing: 'Moderate Capacity', strong: 'Strong Readiness', peak: 'Peak Readiness' }
```

