

## Plan: Proactive Mastery Plan — Remaining Fixes & Server-Side Migration

### Current Status of the 7 Audit Gaps

| Issue | Status | Action Needed |
|-------|--------|---------------|
| effectiveContent always [] | FIXED in prior commit | None — DailyRitual.tsx now queries content_relevance_feedback |
| clarityLevel/confidenceLevel hardcoded to 0 | OPEN | Fix in DailyRitual.tsx |
| user_coach_insights not in types.ts | FALSE POSITIVE | Already in types.ts |
| Mental Fitness reads from localStorage | OPEN | Deprecate mentalFitnessEngine.ts localStorage reads |
| Race condition in updateRitualCompletion | FIXED in prior commit | None — COMPLETE_PRACTICE atomic action exists |
| archetype/wearableStress dead fields | OPEN | Clean up dead params |
| 15s polling delay for UI refresh | OPEN | Fix with immediate refresh after completion |

### Changes Required

#### 1. Fix clarityLevel/confidenceLevel hardcoded to 0

**File: `src/components/home/DailyRitual.tsx` (~line 346-347)**

Currently hardcodes `clarityLevel: 0, confidenceLevel: 0`. The data is available — `energyStateEngine.ts` already fetches these from `daily_checkins` and passes them to `compute-inner-readiness`. But `DailyRitual.tsx` doesn't have access to the check-in record at this point.

Fix: Query today's check-in clarity/confidence before building the request body (same pattern as `energyStateEngine.ts`):

```typescript
let clarityLevel = 0;
let confidenceLevel = 0;
if (user?.id) {
  const todayCheckinData = await getTodayCheckin(); // already imported
  if (todayCheckinData) {
    clarityLevel = todayCheckinData.clarity_level ?? 0;
    confidenceLevel = todayCheckinData.confidence_level ?? 0;
  }
}
```

Note: `getTodayCheckin()` is already called on line ~211. Reuse that value by moving it earlier or storing it.

#### 2. Remove dead archetype and wearableStress fields

**File: `src/components/home/DailyRitual.tsx` (~line 349)**

Remove `archetype: ''` from the request body — the generate-mastery-plan EF already receives it but it's always empty. The EF handles the fallback internally. Keep the field in the EF interface for future use but stop sending empty strings.

The `wearableStress` field is never sent from DailyRitual — it's only used by `JustInTimeIntervention.tsx` which queries wearable data directly. No change needed there.

#### 3. Fix 15s polling delay — use event-driven refresh

**File: `src/components/home/DailyRitual.tsx` (~line 163)**

Currently polls every 15s via `setInterval`. When user completes a practice and returns, there's up to 15s delay before UI updates.

Fix: Listen for `visibilitychange` event to trigger immediate check when user returns to the tab/app:

```typescript
useEffect(() => {
  loadPlan();
  checkRitualCompletion();
  
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      checkRitualCompletion();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);
  
  // Keep a longer polling interval as fallback (60s instead of 15s)
  const interval = setInterval(() => checkRitualCompletion(), 60000);
  
  return () => {
    clearInterval(interval);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}, [user?.id]);
```

#### 4. Mental Fitness — stop reading from localStorage, read from DB

**File: `src/utils/mentalFitnessEngine.ts`**

This entire file reads `dailyRitualHistory`, `practiceHistory`, `recalibrateHistory`, and `dailyCheckIn-*` from localStorage. The authoritative data is in `daily_ritual_completions` and `daily_checkins` tables.

Fix: Deprecate `mentalFitnessEngine.ts` by making `calculateMentalFitnessScore()` async and reading from the DB via the `daily-rituals` edge function instead of localStorage. Need to check all consumers first.

Consumers: Search shows `mentalFitnessEngine` is NOT imported anywhere — it's dead code. The active mental fitness scoring uses `intelligenceEngine.ts` which is imported by `IntelligentPriorityCard.tsx` only.

`intelligenceEngine.ts` also reads from localStorage heavily — but it's only used by `IntelligentPriorityCard.tsx`. Both files are legacy local-only engines.

Action: Since neither engine is connected to the Mastery Plan feature (the plan uses `generate-mastery-plan` EF for scoring), these are separate technical debt. For this task, we should:
- Add a deprecation comment to `mentalFitnessEngine.ts` noting it's unused
- The mental fitness baseline is already in `profiles.mental_fitness_baseline` (cloud)
- No runtime behavior change needed — the engines are dead code for the Mastery Plan

#### 5. Client-side scoring engine is redundant

**File: `src/utils/performancePlanEngine.ts` (1074 lines)**

This is a full client-side duplicate of the server-side `generate-mastery-plan` EF. It imports `sanctuaryContent` data, has THEME_MODULE_MAP, content scoring, etc. However, it's only imported by `planReconstruction.ts` (for types only) and `planReconstruction.ts` itself is not imported anywhere.

Both `performancePlanEngine.ts` and `planReconstruction.ts` are dead code — the actual plan generation goes through the edge function.

Action: Add deprecation comments. No runtime change needed.

#### 6. Remove localStorage writes in practice players

**File: `src/pages/SoundscapePlayer.tsx` (~lines 217-233, 366-377)**

Still writes to `localStorage.dailyRitualHistory` and `localStorage.practiceHistory` after completing practices. This is redundant since `updateRitualCompletion()` now writes to the cloud DB.

Fix: Remove the localStorage writes. The DB is the source of truth.

---

### Summary of Changes

| File | Change |
|------|--------|
| `src/components/home/DailyRitual.tsx` | Fix clarityLevel/confidenceLevel from check-in; remove `archetype: ''`; replace 15s poll with visibilitychange + 60s fallback |
| `src/pages/SoundscapePlayer.tsx` | Remove localStorage writes for dailyRitualHistory and practiceHistory |
| `src/utils/mentalFitnessEngine.ts` | Add deprecation header (dead code — not imported anywhere) |
| `src/utils/performancePlanEngine.ts` | Add deprecation header (dead code — superseded by EF) |
| `src/utils/planReconstruction.ts` | Add deprecation header (dead code) |
| `src/utils/intelligenceEngine.ts` | Add deprecation header (localStorage-based, not used by Mastery Plan) |

### Implementation Order
1. DailyRitual.tsx fixes (clarity/confidence, archetype cleanup, polling)
2. SoundscapePlayer.tsx localStorage removal
3. Deprecation comments on dead files

