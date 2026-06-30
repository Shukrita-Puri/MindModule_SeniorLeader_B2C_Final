# Onboarding - Final Wiring Guide

Use this guide when adding or repairing onboarding code. For the fuller contract, read `docs/ONBOARDING_FINAL_SSOT.md`.

---

## 1. Start Here

Read these files first:

- `src/App.tsx`
- `src/pages/onboarding/OnboardingFlow.tsx`
- `src/components/OnboardingGuard.tsx`
- `src/utils/onboardingStatus.ts`
- `src/utils/onboardingCompletion.ts`
- `src/utils/onboardingStorage.ts`
- `src/hooks/useOnboardingProgress.ts`
- `src/utils/onboardingV8.ts`
- `supabase/functions/onboarding-progress/index.ts`
- `supabase/functions/complete-onboarding/index.ts`
- `supabase/functions/generate-onboarding-insight/index.ts`
- `supabase/functions/onboarding-v8-save/index.ts`
- `supabase/functions/_shared/onboardingV8Validation.ts`
- `supabase/functions/synthesize-cos-profile/index.ts`

---

## 2. Correct Wiring Shape

```text
Anonymous user
  |
  v
legacy questionnaire localStorage
  |
  v
signup-step / Auth0
  |
  v
results -> generate-onboarding-insight
  |
  | skip_completion=true
  v
complete-onboarding persists baseline
  |
  v
payment/app-intro/context-connection
  |
  | final complete-onboarding call
  v
profiles.onboarding_completed_at
```

```text
Authenticated v8 user
  |
  v
app-intro -> leadership-context -> cognitive-load -> protect-goals
  |
  v
brief-prefs -> permissions -> connect -> done
  |
  v
onboarding-v8-save + optional synthesize-cos-profile
  |
  v
onboarding_v8_responses.completed_at
```

---

## 3. Do Not Duplicate

Do not duplicate:

- onboarding route gating;
- resume route logic;
- v8 chip/enum validation;
- scoring matrices;
- final completion writes;
- Auth0 verification;
- localStorage session format.

Add shared helpers only when multiple stages need the same rule.

---

## 4. Legacy Stage Map

- `/onboarding` -> `Stage1Welcome`
- `/onboarding/identity` -> `Stage2Identity`
- `/onboarding/emotional-awareness` -> `Stage3EmotionalAwareness`
- `/onboarding/stress-response` -> `Stage4StressResponse`
- `/onboarding/recovery-patterns` -> `Stage5RecoveryPatterns`
- `/onboarding/mental-clarity` -> `Stage6MentalClarity`
- `/onboarding/growth-intention` -> `Stage7GrowthIntention`
- `/onboarding/signup-step` -> `Stage8SignupStep`
- `/onboarding/results` -> `Stage8Results`
- `/onboarding/payment` -> `Stage6Payment` or redirect when payment is suppressed
- `/onboarding/app-intro` -> `StageUSPIntro`
- `/onboarding/context-connection` -> `Stage7ContextConnection`

---

## 5. V8 Stage Map

- `/onboarding/app-intro`
- `/onboarding/leadership-context`
- `/onboarding/cognitive-load`
- `/onboarding/protect-goals`
- `/onboarding/brief-prefs`
- `/onboarding/permissions`
- `/onboarding/connect`
- `/onboarding/done`

V8 screens own their own full-bleed UI and bypass legacy progress chrome.

---

## 6. Persistence Rules

Legacy pre-auth:

- use `saveResponse` / `getResponse`;
- localStorage is temporary bridge only.

Legacy post-auth:

- use `generate-onboarding-insight` for scoring;
- use `complete-onboarding` for profile persistence;
- use `skip_completion=true` when saving results before final completion;
- use `onboarding-progress` for durable step markers.

V8:

- use `saveV8` for partial saves;
- use `markV8Complete` for completion;
- use `synthesizeCosProfile` as best-effort enrichment;
- keep client and Deno v8 validation mirrors aligned.

---

## 7. Guard Rules

Product pages:

- `OnboardingGuard` should allow completed users;
- incomplete users should resume onboarding;
- unknown DB state should fail open to avoid false redirects.

Onboarding pages:

- `OnboardingBlockGuard` should allow anonymous/incomplete users;
- completed users should go to `/executive-home`;
- payment whitelist applies only when payment flow is active.

---

## 8. QA Checklist

Check these before calling onboarding done:

- anonymous user reaches `/onboarding`;
- each legacy answer survives refresh;
- back navigation works through legacy stages;
- signup handoff preserves result computation;
- `/onboarding/results` calls `generate-onboarding-insight`;
- baseline persists without completing onboarding;
- final completion sets `profiles.onboarding_completed_at`;
- incomplete protected user redirects to resume route;
- completed user reaches `/executive-home`;
- completed user cannot restart onboarding accidentally;
- v8 fields save through `onboarding-v8-save`;
- v8 invalid completion returns validation errors;
- COS synthesis failure does not block onboarding completion.

