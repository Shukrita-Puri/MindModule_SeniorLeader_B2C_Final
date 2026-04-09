

# Fix Tour, Signal Pills, Lean On/Watch For, Phase Font, and Audit

## 1. Tour Breaks After Step 1

**Root cause**: `FirstSessionGuide` lives inside `DailyCheckIn`. When Step 0 completes and it navigates to `/executive-home`, the DailyCheckIn unmounts — destroying the guide. ExecutiveHome's `showGuide` effect depends on `[user?.id, user?.onboarding_completed_at]` which don't change on navigation, so it never re-evaluates.

**Fix in `src/pages/ExecutiveHome.tsx`**:
- Add a second lightweight `useEffect` that runs on mount (once) to synchronously check sessionStorage for `ACTIVE_TOUR_KEY === '1'` and set `showGuide(true)` immediately. This catches the cross-page handoff without needing the async onboarding-progress fetch.
- For auth users: the existing async effect already checks `isActiveForUser` — the fix is adding `location.pathname` to its dependency array so it re-fires when navigating in. Import `useLocation` from react-router-dom.

```typescript
// New effect — immediate sessionStorage check on mount/navigation
const location = useLocation();

useEffect(() => {
  const effectiveId = user?.id || (DEV_MODE ? DEV_USER.id : undefined);
  if (!effectiveId) return;
  const isActive =
    sessionStorage.getItem(ACTIVE_TOUR_KEY) === '1' &&
    sessionStorage.getItem(ACTIVE_TOUR_USER_KEY) === effectiveId;
  if (isActive) setShowGuide(true);
}, [location.pathname, user?.id]);
```

## 2. Signal Pills — Wearable Prompt + Clickable Navigation

**In `src/components/home/DecisionReadinessBrief.tsx`**:

### a) Show "Connect wearable" pill independently of check-in status
- Move wearable detection **outside** the `!hasCheckIn` early return (line 128-130)
- When `!hasCheckIn`: return `[{ id: 'no-checkin', label: 'Check in to unlock your state', color: 'neutral' }]` plus conditionally `{ id: 'wearable-prompt', label: 'Connect wearable', color: 'neutral' }` if `tier === 'none'`
- When `hasCheckIn` but `tier === 'none'`: append `{ id: 'wearable-prompt', label: 'Connect wearable', color: 'neutral' }` to the end of the chips array
- Calendar not connected: append `{ id: 'calendar-prompt', label: 'Connect calendar', color: 'neutral' }` when `calendarState === 'not_connected'`

### b) Make prompt chips navigable
- Import `useNavigate` from react-router-dom
- Update `FlippableChip` to accept optional `onNavigate?: () => void` prop
- When `onNavigate` is set, clicking triggers navigation instead of flip
- Pass navigate callbacks for prompt chip IDs:
  - `no-checkin` → `/daily-check-in`
  - `wearable-prompt` → `/connected-data`
  - `calendar-prompt` → `/connected-data`

### c) Make "Connect calendar" text in CalendarPills also clickable
- Wrap the existing `<span>Connect calendar</span>` (line 403) in a clickable element that navigates to `/connected-data`

## 3. Remove Fake "Lean On" Fallback

**Line 567**: Change condition from `(outerBrief?.leanOn || !hasCheckIn)` to just `outerBrief?.leanOn`. Remove the ternary fallback text ("Your honesty in the check-in" / "This shapes everything today").

The lean on/watch for content comes from `compute-outer-readiness` which uses coach insights, archetype, calendar, wearable data, and C×C — not just check-in. So the condition should be: show "Lean on" when `outerBrief?.leanOn` exists, regardless of check-in status. Same principle already applies to "Watch for" (line 586) — change its condition from `hasCheckIn && outerBrief?.watchFor` to just `outerBrief?.watchFor`.

## 4. Phase Font Size

**Line 526**: Change `text-[14px]` to `text-[17px]` for the phrase element.

## 5. Audit — Edge Function Data Flow

Run the `compute-outer-readiness` edge function via curl to verify:
- LLM prompt generates phrase/bodyText
- Signal chip data (HRV, sleep, RHR deviations) comes through
- leanOn/watchFor cascade produces real content from coach/archetype/calendar sources
- dataSources array is accurate
- No hardcoded fallbacks leak through

Also check edge function logs for any errors in the lean on/watch for cascade.

## Files Modified

| File | Change |
|------|--------|
| `src/pages/ExecutiveHome.tsx` | Add `useLocation` import; add mount-time sessionStorage check effect for tour handoff |
| `src/components/home/DecisionReadinessBrief.tsx` | Wearable/calendar prompt pills independent of check-in; clickable navigation on prompt chips; remove fake lean-on fallback; show lean-on/watch-for based on data availability not check-in; increase phase font to 17px |

