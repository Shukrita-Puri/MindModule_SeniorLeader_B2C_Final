# Fix: Tour completion should land user on Daily Check-in

## Audit

The 3-step First Session Tour ends on the Plan page (step 3 highlights `[data-tour="daily-plan"]`). When the user clicks **Let's Go!**, `FirstSessionGuide.finish()` runs:

1. Clears tour sessionStorage (`clearFirstSessionTour({ markDone: true })`)
2. Calls `onComplete()` provided by the host page

`PlanPage.tsx` (line 67) implements `onComplete` as:
```tsx
onComplete={() => {
  setShowGuide(false);
  recordStep('first_session_walkthrough', { completed: true });
}}
```

Result: the guide disappears but the user is left sitting on /plan. This is **not** the intended end-state — the canonical post-onboarding home is `/daily-check-in` (already used everywhere else, e.g. `Front.tsx` `CANONICAL_HOME`).

The other two `FirstSessionGuide` mount sites (`DailyCheckIn.tsx`, `ExecutiveHome.tsx`) are intermediate hosts during the tour — only the one that actually receives the final "Let's Go!" needs the redirect, which today is `PlanPage`.

## Change

**File:** `src/pages/PlanPage.tsx`

In the `onComplete` handler for `<FirstSessionGuide>`, navigate to `/daily-check-in` after recording the step.

```tsx
const navigate = useNavigate(); // add import from react-router-dom

<FirstSessionGuide onComplete={() => {
  setShowGuide(false);
  recordStep('first_session_walkthrough', { completed: true });
  navigate('/daily-check-in', { replace: true });
}} />
```

`replace: true` keeps the back stack clean so Back doesn't return into a finished tour.

## Why scoped to PlanPage only

- Tour ends deterministically on step 3 (Plan). `DailyCheckIn` and `ExecutiveHome` only host the guide for steps 1 & 2 transitions; the user clicks **Next** there, not **Let's Go!**.
- A skip mid-tour from any page already calls the same `finish()` → `onComplete()`, so a user who skips on /plan also lands on /daily-check-in (desired). Skips on /daily-check-in or /executive-home stay on those pages, which is fine — they're already valid app surfaces.

## Risk

Very low. Single navigation call in one onComplete callback. No changes to tour state machine, sessionStorage keys, or other mount sites.
