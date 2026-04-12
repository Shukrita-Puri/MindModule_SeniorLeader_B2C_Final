# Onboarding — Comprehensive Architecture Document

> Last updated: 2026-04-12
> Primary files: `src/pages/onboarding/`, `src/utils/onboarding*.ts`, `src/hooks/useOnboardingProgress.ts`
> Edge Functions: `generate-onboarding-insight`, `onboarding-progress`, `complete-onboarding`, `reset-onboarding`

---

## 1. System Purpose

The onboarding flow is a **multi-stage psychometric assessment** that establishes a user's baseline performance profile across three dimensions (Energy Regulation, Focus Recovery, Energy Renewal), assigns an archetype, generates an AI-powered personalised insight, and gates access to the product behind authentication and payment.

---

## 2. Architecture Overview

```text
┌───────────────────────────────────────────────────────────────┐
│                    CLIENT-SIDE FLOW                            │
│                                                               │
│  Stage 1: Welcome (/onboarding)                               │
│     ↓                                                         │
│  Stage 2: Identity (/onboarding/identity)                     │
│     ↓ saves: identity_type, identity_role                     │
│  Stage 3: Emotional Awareness (/onboarding/emotional-awareness)│
│     ↓ saves: emotional_awareness_response (Q1)                │
│  Stage 4: Stress Response (/onboarding/stress-response)       │
│     ↓ saves: stress_response_response (Q2)                    │
│  Stage 5: Recovery Patterns (/onboarding/recovery-patterns)   │
│     ↓ saves: recovery_patterns_response (Q3)                  │
│  Stage 6: Mental Clarity (/onboarding/mental-clarity)         │
│     ↓ saves: mental_clarity_response (Q4)                     │
│  Stage 7: Growth Intention (/onboarding/growth-intention)     │
│     ↓ saves: growth_intention, practice_priority_tag           │
│                                                               │
│  ═══════ AUTHENTICATION GATE ═══════                          │
│                                                               │
│  Stage 8: Signup (/onboarding/signup-step)                    │
│     ↓ Auth0 signup/login                                      │
│  Stage 9: Results (/onboarding/results)                       │
│     ↓ calls: generate-onboarding-insight (server-side scoring)│
│     ↓ calls: complete-onboarding (persist results)            │
│  Stage 10: Payment (/onboarding/payment)                      │
│     ↓ Stripe checkout or beta access                          │
│  Stage 11: App Intro (/onboarding/app-intro)                  │
│     ↓ USP walkthrough                                         │
│  Stage 12: Context Connection (/onboarding/context-connection)│
│     ↓ Calendar + wearable setup                               │
│     ↓ calls: complete-onboarding (mark completed)             │
│     → Redirect to /daily-check-in?tour=1                      │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. Stage Definitions

### 3.1 Pre-Auth Stages (localStorage)

| Stage | Route | Component | Data Captured | Storage |
|-------|-------|-----------|---------------|---------|
| 1 | `/onboarding` | `Stage1Welcome.tsx` | Session start | `localStorage` |
| 2 | `/onboarding/identity` | `Stage2Identity.tsx` | `identity_type`, `identity_role` | `localStorage` |
| 3 | `/onboarding/emotional-awareness` | `Stage3EmotionalAwareness.tsx` | `emotional_awareness_response` (Q1) | `localStorage` |
| 4 | `/onboarding/stress-response` | `Stage4StressResponse.tsx` | `stress_response_response` (Q2) | `localStorage` |
| 5 | `/onboarding/recovery-patterns` | `Stage5RecoveryPatterns.tsx` | `recovery_patterns_response` (Q3) | `localStorage` |
| 6 | `/onboarding/mental-clarity` | `Stage6MentalClarity.tsx` | `mental_clarity_response` (Q4) | `localStorage` |
| 7 | `/onboarding/growth-intention` | `Stage7GrowthIntention.tsx` | `growth_intention`, `practice_priority_tag`, `pressure_context_tag` | `localStorage` |

### 3.2 Post-Auth Stages (Database)

| Stage | Route | Component | Data Captured | Storage |
|-------|-------|-----------|---------------|---------|
| 8 | `/onboarding/signup-step` | `Stage8SignupStep.tsx` | Auth0 account | Auth0 + profiles |
| 9 | `/onboarding/results` | `Stage8Results.tsx` | Scores, archetype, insight | `profiles` via `complete-onboarding` |
| 10 | `/onboarding/payment` | `Stage6Payment.tsx` | Subscription plan | Stripe + `profiles` |
| 11 | `/onboarding/app-intro` | `StageUSPIntro.tsx` | — | — |
| 12 | `/onboarding/context-connection` | `Stage7ContextConnection.tsx` | Calendar/wearable setup | `user_integrations`, `onboarding_progress` |

---

## 4. Data Storage Architecture

### 4.1 localStorage (Pre-Auth)

**Key**: `mind_module_onboarding`

```typescript
interface OnboardingSession {
  sessionId: string;           // crypto.randomUUID()
  currentStage: number;
  startedAt: string;           // ISO timestamp
  responses: Record<string, any>;  // All questionnaire answers
  mental_fitness_baseline?: number;
  user_archetype?: any;
  component_scores?: any;
}
```

**Functions** (`src/utils/onboardingStorage.ts`):
- `initializeSession()` — Creates or returns existing session
- `getSession()` / `updateSession()` — CRUD operations
- `saveResponse(key, value)` / `getResponse(key)` — Per-question storage
- `getAllResponses()` — Returns all responses
- `clearSession()` — Removes storage key

### 4.2 Database (Post-Auth)

**Table: `onboarding_progress`**
- Tracks step completion timestamps: `identity_at`, `emotional_awareness_at`, `stress_response_at`, `recovery_patterns_at`, `mental_clarity_at`, `growth_intention_at`, `signup_step_at`, `results_at`, `payment_at`, `context_connection_at`, `first_session_walkthrough_at`
- `current_step` — latest step name
- `completed_at` — final completion timestamp
- `selected_plan` — payment plan chosen
- `context_calendar_enabled`, `context_watch_enabled` — integration choices

**Table: `profiles`** (onboarding-related columns)
- `onboarding_completed_at` — canonical completion flag
- `mental_fitness_baseline` — overall baseline score
- `component_scores` — JSON: `{energyRegulation, focusRecovery, energyRenewal}`
- `user_archetype` — archetype ID (e.g., `grounded-leader`)
- `archetype_title`, `archetype_description` — display strings
- `identity_role`, `biggest_pressure` — identity data
- `energy_regulation_response`, `focus_recovery_response`, `energy_renewal_response` — raw Q1-Q4 answers
- `growth_priority`, `practice_priority_tag`, `pressure_context_tag` — personalisation tags
- `onboarding_insight` — AI-generated insight text
- `onboarding_session_id` — links to localStorage session

---

## 5. Scoring Engine (Server-Side)

**Location**: `supabase/functions/generate-onboarding-insight/index.ts`

### 5.1 Component Scores (3-Dimension Model)

Scores are calculated **server-side only** from raw answers (Q1-Q4):

#### Score Matrices

| Answer | Energy Regulation | Focus Recovery | Energy Renewal |
|--------|------------------|----------------|----------------|
| **Q1 (Emotional Awareness)** ||||
| `notice_early` | 85 | 75 | 70 |
| `physical_signs` | 60 | 55 | 65 |
| `realize_after` | 45 | 40 | 50 |
| `push_through` | 35 | 55 | 30 |
| **Q2 (Stress Response)** ||||
| `stay_grounded` | 90 | 80 | 80 |
| `react_quickly` | 45 | 50 | 55 |
| `freeze_overthink` | 55 | 35 | 50 |
| `power_through` | 50 | 60 | 35 |
| **Q3 (Recovery Patterns)** ||||
| `bounce_back` | 80 | 85 | 90 |
| `weekend_recover` | 55 | 55 | 60 |
| `accumulating_fatigue` | 45 | 40 | 35 |
| `always_tired` | 35 | 30 | 25 |
| **Q4 (Mental Clarity)** ||||
| `crystal_clear` | 80 | 90 | 75 |
| `mostly_clear` | 65 | 70 | 60 |
| `fog_creeps` | 45 | 40 | 45 |
| `overwhelmed` | 35 | 25 | 35 |

#### Component Weights

```
Energy Regulation = Q1×0.40 + Q2×0.35 + Q3×0.10 + Q4×0.15
Focus Recovery    = Q1×0.25 + Q2×0.20 + Q3×0.30 + Q4×0.25
Energy Renewal    = Q1×0.175 + Q2×0.225 + Q3×0.30 + Q4×0.30
```

#### Baseline Score
```
Baseline = ER×0.35 + FR×0.35 + EN×0.30
```

### 5.2 Archetype Assignment (Priority Cascade)

| Priority | Condition | Archetype ID | Title |
|----------|-----------|-------------|-------|
| 1 | ER ≥ 65 AND EN ≥ 55 | `grounded-leader` | The Grounded Master |
| 2 | EN ≥ 65 AND ER ≥ 50 | `resilient-performer` | The Resilient Performer |
| 3 | FR ≥ 65 AND ER ≥ 45 | `clear-thinker` | The Clear Thinker |
| 4 | ER ≥ 60 AND FR < 50 | `intensity-driver` | The Intensity Driver |
| 5 | Default | `adaptive-navigator` | The Adaptive Navigator |

### 5.3 Client-Side Scoring (Legacy/Behavioral)

**Location**: `src/utils/onboardingScoring.ts`

Separate 8-meta-skill scoring system for behavioral questions (Q1-Q3 behavioral):
- Maps to: `self_regulation`, `resilience`, `emotional_intelligence`, `confidence`, `thinking_clarity`, `adaptive_capacity`, `influence`, `presence`
- Normalised to 0-10 scale
- Generates profile type (e.g., "Self-Regulation Leader", "Balanced Leader")
- Includes self-assessment alignment detection (MATCH, UNDERESTIMATE, OVERESTIMATE)

---

## 6. Edge Functions

### 6.1 `generate-onboarding-insight` (259 lines)

**Purpose**: Server-side scoring + AI insight generation

**Flow**:
1. Receive raw answers (Q1-Q4) or legacy pre-computed scores
2. Calculate component scores using weight matrices
3. Assign archetype via priority cascade
4. Generate AI insight via Anthropic Claude

**LLM Prompt**:
```
You are an Executive Performance Coach. A leader just completed their baseline assessment.

Results:
- Archetype: {title}
- Energy Regulation: {score}/100
- Focus Recovery: {score}/100
- Energy Renewal: {score}/100
- Primary pressure: {pressureContext}
- Practice goal: {practiceGoal}

Write 2-3 sentences that name this leader's specific pattern – what their scores reveal 
about how they lead under pressure, and what their practice will build. Speak directly to 
the leader. No generic language. No research citations. No timeline promises. 
No percentile comparisons.
```

**Model Cascade**: `claude-sonnet-4-20250514` → `claude-haiku-3-5-20241022` → `openai/gpt-5-nano`

**Fallback**: If all AI models fail, generates deterministic insight based on lowest component score.

**Returns**: `baselineScore`, `componentScores`, `archetype`, `archetypeTitle`, `archetypeDescription`, `insight`

### 6.2 `onboarding-progress` (155 lines)

**Purpose**: Step-level progress persistence

**Actions**:
- `GET` — Fetches `onboarding_progress` + merges `profiles` fields (beta_user, onboarding_completed_at, etc.)
- `UPSERT_STEP` — Records step completion timestamp (idempotent: only sets if not already set)

**Valid Steps**: `welcome`, `identity`, `emotional_awareness`, `stress_response`, `recovery_patterns`, `mental_clarity`, `growth_intention`, `signup_step`, `results`, `payment`, `context_connection`, `first_session_walkthrough`

**Auth**: Auth0 JWT required

### 6.3 `complete-onboarding` (180 lines)

**Purpose**: Persist final results and mark onboarding complete

**Flow**:
1. Verify Auth0 JWT
2. Build update payload from request body (all fields optional)
3. Upsert `user_integrations` if calendar/watch data provided
4. Set `onboarding_completed_at` if not already set (idempotent)
5. Create initial `mental_fitness_scores` row
6. Return updated profile

**`skip_completion` Flag**: When `true`, persists data without marking onboarding as done (used for intermediate saves at results stage).

### 6.4 `reset-onboarding` (103 lines)

**Purpose**: Reset onboarding for re-entry

**Operations**:
1. Null out all onboarding-related fields on `profiles` (18 fields)
2. Delete `onboarding_progress` row
3. Delete `user_integrations` row

---

## 7. Session Lifecycle

```text
1. User lands on /onboarding
   → initializeSession() creates localStorage entry
   
2. Stages 2-7: Each stage saves responses to localStorage
   → QuestionCard component calls saveResponse()
   → Navigation via router with progress indicator
   
3. Stage 8 (Signup): Auth0 authentication
   → On success, useOnboardingProgress.recordStep('signup-step') fires
   → Fire-and-forget POST to onboarding-progress edge function
   
4. Stage 9 (Results): 
   → Calls generate-onboarding-insight with raw Q1-Q4 answers
   → Receives scores, archetype, insight
   → Calls complete-onboarding with skip_completion=true (persists data)
   → Displays Executive Report UI
   
5. Stage 10 (Payment):
   → Stripe checkout or beta access validation
   → recordStep('payment')
   
6. Stage 11 (App Intro):
   → USP walkthrough slides
   
7. Stage 12 (Context Connection):
   → Calendar + wearable setup
   → Calls complete-onboarding (marks onboarding_completed_at)
   → recordStep('context-connection')
   → Navigate to /daily-check-in?tour=1
```

---

## 8. Stage Gating & Resume Logic

### 8.1 Route Gating (`OnboardingFlow.tsx`)

The `OnboardingFlow` layout component validates access on every route change:

```typescript
const STAGE_ROUTES = [
  "/onboarding",                    // Stage 0 (Welcome)
  "/onboarding/identity",           // Stage 1
  "/onboarding/emotional-awareness",// Stage 2
  "/onboarding/stress-response",    // Stage 3
  "/onboarding/recovery-patterns",  // Stage 4
  "/onboarding/mental-clarity",     // Stage 5
  "/onboarding/growth-intention",   // Stage 6
  "/onboarding/signup-step",        // Stage 7
  "/onboarding/results",            // Stage 8
  "/onboarding/payment",            // Stage 9
  "/onboarding/app-intro",          // Stage 10
  "/onboarding/context-connection", // Stage 11
];
```

**Gating rules** (`validateStageAccess()` in `onboardingStatus.ts`):
- Welcome always accessible
- Pre-auth stages: gated by localStorage responses (previous stage must be complete)
- Post-auth stages: gated by DB `onboarding_progress` timestamps
- Payment page exempted from gating (allows upgrade flow for completed users)
- Completed onboarding redirects to `/daily-check-in` (except payment for upgrades)

### 8.2 Resume Logic (`getResumeRoute()`)

Two-tier approach:
1. **DB-first** (`getResumeRouteFromDB()`): Checks `onboarding_progress` timestamps, walks backwards from latest step
2. **localStorage fallback** (`getResumeRouteFromLocal()`): Checks response keys in order

### 8.3 Completion Detection (`onboardingCompletion.ts`)

```typescript
function isOnboardingCompleteSnapshot(snapshot): boolean {
  return !!(
    snapshot?.onboarding_completed_at ||
    snapshot?.completed_at ||
    snapshot?.context_connection_at
  );
}
```

Beta access check:
```typescript
function hasValidBetaAccess(snapshot): boolean {
  return !!(
    snapshot?.beta_user &&
    snapshot?.beta_expires_at &&
    new Date(snapshot.beta_expires_at) > new Date()
  );
}
```

---

## 9. Progress Indicator

**Component**: `src/components/onboarding/ProgressIndicator.tsx`

**Weighted progress** (shows completion of PREVIOUS stages):

| Stage Index | Progress % |
|-------------|-----------|
| 0 (Welcome) | 0% |
| 1 (Identity) | 10% |
| 2 (Emotional Awareness) | 25% |
| 3 (Stress Response) | 40% |
| 4 (Recovery Patterns) | 55% |
| 5 (Mental Clarity) | 70% |
| 6 (Growth Intention) | 85% |

**Time estimates**: `[0.5, 0.75, 0.75, 0.75, 0.75, 0.75]` minutes remaining.

Hidden on: Welcome stage, post-questionnaire stages, signup step.

---

## 10. Navigation

**Back button logic** (`OnboardingFlow.tsx`):
- Shown for stages 1-6 and payment page
- Payment page → `/onboarding/results` (onboarding flow) or `/executive-home` (upgrade flow, determined by `source` query/state param)
- Each stage maps to its predecessor

**Top bar**: `UnifiedTopBar` with `hideCoach` and `onBack` handler.

---

## 11. Progress Persistence Hook

**Hook**: `src/hooks/useOnboardingProgress.ts`

```typescript
const { recordStep } = useOnboardingProgress();
recordStep('identity', { completed: true });
```

- Fire-and-forget (doesn't block UI)
- Falls back silently if unauthenticated
- Deduplicates inflight requests per step
- POST to `onboarding-progress` edge function with `action: 'UPSERT_STEP'`

---

## 12. Downstream Data Flow

### 12.1 Performance Readiness Brief
- `component_scores` determine "Strength" and "Development Area"
- `practice_priority_tag` becomes "Goal Focus"

### 12.2 Mastery Plan
- `practice_priority_tag` applies +20 initial weight boost (decaying to +7) for relevant content

### 12.3 Self-Mastery Coach
- `component_scores`, `user_archetype`, `practice_priority_tag` provide foundational context
- Archetype determines coaching stance and tool recommendations

### 12.4 Insights Page
- `BaselineReferenceCard` displays onboarding scores as reference
- `LeadershipPatternsCard` shows archetype data

---

## 13. Guard System

### `OnboardingGuard`
- Checks if user has completed onboarding
- Redirects incomplete users to resume route
- Fail-open during profile sync (shows loading state)

### `OnboardingBlockGuard`
- Blocks completed users from re-entering onboarding sub-routes
- Exception: `/onboarding/payment` (upgrade flow)
- Uses real-time DB reconciliation

---

## 14. Feature Flags / Configuration

| Flag | Location | Effect |
|------|----------|--------|
| `skip_completion` | `complete-onboarding` request body | Persists data without marking complete |
| `beta_user` | `profiles` | Bypasses payment gate |
| `beta_expires_at` | `profiles` | Beta expiration check |
| Tour flag | `?tour=1` query param | Triggers first-session walkthrough |
| `first_session_guide_active` | `sessionStorage` | Prevents duplicate tour launches |

---

## 15. Secrets Required

| Secret | Used By | Purpose |
|--------|---------|---------|
| `ANTHROPIC_API_KEY` | `generate-onboarding-insight` | AI insight generation |
| `SUPABASE_URL` | All edge functions | Database access |
| `SUPABASE_SERVICE_ROLE_KEY` | All edge functions | Admin DB access |

---

## 16. Results Page UI (Executive Report)

- Three horizontal gradient progress bars (Recalibration, Clarity, Renewal)
- Archetype assignment with title and description
- AI-generated insight (collapsible, truncated at ~120 chars)
- "Strengths" and "Development Areas" mapped from highest/lowest dimension
- "Development Path" showing Goal Focus and Practice Focus
- Primary CTA: "Activate My System"
