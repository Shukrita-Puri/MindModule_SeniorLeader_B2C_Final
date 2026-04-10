
What I found

1. The button itself is wired correctly now
- In `src/pages/onboarding/stages/Stage7ContextConnection.tsx`, both the primary CTA and “Skip for now” call `handleComplete`.
- `handleComplete` now ends with an unconditional:
  - `navigate("/daily-check-in?tour=1")`
- So the button is not failing because the click handler is missing.

2. The real bug is the redirect chain after click/login
- `/daily-check-in` is wrapped with:
  - `ProtectedRoute`
  - `OnboardingGuard`
  - `SubscriptionGuard`
- If the app still thinks the user has not completed onboarding, `OnboardingGuard` redirects them back into onboarding instead of letting `/daily-check-in?tour=1` render.
- That exactly matches your symptom: the CTA “does nothing”, but in reality it navigates and then gets bounced back into onboarding.

3. Why existing users are still seeing onboarding pages
There are two concrete gaps in the current guard logic:

A. `OnboardingBlockGuard` only hard-blocks completed users when `user.onboarding_completed_at` is already present
- File: `src/components/OnboardingGuard.tsx`
- For authenticated users on non-root onboarding routes (`/onboarding/results`, `/onboarding/app-intro`, `/onboarding/context-connection` etc.), if `user.onboarding_completed_at` is missing, the guard does this:
  - checks DB completion
  - but if route is not `/onboarding`, it logs “allowing stage gating to handle path” and returns
- That means completed users with stale client profile state can still render onboarding subpages.

B. `validateStageAccess()` is a progression gate, not a “completed-user blocker”
- File: `src/utils/onboardingStatus.ts`
- It checks whether a user has reached a stage, but it does not globally say:
  - “if onboarding is already complete, block all onboarding routes except allowed upgrade flows”
- Worse, on fetch errors it “allows through on error”, which makes leakage into results/payment/app-intro/context pages more likely.

4. Why login as an existing user can still land in onboarding
- `Login.tsx` and `AuthCallback.tsx` both default returning users to `/daily-check-in`, which is correct.
- But if the profile sync or onboarding-completion reconciliation is late/stale, `/daily-check-in` runs through `OnboardingGuard`.
- If `user.onboarding_completed_at` is missing and DB reconciliation fails/times out/transiently returns no token, `OnboardingGuard` sends the user to:
  - `getResumeRoute()`
  - or fallback `/onboarding`
- That creates the “I logged in as an existing user and still saw onboarding” bug.

5. Why the issue is especially visible on results/payment/app-intro/context pages
- `OnboardingFlow` explicitly skips route gating for `/onboarding/payment`.
- Post-signup stage validation allows-through on backend errors.
- `OnboardingBlockGuard` does not proactively block completed users on deep onboarding routes when the local profile is stale.
- Combined, that makes completed users able to see:
  - `/onboarding/results`
  - `/onboarding/payment`
  - `/onboarding/app-intro`
  - `/onboarding/context-connection`

6. Tour behavior is only partially separated today
- `DailyCheckIn.tsx` correctly supports:
  - forced tour via `?tour=1`
  - first-time gating via backend walkthrough state
  - retake support via session flags
- So the tour system itself is not the core problem.
- The problem is route access before `DailyCheckIn` gets a stable “completed onboarding” state.

What is missing / broken

✅ Exists
- Login/callback default return to `/daily-check-in`
- CTA handler on context connection navigates to `/daily-check-in?tour=1`
- Daily Check-In supports forced `?tour=1`
- Backend has `onboarding_completed_at` and walkthrough flags

⚠️ Partially implemented
- Existing-user onboarding blocking
- Completion reconciliation between profile state and route guards
- Separation between first-time onboarding tour and manual retake tour

❌ Missing
- A single hard rule that completed users cannot view onboarding routes other than explicit allowed upgrade routes
- A stable “auth/profile/onboarding-ready” gate before redirect decisions
- Completed-user blocking on onboarding subroutes, not just `/onboarding` root
- Protection against transient auth/profile sync gaps causing false onboarding redirects

Implementation plan

1. Harden onboarding route blocking
- Update `OnboardingBlockGuard` so completed users are redirected away from all onboarding routes except explicit allowed routes, even when they hit deep routes directly.
- Do not rely only on local `user.onboarding_completed_at`; perform reconciliation before allowing any onboarding subroute render.

2. Add a completed-user short-circuit to stage validation
- Update `validateStageAccess()` so if DB/profile says onboarding is complete, it redirects to `/daily-check-in` for all onboarding routes except the intended upgrade payment route.
- Keep `/onboarding/payment` allowed only for real upgrade scenarios, not as a generic leaked page.

3. Make `OnboardingGuard` fail safer for returning users
- Prevent fallback-to-`/onboarding` behavior for authenticated users until onboarding completion has been definitively reconciled.
- Prefer a loading state over redirecting an existing user into onboarding based on stale client state.

4. Separate first-time tour from retake tour cleanly
- Keep `/daily-check-in?tour=1` usable in two contexts:
  - first-time onboarding completion
  - explicit retake from profile
- Ensure only first-time users are shown the onboarding CTA path to it, while existing users can still manually re-trigger it from profile.

5. Verify the context-connection completion path end-to-end
- After the guard fixes, confirm the click path becomes:
  `context-connection CTA -> complete onboarding -> /daily-check-in?tour=1 -> guide opens`
- This should work for both authenticated users and DEV_MODE.

Technical details
- Primary files to update:
  - `src/components/OnboardingGuard.tsx`
  - `src/utils/onboardingStatus.ts`
  - possibly `src/pages/DailyCheckIn.tsx` only if a small eligibility refinement is needed
- No evidence suggests the Stage7 button itself is the root bug anymore.
- Root cause is inconsistent onboarding-completion resolution across route guards, causing existing users to be treated as incomplete during navigation.
