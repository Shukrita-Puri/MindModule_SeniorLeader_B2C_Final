

# Fix & Audit: Today's 3 Performance Priorities v4.0

## Root Cause of Bug (Cards Not Visible)

Two issues prevent the cards from rendering:

1. **No fallback guard in ExecutiveHome.tsx**: The plan specifies that if `horizonModules` is undefined/empty, DailyRitual should render as fallback. Currently, `TodayThreePriorities` returns `null` when there's no data, and nothing else renders — just the header with empty space below.

2. **DEV_MODE `checkCompletion` blocks**: `checkCompletion()` (line 253) checks `if (!user?.id || !plan) return;` — in DEV_MODE, `useAuth()` returns a user with `id: "dev-user-123"`, so this actually works. However, if there's a stale session cache from before the `horizonModules` feature was added, the cached plan won't have `horizonModules`, causing the component to return `null`.

3. **Session cache invalidation missing**: No cache-busting mechanism was added for the new `horizonModules` field. Old cached plans without `horizonModules` persist and cause blank renders.

## Audit Results vs v4.0 Spec

### Fully Implemented
- `HorizonModule` interface in edge function
- `determineAllocationPattern()` with correct tier/calendarLoad/JIT logic
- `buildWhyLine()` with all signal sources (divergence, HRV correlation, pattern insight, friction trend, pending commitment, coach growth area, practice priority tag, archetype watchFor)
- `buildHorizonModules()` slot construction (slot 1/2/3 with correct JIT time windows)
- `ARCHETYPE_WATCH_FOR` mapping for all 6 archetypes
- `horizonModules` in response alongside existing `timeOfDayPlan`/`preEventPlan`
- Frontend component with expand/collapse, completion tracking, JIT dismiss, navigation
- Visual states: orange number circle, green completed, grey collapsed, pulse animation, navy border, priority pill
- Why line rendering (italic, 11px)

### Gaps Found

| Gap | Status | Fix Required |
|-----|--------|-------------|
| **Fallback guard** — DailyRitual should render when horizonModules missing | **Missing** | Add conditional rendering in ExecutiveHome.tsx |
| **Session cache invalidation** — old cached plans lack horizonModules | **Missing** | Add version key to cache, bust on format change |
| **DEV_MODE in checkCompletion** — should work with DEV_USER.id when user is null | **Partial** | Add `DEV_MODE ? DEV_USER.id : user?.id` guard |
| **Midday slot 2 regeneration** (spec section 10) — afternoon check-in with energy delta >= 15 should refresh slot 2 only | **Missing** | Add midday regeneration logic |
| **JIT event promotion** (spec section 10) — new JIT events should promote into slots dynamically | **Missing** | Add JIT promotion on visibility change |
| **Duplicate practices** — when ToD returns only 1 module, all 3 slots get the same practice (seen in curl test) | **Bug** | Edge function should handle < 3 ToD modules gracefully, diversify or show fewer slots |

## Plan

### Fix 1: Fallback Guard in ExecutiveHome.tsx
In the `<TodayThreePriorities />` rendering block, add a state callback or render the DailyRitual as fallback when horizonModules are absent. The component already returns `null` when empty — wrap it with fallback rendering of `<DailyRitual>`.

### Fix 2: Session Cache Invalidation
Add a cache version key (e.g., `plan-cache-version`) in `loadPlan()`. When loading from cache, check if the cached plan has `horizonModules`. If not, invalidate and regenerate.

### Fix 3: DEV_MODE Completion Check
Update `checkCompletion()` to use `const effectiveUserId = user?.id || (DEV_MODE ? DEV_USER.id : null)` instead of `user?.id` directly.

### Fix 4: Midday Slot 2 Regeneration
Add logic to detect afternoon check-in energy delta and regenerate slot 2 only. Store morning energy balance, compare on afternoon check-in.

### Fix 5: Duplicate Module Guard
In `buildHorizonModules()`, when `todModules.length < 3`, don't pad with duplicate practices. Instead, return fewer modules (1 or 2) and let the frontend handle gracefully, or source additional content from enrichedContent pool.

### Fix 6: Minor UI Polish
- Ensure the "Today's 3 Performance Priorities" header in the component matches the one in ExecutiveHome (avoid duplication — currently both render the title)

## Files Modified

| File | Change |
|------|--------|
| `src/pages/ExecutiveHome.tsx` | Add fallback guard: render DailyRitual when TodayThreePriorities returns null |
| `src/components/home/TodayThreePriorities.tsx` | Fix DEV_MODE completion check, add cache version invalidation, add midday regeneration logic, remove duplicate header |
| `supabase/functions/generate-mastery-plan/index.ts` | Fix duplicate module guard when todModules < 3 |

