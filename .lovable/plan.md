

## Fix Onboarding Results: Scoring, Design, and Data Persistence

### Problem 1: All Scores Showing 50/50/50 (Critical)

The edge function has a DEFAULT fallback (`{ er: 50, fr: 50, en: 50 }`) that fires when answer keys don't match the lookup tables. The user's screenshot confirms all three components at exactly 50 — meaning `getAllResponses()` returned empty/undefined answers.

**Root cause**: The Auth0 signup redirect (Stage 8) navigates away from the app entirely. When the callback returns to `/onboarding/results`, the `OnboardingFlow` component calls `initializeSession()` which should preserve existing data. However, if the session was somehow cleared or if the user tests by navigating directly to `/onboarding/results`, all answers are undefined.

**Fix**:
- Add console logging in `Stage8Results.tsx` to output the raw answers before calling the edge function
- Add a guard: if any answer is missing, show an error instead of computing with defaults
- This ensures the user gets a clear message rather than silently wrong scores

### Problem 2: Results Page Design (v2 Spec Compliance)

Current state vs v2 spec requirements:

| Element | Current | Required |
|---------|---------|----------|
| Background | Plain white | Radial gradient / geometric pattern consistent with other onboarding stages |
| CTA button text | "Connect & Continue" | "Connect & Continue" (navigates to payment as next step in flow) |
| "watch-fors" text | "watch-fors" | "watch-outs" |
| Archetype title format | "You are The Adaptive Navigator." | Correct -- matches spec |
| Radar chart | Own pattern only, no benchmark | Correct -- matches spec |
| AI insight | 2-3 sentences, Gemini | Correct -- matches spec |
| Development path line | Present | Correct -- matches spec |
| 3 bullet points | Present | Correct -- matches spec |

### Problem 3: EN Weights (Already Fixed)

The EN weights were normalized from 2.0 to 1.0 in the previous edit. Verified working:
- Worst answers (push_through, power_through, always_tired, overwhelmed) now produce ER=40, FR=41, EN=31 and correctly assign "Adaptive Navigator"
- This is the correct default for low scores per the architecture spec

### Files to Change

1. **`src/pages/onboarding/stages/Stage8Results.tsx`**
   - Add console logging for raw answers before edge function call
   - Add guard: if any of the 4 answers is missing, show retry message instead of proceeding with defaults
   - Fix "watch-fors" to "watch-outs" in the bullet points
   - Keep CTA navigating to `/onboarding/payment` (payment is Stage 10, before context-connection Stage 11)

2. **`supabase/functions/generate-onboarding-insight/index.ts`**
   - Add server-side logging of received answers for debugging
   - When answers are undefined/null, return a clear error response instead of silently using defaults

### Technical Details

**Answer validation in edge function** (lines ~120-130):
```typescript
// Before computing, validate all 4 answers exist
const { q1, q2, q3, q4 } = body.answers;
if (!q1 || !q2 || !q3 || !q4) {
  console.error('Missing answers:', { q1, q2, q3, q4 });
  return new Response(
    JSON.stringify({ error: 'Incomplete answers. Please complete all questions.' }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

**Client-side guard in Stage8Results** (before calling edge function):
```typescript
const responses = getAllResponses();
console.log('[Results] Raw responses:', JSON.stringify(responses));

if (!responses.emotional_awareness_response || !responses.stress_response_response || 
    !responses.recovery_patterns_response || !responses.mental_clarity_response) {
  setError('Your answers were not saved correctly. Please go back and complete the assessment.');
  setLoading(false);
  return;
}
```

### Deployment

- Re-deploy `generate-onboarding-insight` edge function after adding validation

