
Audit summary (root causes)
1) Primary blocker (confirmed): `OnboardingBlockGuard` redirects any authenticated user with `onboarding_completed_at` away from all `/onboarding/*` routes, including `/onboarding/payment`, to `/daily-check-in`.
2) Secondary blocker (edge case): `validateStageAccess('/onboarding/payment')` can still redirect if onboarding-progress data is missing/incomplete for legacy users, even if profile onboarding is complete.
3) Dev mode inconsistency: `ProtectedRoute` bypasses in `DEV_MODE`, but onboarding guards still run, so route behavior is inconsistent for dev testing.
4) Technical error found in this area: Radix dialog accessibility warnings (`DialogContent` missing `DialogTitle`/`DialogDescription`) from `HexBadgeRow` modal path.

Implementation plan
1) Fix the redirect bug at guard level (auth users)
- File: `src/components/OnboardingGuard.tsx`
- Add `useLocation()` in `OnboardingBlockGuard`.
- Permit `/onboarding/payment` for users with completed onboarding (do not redirect this one route).
- Keep current redirect for other onboarding routes.
- Update the render-block condition so it also respects this exception.
- Add `location.pathname` to dependencies to avoid stale behavior.

2) Harden stage gating so payment remains reachable for completed users
- Files: `src/pages/onboarding/OnboardingFlow.tsx`, `src/utils/onboardingStatus.ts`
- In flow gating, short-circuit validation for `/onboarding/payment` when authenticated profile already has `onboarding_completed_at`.
- Keep existing onboarding-stage enforcement for non-completed users.

3) Make dev mode behavior reliable
- File: `src/components/OnboardingGuard.tsx` (and optionally `src/config/devMode.ts`)
- In `DEV_MODE`, bypass onboarding guards (or provide a complete mock onboarding state) so `/profile -> Upgrade Plan -> /onboarding/payment` works consistently during development.
- Preserve production guard logic unchanged.

4) Prevent fallback redirect side effect from payment
- File: `src/pages/onboarding/stages/Stage6Payment.tsx`
- On checkout failure, only send users to `/onboarding/context-connection` if they are in onboarding flow.
- If they came from upgrade flow (already completed onboarding), keep them on payment page and show error toast.

5) Fix technical/accessibility errors flagged in logs
- File: `src/components/home/HexBadgeRow.tsx`
- Add `DialogTitle` + `DialogDescription` (can be visually hidden) to remove runtime warnings.

Technical details
- No backend schema changes required.
- Route contract remains `/onboarding/payment` (as requested).
- Guard exception should be path-scoped (not global) to avoid reopening full onboarding for completed users.
- Validation order should be: route exception for completed users -> normal stage gating for everyone else.

Verification checklist (end-to-end)
1) Auth user with completed onboarding clicks “Upgrade Plan” on `/profile` -> lands on `/onboarding/payment` (no bounce).
2) Auth user directly opens `/onboarding/payment` -> stays on payment.
3) Completed user opening `/onboarding/identity` still redirects to `/daily-check-in`.
4) In `DEV_MODE`, `/profile -> Upgrade Plan` reaches payment.
5) Payment checkout failure does not reroute completed users to onboarding context.
6) No Radix dialog accessibility warnings in console for the affected modal.
