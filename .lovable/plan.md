## New onboarding narrative

Six screens, in order:

1. **Welcome / Value Pitch** (`/onboarding`) — reframed Stage1. Explains what the app does, what data it uses (LinkedIn + calendar + wearable), what the user gets back (personalized briefs, mastery plan, notifications). Single CTA: "See pricing".
2. **Pricing & Trial** (`/onboarding/pricing`) — moved earlier. Shows £X/mo, 7-day free trial, cancel anytime, what's included. Stripe checkout. User commits to trial here, *before* sharing any personal data. On success, returns to step 3.
3. **LinkedIn intake** (`/onboarding/linkedin`) — paste LinkedIn URL + explicit consent checkbox ("Analyze my public profile to personalize the app"). Calls `analyze-linkedin-profile` edge function which scrapes via Firecrawl + LLM-summarizes. Fallback "I'd rather type a few details" link → short manual path (role, seniority, top challenge — 3 fields max).
4. **Context confirmation** (`/onboarding/context`) — shows the LLM-inferred leadership context summary + 3 suggested priority themes as chips. User confirms or edits priorities (max 3, pick from 8). Nothing else asked.
5. **Connect calendar + wearable** (`/onboarding/connect`) — hard gate. Reuses `CalendarProviderPicker` (Apple/Google/Microsoft) + wearable connection UI (HealthKit/Oura). "Continue" disabled until ≥1 calendar AND ≥1 wearable connected. Copy explains why both are required and what reduced experience looks like (but doesn't offer it).
6. **Done** (`/onboarding/done`) — brief confirmation, "Set up first daily check-in" → `/daily-check-in`.

Deleted stages: Stage2Identity, Stage3EmotionalAwareness, Stage4StressResponse, Stage5RecoveryPatterns, Stage6MentalClarity, Stage7GrowthIntention, Stage8Results, Stage8SignupStep, StageUSPIntro. Their LLM-derived equivalents come from the LinkedIn analysis in step 3.

## Database changes (one migration)

Add to `profiles`:
- `linkedin_url text`
- `linkedin_raw_markdown text` (cached scrape, for re-analysis without re-scraping)
- `leadership_context jsonb` — `{ seniority, role_complexity, communication_style, event_pressure_profile, summary_paragraph }`
- `inferred_priorities text[]` — LLM-suggested
- `confirmed_priorities text[]` — what user confirmed/edited
- `linkedin_analyzed_at timestamptz`

Add to `onboarding_progress` (replace old milestone columns; keep old ones for backward compatibility but stop writing them):
- `pricing_at timestamptz` — Stripe trial started
- `linkedin_at timestamptz`
- `context_confirmed_at timestamptz`
- `connections_at timestamptz` — both calendar AND wearable verified
- `onboarding_completed_at timestamptz`

## New edge function: `analyze-linkedin-profile`

Input: `{ linkedin_url }`. Steps:
1. Validate URL (must be linkedin.com/in/...)
2. Scrape with Firecrawl (`scrape` endpoint, markdown format)
3. Send markdown to Lovable AI Gateway (`google/gemini-3-flash-preview`) with a structured-output tool-call to return `{ seniority, role_complexity, communication_style, event_pressure_profile, summary_paragraph, suggested_priorities[3] }`
4. Write to `profiles` and stamp `onboarding_progress.linkedin_at`
5. Return the synthesized context

Prompt constraint: the LLM must only synthesize from supplied profile text — no invented credentials. If the scrape returns thin content (<200 chars), return a `low_confidence: true` flag so the UI nudges the user to the manual fallback.

## Gating rewrite (`onboardingStatus.ts`)

New resume logic, in order:
1. No `pricing_at` → `/onboarding/pricing`
2. No `linkedin_at` (and no manual-fallback flag) → `/onboarding/linkedin`
3. No `context_confirmed_at` → `/onboarding/context`
4. No `connections_at` → `/onboarding/connect`
5. Otherwise → `/onboarding/done` or `/daily-check-in`

`connections_at` is set server-side by a small edge function `verify-onboarding-connections` that checks `calendar_connections` and (Oura row OR healthkit telemetry) exist for the user. The connect screen polls this after each connection completes; "Continue" enables when verified true.

`validateStageAccess` rewritten to enforce the new sequence — user can't deep-link past their current milestone.

## Frontend touch points

- New: `src/pages/onboarding/stages/StagePricing.tsx`, `StageLinkedIn.tsx`, `StageContext.tsx`, `StageConnect.tsx`, `StageDone.tsx`
- Rewrite: `src/pages/onboarding/stages/Stage1Welcome.tsx` (new copy, single CTA)
- Rewrite: `src/pages/onboarding/OnboardingFlow.tsx` (new STAGE_ROUTES, new back-nav map, new progress weights)
- Rewrite: `src/App.tsx` onboarding routes block
- Rewrite: `src/utils/onboardingStatus.ts` resume + gating
- Update: `src/utils/onboardingCompletion.ts` completion check (uses `onboarding_completed_at`)
- Update: `src/components/onboarding/ResumeOnboardingBanner.tsx` (new step labels)
- Update: `src/components/OnboardingGuard.tsx` if it hardcodes old paths
- Delete: 9 stage files listed above + their lazy imports in App.tsx
- Reuse: `src/components/calendar/CalendarProviderPicker.tsx` and existing wearable connection UI inside StageConnect

## Connector and secrets

- Connect Firecrawl via `standard_connectors--connect` (`firecrawl`). Gateway-based, injects `FIRECRAWL_API_KEY`.
- Stripe already enabled (BYOK keys present in secrets). Pricing page uses existing `STRIPE_TEST_PRICE_*` env vars and existing Stripe checkout edge function.

## Test plan

1. Fresh user → Welcome → Pricing → Stripe test checkout → returns to LinkedIn → paste a real LinkedIn URL → context screen renders LLM summary → confirm priorities → connect Apple calendar (sim) + Oura → Done → /daily-check-in
2. User clicks "I'd rather type" on LinkedIn step → 3-field manual form → context screen pre-fills from manual input
3. User tries to deep-link `/onboarding/connect` without finishing pricing → redirected back to `/onboarding/pricing`
4. User connects only calendar, not wearable → "Continue" stays disabled with clear copy

## Out of scope (explicit)

- LinkedIn OAuth (user chose paste-URL via Firecrawl)
- Soft-gate connections (user chose hard gate)
- Keeping any of the old questionnaire stages
- Migrating old onboarding_progress data into new columns (the old questionnaire is gone; existing completed users keep `onboarding_completed_at` if already set)