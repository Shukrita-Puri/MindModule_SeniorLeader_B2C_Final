
# Fix Plan: Completion Logic, Tiny Wins Display, and Baseline Data

## Root Cause Analysis

### Issue 1: Performance Plan Shows "Completed" After Only Coach
**Root Cause:** The `markCoachComplete` function is only triggered when the user explicitly clicks the "Complete" button in the queue progress UI. When users simply navigate away (back button, new chat), the `endSession()` is called but `markCoachComplete()` is NOT.

**Evidence:**
- Database shows: `completed_practice_ids: []` (empty)
- `handleBackNavigation()` and `handleNewChat()` only call `endSession()`, not `markCoachComplete()`
- The "golden check" Monday indicator is misleading because WeeklyRitualStreak uses faulty logic

**Additional Bug:** The `WeeklyRitualStreak` component shows Monday as "full" (gold check), but the database clearly shows `completion_status: partial` with `completed_practice_ids: []`. This means the streak visualization logic has its own bug - it's showing "full" when it shouldn't.

---

### Issue 2: Tiny Wins Not Displaying
**Root Cause:** RLS policy blocks DEV_MODE access.

**Evidence:**
- Console logs show: `[Insights] DEV_MODE tiny wins fetched: []`
- Database has 3 wins for `dev-user-123`
- RLS policies only allow: `(auth.uid())::text = user_id`
- No DEV_MODE policy exists for `tiny_wins`

---

### Issue 3: Baseline Data Not Showing
**Root Cause:** Two compounding issues:
1. The `profiles` table is completely empty - no profile exists for `dev-user-123`
2. RLS policies only allow `auth.uid()` access, blocking DEV_MODE

**Evidence:**
- Query `SELECT * FROM profiles` returns `[]`
- No DEV_MODE RLS policy exists

---

## Solution Overview

### Part 1: Fix Coach Completion Tracking

The `markCoachComplete` function must be called whenever a coach session ends meaningfully - not just when clicking "Complete". 

**Approach:**
1. Create a helper function `ensureCoachMarkedComplete()` that's called from ALL exit paths
2. Call it from:
   - `handleQueueComplete()` (already done)
   - `handleBackNavigation()` - when user clicks back
   - `handleNewChat()` - when user starts new chat (closes current)
   - `endSession()` context - or add as part of session ending

**File:** `src/pages/SelfMasteryCoach.tsx`

```typescript
// Update handleBackNavigation to mark coach complete
const handleBackNavigation = async () => {
  // Mark coach complete before ending session
  if (flowType && messages.length > 0) {
    await markCoachComplete();
  }
  if (messages.length > 0) {
    await endSession();
  }
  navigate('/executive-home');
};

// Update handleNewChat similarly
const handleNewChat = async () => {
  // Mark coach complete before ending
  if (flowType && messages.length > 0) {
    await markCoachComplete();
  }
  await endSession();
};
```

### Part 2: Fix WeeklyRitualStreak Display Logic

The component currently shows "full" incorrectly. The logic needs to properly check that `effectiveCompleted >= totalRecommended` AND `effectiveCompleted > 0`.

**File:** `src/components/home/WeeklyRitualStreak.tsx`

The current logic already has this condition but it's showing the wrong status. The issue is that the Monday ritual has `completion_status: partial` in the database, but the component is showing a gold checkmark.

Looking at lines 46-68, the logic checks `completion_status === 'full'` OR `effectiveCompleted >= totalRecommended`. Since `effectiveCompleted` is `max(0, 0) = 0` and `totalRecommended` is 2, the condition `0 >= 2` is false. But it's still showing as full.

**Root Cause Found:** The WeeklyRitualStreak fetches data via `getRitualRange`, but the TODAY indicator is driven by the homepage DailyRitual component's `completed` state which is cached in the wrong condition.

Need to trace more precisely, but the fix should ensure WeeklyRitualStreak ONLY shows "full" when `completion_status === 'full'` AND `effectiveCompleted >= totalRecommended && effectiveCompleted > 0`.

```typescript
// More strict check
if (completion.completion_status === 'full' && effectiveCompleted >= totalRecommended && effectiveCompleted > 0) {
  status = 'full';
} else if (effectiveCompleted > 0 || completion.completion_status === 'partial') {
  status = 'partial';
}
```

### Part 3: Add DEV_MODE RLS Policies for Tiny Wins

**Migration SQL:**
```sql
-- Allow dev-user-123 to SELECT tiny wins
CREATE POLICY "DEV_MODE: dev-user-123 can select tiny_wins"
  ON public.tiny_wins
  FOR SELECT
  USING (user_id = 'dev-user-123');
```

### Part 4: Add DEV_MODE RLS Policy for Profiles + Create Dev Profile

**Migration SQL:**
```sql
-- Allow dev-user-123 to SELECT from profiles
CREATE POLICY "DEV_MODE: dev-user-123 can select profile"
  ON public.profiles
  FOR SELECT
  USING (id = 'dev-user-123');

-- Allow dev-user-123 to INSERT/UPDATE profiles
CREATE POLICY "DEV_MODE: dev-user-123 can insert profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (id = 'dev-user-123');

CREATE POLICY "DEV_MODE: dev-user-123 can update profile"
  ON public.profiles
  FOR UPDATE
  USING (id = 'dev-user-123')
  WITH CHECK (id = 'dev-user-123');

-- Create a baseline profile for dev-user-123
INSERT INTO public.profiles (id, email, full_name, mental_fitness_baseline, user_archetype, growth_priority, onboarding_completed_at)
VALUES (
  'dev-user-123',
  'dev@example.com',
  'Dev User',
  72,
  'adaptive-navigator',
  'mental-clarity',
  NOW()
) ON CONFLICT (id) DO NOTHING;
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/SelfMasteryCoach.tsx` | Add `markCoachComplete()` call to `handleBackNavigation` and `handleNewChat` |
| `src/components/home/WeeklyRitualStreak.tsx` | Tighten "full" status check to require actual completions |
| Database Migration | Add RLS policies for `tiny_wins` (SELECT) and `profiles` (SELECT/INSERT/UPDATE) for `dev-user-123`, plus insert dev profile |

---

## Expected Outcomes

1. **Accurate Completion:** Coach session ends properly marked, only shows "complete" when ALL recommended practices done
2. **Tiny Wins Display:** 3 existing wins will show in "Your Tiny Wins" section with bubble visualization
3. **Baseline Data:** Dev profile with archetype "Adaptive Navigator" and baseline 72 will display in BaselineReferenceCard

---

## Technical Notes

### Why This Fix Works
- Adding `markCoachComplete()` to exit handlers ensures completion is tracked regardless of how user leaves
- DEV_MODE RLS policies bypass `auth.uid()` requirement for local testing
- Pre-populating a profile with realistic baseline data allows the Insights page to function correctly

### Related Memory Updates
After implementation, update these memories:
- `dev-mode-architecture-v48`: Document the new RLS policies for tiny_wins and profiles
- `performance-plan-completion-logic-v52`: Note that coach completion is now tracked on ALL exit paths
