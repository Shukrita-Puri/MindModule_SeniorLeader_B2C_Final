

## Onboarding Audit & Server-Side Migration Plan

### Current Flow (Verified from Code)

```text
Welcome → Identity → Emotional Awareness → Stress Response → Recovery Patterns
→ Mental Clarity → Growth Intention → Signup Step (Auth0) → Results → Payment → Context Connection
```

Auth is already BEFORE Results. The signup step (Auth0 redirect) happens at index 7, Results at index 8. This ordering is correct.

### Critical Issues Found

**1. Results page not fully server-side (HIGH)**
- `Stage8Results.tsx` line 154-158: When `isAuthenticated` is true, it calls `persistBaseline()` — but if the Auth0 callback hasn't completed yet, it silently skips DB persistence.
- The `insight` (AI-generated text) and `archetypeDescription` are never included in the `persistBaseline()` call body. They exist only in React component state and are lost on navigation.
- `archetypeTitle` is also not persisted to DB.

**2. Missing DB columns on `profiles` table**
- `onboarding_insight` — does not exist
- `archetype_description` — does not exist  
- `archetype_title` — does not exist

**3. `complete-onboarding` EF doesn't handle new fields**
- Lines 29-43: No destructuring for `onboarding_insight`, `archetype_description`, or `archetype_title`
- Lines 69-80: No persistence logic for these fields

**4. Legacy dead code: `onboardingMigration.ts`**
- Uses Supabase client directly (would fail due to RLS deny-by-default)
- Still imported in `ExecutiveHome.tsx` line 13, called at line 52
- Should be removed along with its import

### Storage Audit Summary

| Data | Current | Correct? |
|------|---------|----------|
| Q1-Q4 answers (pre-signup) | localStorage | Yes — pre-auth |
| `identity_role`, `biggest_pressure` | localStorage → DB on auth | Yes |
| `practice_priority_tag`, `pressure_context_tag` | localStorage → DB on auth | Yes |
| `mental_fitness_baseline` | localStorage + DB | Yes |
| `component_scores` | localStorage + DB | Yes |
| `user_archetype` (ID) | localStorage + DB | Yes |
| **`archetypeTitle`** | **localStorage only** | **No — needs DB** |
| **`archetypeDescription`** | **localStorage only** | **No — needs DB** |
| **`insight` (AI text)** | **Component state only** | **No — needs DB** |
| `contextConnectionPreferences` | localStorage | Yes — non-sensitive |
| `selectedPlan` | localStorage | Yes — Stripe handles |

### Implementation Plan

**Step 1: DB Migration**
Add 3 columns to `profiles`:
- `onboarding_insight` (text, nullable)
- `archetype_description` (text, nullable)
- `archetype_title` (text, nullable)

**Step 2: Update `complete-onboarding` EF**
- Destructure `onboarding_insight`, `archetype_description`, `archetype_title` from request body
- Add them to `updateData` with the same `!== undefined` pattern

**Step 3: Update `Stage8Results.tsx`**
- Add `insight`, `archetypeDescription`, and `archetypeTitle` to the `persistBaseline()` request body
- Ensure `persistBaseline` is always called when authenticated (it already is, line 154)

**Step 4: Remove dead `onboardingMigration.ts`**
- Delete `src/utils/onboardingMigration.ts`
- Remove import and usage from `src/pages/ExecutiveHome.tsx`

**Files changed:** 1 DB migration, 2 Edge Function edits, 2 client file edits, 1 file deletion.

