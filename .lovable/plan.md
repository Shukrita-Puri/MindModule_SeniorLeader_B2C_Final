

# Fix: Per-Priority Feedback & Celebration Firing Repeatedly

## Root Cause

The detection effect (lines 126–164) has a race condition:

1. On mount, `completedPracticeIds = []` and `plan = null`. The effect seeds `prevCompletedIdsRef` to `[]` but `completedSlotsRef` stays empty (no plan modules to check).
2. When plan loads, `checkCompletion()` sets `completedPracticeIds` to already-completed IDs. The effect sees `prev = []` and treats all existing completions as "new" — firing celebration confetti and feedback modal for slots that were already done.
3. Every 60 seconds and on every visibility change, `checkCompletion()` re-sets `completedPracticeIds` with a new array reference. Even if content is identical, the effect re-runs and can re-trigger if the ref comparison isn't stable.

## Fix (single file: `src/components/home/TodayThreePriorities.tsx`)

### 1. Defer detection until plan is loaded
Change the seeding logic: instead of seeding on `prev === null`, seed on `prev === null && plan !== null`. If plan is null, return early without seeding — this prevents the empty `[]` baseline from being set before we know what's already done.

### 2. Deduplicate with a "celebrated" ref
Add a `celebratedIdsRef = useRef<Set<string>>(new Set())` that tracks which practice IDs have already triggered a celebration. Before calling `triggerCelebration`, check the ID isn't already in this set. Add it after celebrating.

### 3. Deduplicate feedback slot triggers
The existing `completedSlotsRef` should prevent re-triggers, but because it's not seeded properly on first load (plan is null at seed time), already-completed slots get missed. The fix in step 1 resolves this — when we first seed with a loaded plan, we pre-populate `completedSlotsRef` with all already-done slots, so they never trigger feedback.

### 4. Stable array comparison in checkCompletion
Before calling `setCompletedPracticeIds(active)`, compare against current state. Only set if the array contents actually changed (join and compare). This prevents unnecessary effect re-runs from polling.

## Changes Summary

- **Lines 126–164**: Rewrite the seed guard to require `plan !== null` before seeding
- **Lines 110–124**: Add `celebratedIdsRef` guard around `triggerCelebration` call  
- **Lines 349–368**: Add stable-comparison guard in `checkCompletion` before `setCompletedPracticeIds`

No other files affected. No database changes.

