

## Problem

The Confirm button on `/daily-check-in` appears to do nothing because the **FirstSessionGuide overlay** is rendering on top of it and intercepting all clicks.

**Root cause**: In DEV_MODE (lines 124-138 of `DailyCheckIn.tsx`), the tour guide activates on every visit unless `sessionStorage` has `first_session_guide_done === '1'`. On a fresh browser session, this flag is absent, so the guide overlay always shows — even without `?tour=1` — and blocks the Confirm button. The button handler itself is correctly wired; it simply never receives the click event.

In auth mode, a similar issue can occur: if the user's `onboarding_completed_at` is set but the walkthrough completion check fails transiently, the guide can still activate and block the button.

## Fix (2 files)

### 1. `src/pages/DailyCheckIn.tsx` — Fix tour activation logic

**DEV_MODE branch (lines 112-138)**: Change so that without `?tour=1`, the guide does NOT activate in dev mode. The dev-mode block should mirror the auth-mode behavior: only show the guide when explicitly requested via `?tour=1` or a retake flag.

Replace the current DEV_MODE logic:
```
// Current: activates guide on every fresh session in dev mode
if (DEV_MODE) {
  const tourDone = ...
  if (!isActiveForUser || isRetakeForUser) activateGuide();
  setShowGuide(true);  // <-- always true on fresh session
  return;
}
```

With:
```
if (DEV_MODE) {
  // Only show guide if ?tour=1 is present or retake is flagged
  if (!hasTourParam) {
    const isRetakeForUser = sessionStorage.getItem(RETAKE_TOUR_KEY) === effectiveId;
    if (!isRetakeForUser) {
      setShowGuide(false);
      return;
    }
  }
  activateGuide();
  setShowGuide(true);
  return;
}
```

This ensures:
- Normal dev-mode visits to `/daily-check-in` → no guide, button works
- `/daily-check-in?tour=1` → guide shows (first-time onboarding completion)
- Profile retake → guide shows

**No changes needed to `handleConfirm`** — the button handler, `saveCheckin()`, error handling, and navigation are all correctly implemented already. The issue is purely the overlay blocking clicks.

### 2. Verify no other changes needed

- `saveCheckin()` in `src/utils/dailyCheckins.ts` correctly handles both DEV_MODE (direct DB upsert with `DEV_USER.id`) and auth mode (edge function with token). No fix needed.
- `handleConfirm` already has error handling via toast and keeps `isSubmitting` state correct. No fix needed.
- Navigation to `/check-in-detail` after save is correct. No fix needed.
- The `CheckInDetail.tsx` page correctly navigates to `/executive-home` after clarity/confidence save. No fix needed.

### Summary

Single targeted fix in `DailyCheckIn.tsx`: change the DEV_MODE tour-activation logic so the guide only shows with `?tour=1` or an explicit retake flag, not on every visit. This unblocks the Confirm button in both modes.

