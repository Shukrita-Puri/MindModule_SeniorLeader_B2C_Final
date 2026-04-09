

# Fix: Today's 3 Performance Priorities Visibility

## Root Cause (Confirmed via Live Testing)

The backend works correctly — `generate-mastery-plan` returns 3 `horizonModules` with status 200. The frontend component does render, but:

1. **Cards are pushed below the bottom navigation bar** — The Performance Readiness Brief consumes ~700px of vertical space. On a 390×844 viewport, only the "TODAY'S ... 0 of 3" header peeks above the fixed 80px bottom nav. The actual practice slots are completely hidden.

2. **RLS upsert failure in DEV_MODE** — `daily_ritual_completions` upsert fails with `42501` (row-level security). This is a non-blocking error (the plan still renders), but it causes `upsertRitual` to fail silently, preventing completion tracking from working in dev mode.

3. **Potential stale cache from user's session** — The user's screenshot shows NO priorities section at all (just Brief → Privacy Footer), suggesting their browser may have had a stale session cache from before `horizonModules` existed. The cache invalidation logic IS now in the code, but if the user's preview was from a previous build cycle, it wouldn't have had that fix.

## Fixes

### Fix 1: Move priorities section higher / ensure visibility
**File**: `src/pages/ExecutiveHome.tsx`

Remove the extra `pt-4` padding on the Brief section and reduce spacing between Brief and Priorities. Add `mt-4` instead of the current gap to keep the priorities section well within the initial scroll area.

### Fix 2: Add `overflow-y-auto` to ensure scrollability
**File**: `src/pages/ExecutiveHome.tsx`

The `SidebarInset` has `overflow-x-hidden` but no explicit vertical scroll. On some viewport configurations the content may not scroll. Add `overflow-y-auto` to the content wrapper to guarantee scrollability.

### Fix 3: Fallback guard — render DailyRitual when TodayThreePriorities returns null
**File**: `src/pages/ExecutiveHome.tsx`

Wrap `TodayThreePriorities` in a state-based fallback: if the component signals it has no data (via a callback prop or by checking render output), show `DailyRitual` instead. This ensures something always renders in the action section.

Implementation approach: Add an `onEmpty` callback prop to `TodayThreePriorities` that fires when `horizonModules` is empty. `ExecutiveHome` tracks this state and conditionally renders `DailyRitual` as fallback.

### Fix 4: DEV_MODE RLS bypass for daily_ritual_completions
**File**: `src/utils/dailyRituals.ts`

The DEV_MODE direct Supabase queries use the anon key which doesn't have insert/update permissions due to RLS. Add the `x-dev-user-id` header approach or use the edge function path even in DEV_MODE for mutations (upsert). Alternatively, since this is dev-only, add a simpler fix: wrap the upsert in a try/catch that silently succeeds in DEV_MODE by storing completion state in localStorage as fallback.

### Fix 5: End-to-end verification
After fixes, test:
- DEV_MODE: 3 cards visible on initial load without scrolling
- Cards expand/collapse correctly
- Start button navigates to practice
- Completion tracking works (or gracefully degrades in DEV_MODE)
- Auth users: same flow with real JWT

## Files Modified

| File | Change |
|------|--------|
| `src/pages/ExecutiveHome.tsx` | Add overflow-y-auto, reduce Brief-to-Priorities spacing, add DailyRitual fallback guard |
| `src/components/home/TodayThreePriorities.tsx` | Add `onEmpty` callback prop for fallback signaling |
| `src/utils/dailyRituals.ts` | DEV_MODE upsert fallback (localStorage) to avoid RLS errors |

