

# Fix: Today's 3 Performance Priorities — Always-Visible Card Shell

## What Changes

**Single file**: `src/components/home/TodayThreePriorities.tsx`

### 1. Add `fetchFailed` state variable
New state: `const [fetchFailed, setFetchFailed] = useState(false);`

### 2. Track fetch failure separately from empty data
In `loadPlan()` (line 229-232), when `fetchError` occurs after retries:
- Set `setFetchFailed(true)` instead of just `setLoading(false)` and returning
- Do **not** let this path trigger `onEmpty()`

### 3. Fix the `onEmpty` signal (line 398-404)
Change the effect so `onEmpty()` only fires when there's genuinely no data **and** the fetch didn't fail:
```
if (!loading && !fetchFailed && (!horizonModules || horizonModules.length === 0)) {
  onEmpty?.();
}
```
This prevents permanent `prioritiesEmpty = true` on transient errors.

### 4. Replace `return null` (line 418-420) with empty-state card shell
When `!horizonModules || horizonModules.length === 0`, render a card shell instead of `null`:

**If `fetchFailed` is true**: Show the header "Today's 3 Performance Priorities", 3 muted placeholder slots (numbered 1-2-3 with pulsing circles), a "Your plan is loading..." message, and a "Retry" button that calls `loadPlan()` again (resets `fetchFailed` and `loading`).

**If no fetch error** (genuine empty — no check-in): Show the same header, 3 muted placeholder slots, and a "Check in to build your plan" prompt that navigates to `/daily-check-in`.

### 5. Loading state — improve skeleton
Replace the minimal skeleton (lines 407-415) with a card shell that includes the header text and 3 skeleton slot rectangles, so the card structure is always visible during loading.

### 6. Auto-retry once on transient failure
In `loadPlan()`, after all retries exhaust and `fetchFailed` is set, schedule one more automatic retry after 3 seconds:
```
setTimeout(() => { setFetchFailed(false); setLoading(true); loadPlan(); }, 3000);
```
This fires once. If it also fails, the error state with manual retry button persists.

## What Does NOT Change
- Fetch request body/headers
- `horizonModules` rendering logic (line 422+)
- Auth header approach
- `DailyRitual.tsx`
- Any edge function
- `onLoaded` callback behavior
- `ExecutiveHome.tsx`

## Files Modified

| File | Change |
|------|--------|
| `src/components/home/TodayThreePriorities.tsx` | Add `fetchFailed` state, fix `onEmpty` guard, replace `return null` with card shell, improve loading skeleton, add auto-retry |

