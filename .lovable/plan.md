

# Coach Intelligence Upgrade — Implementation Plan

## Overview
Transform the coach from a context-consumer into the system's intelligence hub across 4 phases, following the hardened brief's non-negotiable sequence. Every gap is feature-flagged, defensively fetched, and additive-only.

---

## Phase 1 — Edge Function Only (Zero Client Risk)

### Step 1A: Gap 4 — Physiological Mode Adaptation

**File**: `supabase/functions/self-mastery-coach/index.ts`

Add a `PHYSIOLOGICAL_MODE_INSTRUCTION` block injected into `buildSystemPrompt()` after the dynamic context section (around line 3246) and before pattern-area prompts (line 3250).

The mode is determined from existing context data — no new queries needed:
- `context.todayState?.tier` (depleted/managing/strong/peak)
- `context.hrvData?.hrvDeltaPct` (percentage delta from baseline)
- `context.todayCheckins?.[0]?.clarity_level` and `confidence_level`

Mode definitions incorporating clarity and confidence:
- **DEPLETED** (tier=depleted OR hrvDelta < -20% OR clarity ≤ 3 OR confidence ≤ 3): Max 3 sentences, one question max, move to anchor fast, stabilize first
- **MANAGING** (tier=managing): Standard approach, balanced probing and synthesis
- **STRONG** (tier=strong): Go deeper, standard challenge level
- **PEAK** (tier=peak OR hrvDelta > +10% AND clarity ≥ 7 AND confidence ≥ 7): Challenge directly, surface patterns, don't waste on surface work

Feature flag: `ENABLE_PHYSIO_MODE` env var. If missing/false, block skipped entirely.

### Step 1B: Gap 2 — Journey Arc

**File**: `supabase/functions/self-mastery-coach/index.ts`

Add to `buildServerContext()` — new parallel query group added to the existing `Promise.all` (currently 18 queries, add 4 more):

- Query A: `SELECT COUNT(*), MIN(started_at) FROM dialogue_sessions WHERE user_id = ?` → totalSessions, weeksSinceStart
- Query B: `SELECT dominant_pattern FROM coach_session_summaries WHERE user_id = ? AND created_at > now()-30d LIMIT 10` → most frequent = dominantThemeLast30Days
- Query C: `SELECT status FROM coach_accountability_tracker WHERE user_id = ? AND updated_at > now()-30d LIMIT 10` → lastCommitmentKept, consecutiveKeptCommitments
- Query D: `SELECT created_at FROM coach_breakthrough_moments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1` → lastBreakthroughDaysAgo

All wrapped in try/catch, null on failure. Derive growthEdgeProgress: <4=early, <12=developing, <24=integrating, ≥24=graduated.

Add to `CoachContext` interface (around line 1874). Inject `JOURNEY CONTEXT` block into prompt with register-shifting instructions per stage.

Feature flag: `ENABLE_JOURNEY_ARC`.

### Step 1C: Gap 5 — Practice History Awareness

**File**: `supabase/functions/self-mastery-coach/index.ts`

Extend `buildServerContext()` with one additional query in the parallel group:

```sql
SELECT content_id, AVG(star_rating) as avg_rating, COUNT(*) as times
FROM content_relevance_feedback
WHERE user_id = ? AND star_rating IS NOT NULL
GROUP BY content_id
```

Classify: avg_rating ≤ 2 → dismissedPractices[], avg_rating ≥ 4 → confirmedEffective[]. Add to `CoachContext`. Inject `PRACTICE AWARENESS` block into prompt only if lists non-empty.

Feature flag: `ENABLE_PRACTICE_HISTORY`.

---

## Phase 2 — Client + Edge Function

### Step 2: Gap 1 — Entry Context

**New file**: `src/types/coach.ts`
```typescript
export interface EntryContext {
  entryPoint: 'jit' | 'tod_plan' | 'check_in' | 'direct' | 'nudge' | 'insights' | 'practice_complete' | 'compass' | 'reset_studio'
  lastAction: string | null
  triggeredBy: string | null
}
```

**File**: `src/pages/SelfMasteryCoach.tsx`
- Extend `LocationState` to include `entryContext?: EntryContext`
- Read from `location.state`, default to `{ entryPoint: 'direct', lastAction: null, triggeredBy: null }`
- Pass to `useCoachConversation` via new setter or context param

**File**: `src/hooks/useCoachConversation.ts`
- Add `entryContext` state
- Include in first-message context object sent to edge function (only on first message, via `contextSentRef`)

**File**: `supabase/functions/self-mastery-coach/index.ts`
- Read `entryContext` from `clientContext`
- Add to `CoachContext` interface
- Update `buildFirstMessageInstruction()` to use entryContext as highest-priority opener signal:
  - `practice_complete` → "You just finished [practice] — what came up?"
  - `check_in` → "You just checked in as [state] — what's driving that?"
  - `nudge` → reference triggeredBy
  - All others → existing logic unchanged

**Navigation call sites** (~12 files — only add `entryContext` to state, nothing else changes):
- `DailyRitual.tsx` → `{ entryPoint: 'tod_plan', lastAction: 'started daily plan' }`
- `JustInTimeIntervention.tsx` / `JitCarousel.tsx` → `{ entryPoint: 'jit', lastAction: '...', triggeredBy: event title }`
- `GuidedPracticePlayer.tsx` / `MicroPracticePlayer.tsx` / `MicroPracticePlayerCards.tsx` / `SoundscapePlayer.tsx` → `{ entryPoint: 'practice_complete', lastAction: 'completed [practice name]' }`
- `CoachAccessButton.tsx` / `FloatingNavigation.tsx` → `{ entryPoint: 'direct' }`
- `PostEventReflection.tsx` → `{ entryPoint: 'check_in', lastAction: 'completed post-event reflection' }`
- `InnerWorldBubbles.tsx` / `PsychologicalDimensionBubbles.tsx` → `{ entryPoint: 'insights', lastAction: 'exploring [theme]' }`

Feature flag: `ENABLE_ENTRY_CONTEXT`. If off, coach opens with existing first-message logic.

---

## Phase 3 — Multi-Function + Migrations

### Step 3A: Database Migration (deploy first)

```sql
ALTER TABLE coach_session_summaries
  ADD COLUMN IF NOT EXISTS jit_relevant_insight text,
  ADD COLUMN IF NOT EXISTS next_session_focus text;

CREATE TABLE IF NOT EXISTS coach_surface_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  message text NOT NULL,
  trigger_condition text,
  expires_at timestamptz NOT NULL,
  dismissed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE coach_surface_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_surface_messages"
  ON coach_surface_messages FOR SELECT
  USING (user_id = (auth.jwt() ->> 'sub'::text));

CREATE POLICY "service_role_manage_surface_messages"
  ON coach_surface_messages FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE INDEX idx_coach_surface_user
  ON coach_surface_messages(user_id, dismissed, expires_at);
```

### Step 3B: Gap 3 — Expand generate-coach-summary

**File**: `supabase/functions/generate-coach-summary/index.ts`

Add to extraction prompt: `leanOnUpdate`, `watchForUpdate`, `jitRelevantInsight`, `nextSessionFocus`. Parse defensively — missing fields = null, never fail the whole extraction.

Write `jit_relevant_insight` and `next_session_focus` to `coach_session_summaries` (new columns from 3A).

Write `leanOnUpdate`/`watchForUpdate` to `user_coach_insights` table (already exists and is read by `compute-outer-readiness`) — insert as `strength`/`growth_area` type with source `'coach_session'`.

### Step 3C: Update generate-jit-events

**File**: `supabase/functions/generate-jit-events/index.ts`

Add query for latest `jit_relevant_insight` from `coach_session_summaries` (last 7 days). If found, append "Your coach noted: [insight]" to JIT context description.

### Step 3D: Update smart-nudges

**File**: `supabase/functions/smart-nudges/index.ts`

After existing nudge priority cascade, check for pending commitments that semantically match upcoming events (keyword matching). If match found and coach not opened in 24hrs, generate coach-accountability nudge.

Feature flag: `ENABLE_DOWNSTREAM_FEED`. Each sub-step also guarded.

---

## Phase 4 — New Feature, Isolated

### Step 4A: Gap 6 — Coach Homepage Voice

**File**: `supabase/functions/generate-coach-summary/index.ts`

After writing jit_relevant_insight, check for commitment + upcoming calendar match (query events next 24hrs). If match, generate 15-word surface message via LLM, insert into `coach_surface_messages` (max 1 per session, suppress if one exists for today).

### Step 4B: New component

**New file**: `src/components/coach/CoachSurfaceMessage.tsx`

Fetches active, non-expired, non-dismissed messages from `coach_surface_messages`. Renders as subtle italic line inside the Compass card (below context, above Lean On). Dismiss button marks `dismissed = true`. Renders nothing when empty.

### Step 4C: Mount in homepage

**File**: `src/components/home/StrategicIntentionCard.tsx`

Add `<CoachSurfaceMessage />` inside the Compass card, between context text and Lean On section. Only renders if message exists — zero visual impact when empty.

Feature flag: `ENABLE_COACH_SURFACE`.

---

## Feature Flags

All flags are Deno env vars read at runtime:
```
ENABLE_PHYSIO_MODE=true
ENABLE_JOURNEY_ARC=true
ENABLE_PRACTICE_HISTORY=true
ENABLE_ENTRY_CONTEXT=true
ENABLE_DOWNSTREAM_FEED=true
ENABLE_COACH_SURFACE=true
```

If flag missing or false: skip the block, coach runs on existing logic. No errors thrown.

---

## Files Changed Summary

| Phase | Files | Type |
|-------|-------|------|
| 1 | `self-mastery-coach/index.ts` | Edge function (3 gaps) |
| 2 | `src/types/coach.ts` (new), `SelfMasteryCoach.tsx`, `useCoachConversation.ts`, `self-mastery-coach/index.ts`, ~12 navigation files | Client + Edge |
| 3 | Migration, `generate-coach-summary/index.ts`, `generate-jit-events/index.ts`, `smart-nudges/index.ts` | Multi-function |
| 4 | `generate-coach-summary/index.ts`, `CoachSurfaceMessage.tsx` (new), `StrategicIntentionCard.tsx` | New feature |

---

## What Will NOT Be Touched

- Existing coach prompt structure or response mode logic
- Authentication or RLS policies beyond what's specified
- The `practiceEffectiveness` query (only extended)
- Onboarding, payments, or non-coach flows
- Wisdom registry content
- Existing database columns
- Navigation logic beyond adding entryContext

