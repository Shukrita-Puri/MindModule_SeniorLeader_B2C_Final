

# Plan: Fix Onboarding, Payment, Upgrade, and Tour Flow Issues

## Root Causes Identified

| Issue | Root Cause |
|-------|-----------|
| 1. Checkout failure bypass | `handleStartTrial` catch block (line 128-131) records payment step and navigates to app-intro on failure |
| 2. Beta upgrade blocked | `useEffect` at line 47 redirects away if `hasValidUserAccess && !showUpgradeMode` — but `showUpgradeMode` requires `isUpgradeVisit`, which can fail for some upgrade sources |
| 3. Active subscriber upgrade blocked | `create-checkout-session` (line 59) blocks active/trialing users entirely instead of supporting plan changes |
| 4. First tour unreliable | `Stage7ContextConnection.handleComplete` navigates to `/daily-check-in?tour=1` before `refreshProfile` completes, so `user.onboarding_completed_at` is null when DailyCheckIn checks eligibility (line 117) |
| 5. Retake tour unreliable | DailyCheckIn (line 117) blocks guide if `!user?.onboarding_completed_at` is temporarily stale, even when retake session keys are set |
| 6. Mixed sources of truth | Tour eligibility checks `user.onboarding_completed_at` AND onboarding-progress snapshot AND sessionStorage — conflicts between them cause false negatives |

---

## Changes

### File 1: `src/pages/onboarding/stages/Stage6Payment.tsx`

**Fix 1 — Remove checkout failure bypass**
- Lines 126-131: Remove the else branch that records step and navigates on failure. Replace with a toast error and keep user on payment page for both upgrade and initial flows.

**Fix 2 — Beta upgrade source detection**
- Line 34: Expand `isUpgradeVisit` to also match any `source` query param (not just "upgrade" substring). Add explicit check: if `hasCompletedOnboarding` is true, it's always an upgrade visit.
- Line 47-49: Change the redirect guard — only redirect away if user is NOT on this page explicitly (no `source` param, no state). Beta users with valid access who navigate here from profile/coach should see the page.

**Fix 3a — Handle active subscriber upgrade in frontend**
- Lines 112-115: When `data.alreadySubscribed && data.portalUrl`, open portal directly and don't fall through to `throw`. Currently line 121 `throw new Error('No checkout URL returned')` fires even after portal redirect because there's no `return` statement.
- Add `return` after opening portal URL to prevent fall-through to error.

### File 2: `supabase/functions/create-checkout-session/index.ts`

**Fix 3b — Support plan upgrades for active subscribers**
- Lines 59-80: Instead of always redirecting to billing portal, check if the requested plan is different from the current one. If user is on `monthly_pro` requesting `annual`, create a Stripe Checkout Session for the upgrade (using `mode: 'subscription'` without trial). If same plan, then redirect to portal.
- Add `subscription_tier` to the profile select query (line 47).

### File 3: `src/pages/onboarding/stages/Stage7ContextConnection.tsx`

**Fix 4 — Ensure tour starts after completion resolves**
- Lines 268-321: Restructure `handleComplete` to:
  1. Call `complete-onboarding` 
  2. Await `refreshProfile()` 
  3. Set tour session keys BEFORE navigation
  4. Then navigate to `/daily-check-in?tour=1`
- Set `sessionStorage` keys `first_session_guide_active=1` and `first_session_guide_user={userId}` explicitly before navigating. This ensures DailyCheckIn sees the active tour state regardless of profile timing.

### File 4: `src/pages/DailyCheckIn.tsx`

**Fix 4 + 5 + 6 — Simplify tour eligibility**
- Line 117: Change the early exit guard. Currently `!user?.onboarding_completed_at` blocks everything including first tour and retake. Fix:
  - If `?tour=1` is present OR retake key is set: allow guide regardless of `onboarding_completed_at` state (the navigation itself proves eligibility)
  - Only block if none of these signals are present AND `onboarding_completed_at` is missing

### File 5: `src/pages/ExecutiveHome.tsx`

**Fix 5 — Retake tour guard**
- Line 76: Same fix as DailyCheckIn — don't block on `!user?.onboarding_completed_at` when retake session key is present.

---

## Summary of Logic Rules After Fix

| Scenario | Behavior |
|----------|----------|
| First-time tour | `Stage7` sets session keys + navigates with `?tour=1` → DailyCheckIn sees tour param + session keys → guide opens |
| Retake tour | `UserSettingsPopover` sets retake key → navigates to `/daily-check-in` → DailyCheckIn sees retake key → guide opens |
| Checkout failure (initial) | Toast error, stay on payment page, no step recorded, no navigation |
| Beta initial onboarding | Skips payment, navigates to app-intro (unchanged) |
| Beta explicit upgrade | `isUpgradeVisit=true` → no auto-skip, shows pricing page |
| Active monthly → annual | Frontend calls checkout → backend creates upgrade session (no trial) |
| Active annual | `availablePlans` is empty → shows "best plan" message |

## What Does Not Change
- UI design and layout
- Onboarding flow structure and routing
- OnboardingGuard / OnboardingBlockGuard
- Subscription access logic (`hasValidAccess`)
- Complete-onboarding edge function
- DB schema

