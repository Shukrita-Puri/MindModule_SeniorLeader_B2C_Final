# Onboarding - Final SSOT

**Status:** code-level build source of truth  
**Created:** 2026-06-30  
**Primary route:** `/onboarding/*`  
**Primary shell:** `src/pages/onboarding/OnboardingFlow.tsx`  
**Primary guards:** `src/components/OnboardingGuard.tsx`  
**Primary edge functions:** `onboarding-progress`, `complete-onboarding`, `generate-onboarding-insight`, `onboarding-v8-save`, `synthesize-cos-profile`

This document is the practical source of truth for building or repairing Onboarding. It reflects the current code, including both the legacy questionnaire path and the newer v8 onboarding path.

When this document conflicts with older onboarding docs, verify against the live files and update this file in the same change.

---

## 1. What Onboarding Is

Onboarding has two related responsibilities:

1. Get a new user to a usable, completed product state.
2. Collect enough profile, preference, context, and connection data to personalise Executive Home, Brief, Plan, Nudges, and Insights.

Onboarding is not just UI. It is a persistence and gating system. Completion must be durable in the database, not only in localStorage.

---

## 2. Route And Guard Contract

Routes are defined in `src/App.tsx`.

`/onboarding/*` is wrapped by:

- `OnboardingBlockGuard`
- `OnboardingFlow`

Protected product routes are wrapped by:

- `ProtectedRoute`
- `OnboardingGuard`
- usually `SubscriptionGuard`

Rules:

- incomplete authenticated users are routed back to the correct onboarding resume route;
- completed users are blocked from onboarding routes except explicit whitelist/upgrade flows;
- unresolved DB completion should fail open in `OnboardingGuard` to avoid false redirects from product pages;
- anonymous users may start the legacy pre-auth assessment.

---

## 3. Flow Families

### 3.1 Legacy Questionnaire Flow

Legacy routes:

- `/onboarding`
- `/onboarding/identity`
- `/onboarding/emotional-awareness`
- `/onboarding/stress-response`
- `/onboarding/recovery-patterns`
- `/onboarding/mental-clarity`
- `/onboarding/growth-intention`
- `/onboarding/signup-step`
- `/onboarding/results`
- `/onboarding/payment`
- `/onboarding/app-intro`
- `/onboarding/context-connection`

Pre-auth questionnaire responses live in localStorage through `src/utils/onboardingStorage.ts`.

Post-auth progress and results live in:

- `onboarding_progress`
- `profiles`
- `mental_fitness_scores`
- `user_integrations`

### 3.2 V8 Onboarding Flow

V8 routes:

- `/onboarding/app-intro`
- `/onboarding/leadership-context`
- `/onboarding/cognitive-load`
- `/onboarding/protect-goals`
- `/onboarding/brief-prefs`
- `/onboarding/permissions`
- `/onboarding/connect`
- `/onboarding/done`

V8 screens are full-bleed and suppress the legacy onboarding chrome. They bypass legacy stage gating because they are the newer entry path.

V8 persistence lives in:

- `onboarding_v8_responses`
- optionally synthesized COS profile fields/tables through `synthesize-cos-profile`

---

## 4. Shell Ownership

### `OnboardingFlow.tsx`

Owns:

- session initialization;
- route-level stage gating for legacy stages;
- weighted progress for legacy questionnaire;
- top bar and back navigation;
- v8 path bypass/suppression;
- current stage persistence to local session.

Do not scatter route gating into individual stage components unless the stage owns an internal sub-step.

### `OnboardingGuard.tsx`

Owns product-route enforcement.

Important behaviour:

- fast path from `user.onboarding_completed_at`;
- slow DB reconciliation via `fetchOnboardingProgressSnapshot`;
- fail-open when DB completion is unknown;
- redirect incomplete users to `getResumeRoute`;
- prevent completed users from re-entering onboarding via `OnboardingBlockGuard`.

---

## 5. Legacy Data Contract

### Local Storage

`src/utils/onboardingStorage.ts` stores the anonymous/pre-auth bridge.

Important functions:

- `initializeSession`
- `getSession`
- `updateSession`
- `saveResponse`
- `getResponse`
- `getAllResponses`
- `clearSession`

This is a bridge, not the final source of truth.

### Results Generation

`Stage8Results.tsx` calls `generate-onboarding-insight` using raw answers:

- `emotional_awareness_response` -> `q1`
- `stress_response_response` -> `q2`
- `recovery_patterns_response` -> `q3`
- `mental_clarity_response` -> `q4`

`generate-onboarding-insight` owns:

- component scoring;
- baseline score;
- archetype assignment;
- AI insight generation with deterministic fallback if provider calls fail.

### Baseline Persistence

`Stage8Results.tsx` persists baseline data through `complete-onboarding` with:

```json
{ "skip_completion": true }
```

This is intentional. Results can be saved without marking onboarding done.

### Final Completion

`complete-onboarding` sets `profiles.onboarding_completed_at` only when `skip_completion` is not true and the profile was not already complete.

It also persists:

- `mental_fitness_baseline`
- `component_scores`
- `user_archetype`
- `practice_priority_tag`
- `pressure_context_tag`
- questionnaire responses
- `onboarding_insight`
- archetype title/description
- `self_check_ins_enabled`
- `user_integrations` data where provided
- initial `mental_fitness_scores` row when baseline exists

Completion is idempotent.

---

## 6. V8 Data Contract

### Client Utility

`src/utils/onboardingV8.ts` owns:

- `saveV8`
- `markV8Complete`
- `synthesizeCosProfile`
- `makeDebouncedSaver`

It posts to edge functions using Auth0-backed edge headers.

### Edge Function

`onboarding-v8-save` owns:

- authenticated `GET`;
- authenticated `UPSERT`;
- authenticated `MARK_COMPLETE`;
- sanitation;
- step validation;
- completion validation;
- `step_status` merge;
- upsert into `onboarding_v8_responses`.

### Validation

Canonical v8 validation lives in:

- `supabase/functions/_shared/onboardingV8Validation.ts`
- mirror: `src/utils/onboardingV8Validation.ts`

Keep these in sync.

V8 completion requires:

- at least one protected goal;
- brief timing;
- reset modality;
- weekend signal preference;
- at least one calendar selection;
- at least one wearable selection.

Leadership context is optional at completion.

### COS Synthesis

`synthesize-cos-profile` may enrich a user's profile from:

- LinkedIn URL;
- writing/interview URLs;
- free-text context;
- stakes/load/burden chips;
- goals;
- brief/reset/weekend preferences;
- calendar/wearable selections.

COS synthesis is best-effort. Onboarding completion must not be blocked by COS synthesis status.

---

## 7. Progress Contract

`onboarding-progress` owns durable step tracking in `onboarding_progress`.

Actions:

- `GET`
- `UPSERT_STEP`

`GET` merges `onboarding_progress` with profile completion/result fields so resume can recover if one table is missing data.

Valid tracked step columns include:

- `welcome_at`
- `identity_at`
- `emotional_awareness_at`
- `stress_response_at`
- `recovery_patterns_at`
- `mental_clarity_at`
- `growth_intention_at`
- `signup_step_at`
- `results_at`
- `payment_at`
- `context_connection_at`
- `first_session_walkthrough_at`

`useOnboardingProgress` is fire-and-forget and dedupes in-flight step writes.

---

## 8. Resume Contract

`src/utils/onboardingStatus.ts` owns resume decisions.

Order:

1. Try DB-backed progress via `getResumeRouteFromDB`.
2. Fall back to localStorage via `getResumeRouteFromLocal`.

Rules:

- complete snapshot -> `/executive-home`;
- valid beta/payment/results state -> next appropriate post-results step;
- missing result after signup -> `/onboarding/results`;
- pre-auth missing questionnaire responses -> resume the first missing stage;
- payment suppression redirects payment route to app intro.

Do not recreate resume logic inside individual stage components.

---

## 9. Database Contract

Important tables:

- `profiles`
- `onboarding_progress`
- `onboarding_v8_responses`
- `mental_fitness_scores`
- `user_integrations`

Auth model:

- user ids are Auth0 `sub` strings;
- RLS policies should use `auth.jwt()->>'sub'`;
- edge functions may use service role internally after authenticating caller.

Do not migrate onboarding user ids to UUID unless the whole Auth0 identity model changes.

---

## 10. Build Definition Of Done

An onboarding change is done only when:

1. Anonymous user can start legacy onboarding.
2. Legacy questionnaire answers persist across refresh.
3. Signup/auth handoff preserves enough state for results.
4. Results generation uses `generate-onboarding-insight`.
5. Baseline persistence can save without marking complete.
6. Final completion sets `profiles.onboarding_completed_at`.
7. Product routes allow completed users.
8. Product routes redirect incomplete users to resume.
9. Completed users cannot re-enter onboarding unintentionally.
10. V8 steps save through `onboarding-v8-save`.
11. V8 completion enforces canonical validation.
12. COS synthesis failure does not block completion.

