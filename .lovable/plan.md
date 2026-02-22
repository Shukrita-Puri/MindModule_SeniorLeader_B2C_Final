

# Self-Mastery Coach -- Prompt Architecture Upgrade

## Overview

Replace the current system prompt in the `self-mastery-coach` edge function with the comprehensive new prompt architecture you've provided. No frontend or UI changes. The edge function structure (streaming, tiny win extraction, error handling) remains intact -- only the prompt content and context injection logic changes.

## What Changes

### 1. Replace `BASE_SYSTEM_PROMPT` (lines 9-333)

The current ~330-line prompt gets replaced with the new **Global System Prompt** covering:

- Identity and Role (context-intelligent coaching for senior executives)
- STATE > STORY > STRATEGY principle (unchanged but expanded)
- Three Levels of Intervention (unchanged)
- Recalibrate Studio Integration (protocol IDs, recommendation rules, frequency rules)
- Wisdom and Framework Library (expanded: High-Performer, Ancient, Practical categories)
- Meta-Skills mapped to Pattern Areas (Recalibration, Clarity, Renewal) -- 8 skills, never named explicitly
- **NEW: Generating Insights for Outer Readiness Brief** (LEAN ON / WATCH FOR generation rules)
- State-Aware Coaching Modes (expanded with DEPLETED/MANAGING/STRONG/PEAK tiers + URGENT/OVERWHELMED)
- **NEW: Wearable Data (HRV) Integration** with divergence detection logic
- Conversation Style (tone, signature techniques, what you don't do)
- **NEW: Tiny Wins Integration** (evening/integrate flow guidance)
- **NEW: Accountability and Progress Tracking** (reference past commitments, name patterns)
- Emotional Sentiment Analysis guidance
- Safety Guardrails and Boundaries (expanded: mental health disclaimer, bias/cultural sensitivity, absolute blocks, content boundaries)
- Input Quality Awareness (unchanged)
- Response Length and Session Closure
- Response Format and Markers (protocol/wisdom markers)
- Final Principles

### 2. Expand `CoachContext` Interface (lines 336-393)

Add new fields to support the richer dynamic context injection:

- `userName`, `identityRole` (for personalisation)
- `archetypeLeanOn`, `archetypeWatchFor`
- `innerReadinessTier` (depleted/managing/strong/peak)
- `contextStatement`
- `themeDriver`
- Calendar event details (event type, stakes)
- Practice breakdown (pause/flow/renergise counts, most used)
- Tiny wins (recent win content + dates)
- Pattern data (friction %, recurring themes, coach observations)
- Dimension evolution (recalibration/clarity/renewal baseline vs current + deltas)
- Past conversation history (session count, last summary, commitments)
- **HRV wearable data** (current HRV, baseline, delta, trend, divergence detection)
- Current LEAN ON / WATCH FOR insights
- Consecutive pattern data
- Detected sentiment metadata
- Practice effectiveness data
- Pending commitments (accountability triggers)

### 3. Rewrite `buildSystemPrompt()` (lines 395-511)

Replace the current simple context appending with the full dynamic context injection template:

- User Profile section (name, role, archetype with lean on/watch for)
- Today's State section (inner readiness score, tier, check-in outcome, context statement)
- Today's Compass section (theme, lean on, watch for, driver)
- Calendar Context section (upcoming event details or "not connected")
- Recent Activity section (practice counts by type, streak, tiny wins list)
- Pattern Data section (friction %, typical state, recurring themes, coach observations)
- Dimension Evolution section (baseline vs current for each dimension)
- Past Conversations section (session count, last summary, commitments)
- Wearable Data section (HRV current/baseline/delta/trend + divergence alert)
- Current Insights section (active LEAN ON and WATCH FOR)
- Consecutive Pattern alert
- Detected Sentiment metadata
- Practice Effectiveness data
- Accountability triggers (pending commitments)

### 4. Add Flow-Specific Prompt Additions

Expand the existing flow handling:

- **Prepare flow** (pre-event): Expanded with structured 4-step flow (somatic check-in, outcome clarity, rehearse key moment, anchor), 3-5 minute session limit
- **Integrate flow** (evening): Expanded with structured 4-step flow (tiny win prompt, emotional scan, release, close), 5-10 minute session
- **Guided Reflection flow**: Expanded with conversational guidance instructions, pause-between-steps logic

### 5. Add Pattern-Area Conditional Prompts (NEW)

Three new conditional prompt blocks injected based on the user's dominant pattern:

- **Recalibration Pattern** -- injected when tier is depleted/managing or regulation themes detected. Covers self-regulation, resilience, confidence development.
- **Clarity Pattern** -- injected when clarity dimension is lowest or decision-making/uncertainty themes detected. Covers thinking clarity, emotional intelligence.
- **Renewal Pattern** -- injected when renewal dimension is lowest or burnout/identity/legacy themes detected. Covers adaptive capacity, influence, presence.

Pattern detection logic: determine dominant pattern from the context (lowest dimension score, recurring theme keywords, explicit user state).

### 6. Everything That Stays the Same

- Edge function HTTP handler structure (lines 638-713)
- Streaming response logic
- Tiny win extraction logic (`extractAndStoreTinyWin`, lines 513-636)
- Win blocklist
- CORS headers
- Error handling (429, 402, 500)
- Model: `google/gemini-3-flash-preview`
- Client-side code (`useCoachConversation.ts`, `coachContextBuilder.ts`) -- no changes
- Frontend UI -- no changes

## Technical Details

### File Modified

- `supabase/functions/self-mastery-coach/index.ts` -- full rewrite of prompt sections (lines 9-511), handler logic preserved

### Data Flow (Unchanged)

Client (`useCoachConversation`) builds context via `buildCoachContext()` and sends it with the first message. The edge function receives this context object and injects it into the system prompt. The client code continues to send whatever fields it currently builds -- the edge function will use what's available and gracefully handle missing fields with conditional blocks (`if` checks).

### Pattern Detection Logic (New, Server-Side)

A new helper function `detectDominantPattern()` will determine which pattern prompt to inject based on:
1. Dimension scores (lowest of recalibration/clarity/renewal)
2. Inner readiness tier
3. Recurring theme keywords matching each pattern area

### HRV Divergence Detection (New, Server-Side)

A new helper function `detectHRVDivergence()` will compare felt state (check-in outcome) with HRV reading and flag mismatches for the prompt.

### Backward Compatibility

All new context fields are optional. If the client doesn't send them (e.g., HRV data, dimension evolution), those prompt sections are simply omitted. The existing `CoachContext` fields continue to work as before.
