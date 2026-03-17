

# Fix Plan: Coach Session Lifecycle — Handle Abandoned Conversations

## Problem Summary

The current system has a fundamental design flaw: it treats "End session" button click as the **only** trigger for downstream processing (summaries, insights, memories, patterns, commitments, scenarios, probing analysis). In reality, users almost always abandon conversations by navigating away. The existing unmount cleanup (line 104-108 of SelfMasteryCoach.tsx) calls `endSession()`, but this has critical issues:

1. **`endSession()` requires `msgCount >= 2`** (line 399) — if React state is cleared before the ref syncs, it skips processing
2. **Fire-and-forget `fetch()` calls die on unmount** — the browser cancels pending requests when the component unmounts and the page navigates away
3. **`generate-coach-summary` requires `messages.length >= 3`** (line 45 of generate-coach-summary) — a 1-exchange conversation (1 user + 1 assistant = 2 messages in DB) is silently skipped
4. **No "End session" button is clearly visible** — users don't know they should end sessions

## Current Memory Retrieval Flow

The memory pipeline is:
1. `endSession()` fires → calls `generate-coach-summary` (AI summarizes transcript)
2. After summary completes → chains to `extract-session-memories` (creates discrete memory entries from summary)
3. Next session → `self-mastery-coach` reads from `coach_memory_index` with recency-decay ranking (top 20 fetched, scored by importance × recency × access count × pattern match, top 5 injected into context)

**This pipeline is entirely dependent on `endSession()` completing successfully**, which it rarely does.

## Design Principle Change

**Abandoned = completed.** Any session with ≥1 user exchange should be processed. The trigger should move from client-side fire-and-forget to a **server-side cleanup mechanism** that catches what the client misses.

## Fix Plan

### Fix 1: Move downstream processing to a server-side edge function

Create a new edge function `process-orphaned-sessions` that:
- Queries `dialogue_sessions` for sessions that are `active`, have `ended_at IS NULL`, and were last active > 5 minutes ago (based on the latest message timestamp in `dialogue_messages`)
- For each orphaned session with ≥2 messages in `dialogue_messages`:
  - Updates session to `completed` with `ended_at = now()`
  - Fires all 8 downstream functions (insights, probing, summary→memories, patterns, scenarios, commitments, tool-commitments, resolution)
- This runs on a cron schedule (every 10 minutes) via `supabase/config.toml`

This is the **critical architectural fix** — it makes the system resilient to client-side abandonment regardless of entry point (ToD plan, JIT plan, direct coach access).

### Fix 2: Lower message thresholds for downstream functions

- `useCoachConversation.ts` line 399: Change `msgCount < 2` to `msgCount < 1` — even a single exchange has value
- `generate-coach-summary` line 45: Change `messages.length < 3` to `messages.length < 2` — a 1-exchange session (user + assistant) should still get a brief summary
- Keep `extract-session-memories` as-is (it depends on summary existing, which is fine)

### Fix 3: Make client-side `endSession` more resilient on unmount

In `useCoachConversation.ts`:
- Use `navigator.sendBeacon()` instead of `fetch()` for the session-end call on unmount — `sendBeacon` survives page unload
- Keep the fire-and-forget downstream calls as a best-effort optimization (server cron is the safety net)

### Fix 4: Add visible "End session" affordance

In `CoachSplitView.tsx`, the "End session" button exists but is tiny `text-xs` text below the input bar. Make it slightly more discoverable without being intrusive — increase to `text-sm` and add a subtle separator/divider above it.

### Files to change:

1. **`supabase/functions/process-orphaned-sessions/index.ts`** — NEW: Server-side cron function to catch abandoned sessions
2. **`supabase/config.toml`** — Add cron schedule for process-orphaned-sessions
3. **`src/hooks/useCoachConversation.ts`** — Use `sendBeacon` for unmount cleanup, lower threshold from `< 2` to `< 1`
4. **`supabase/functions/generate-coach-summary/index.ts`** — Lower minimum messages from `< 3` to `< 2`
5. **`src/components/coach/CoachSplitView.tsx`** — Make "End session" slightly more visible

### What this fixes:

- **ToD plan abandonment**: Cron catches sessions regardless of entry context
- **JIT plan abandonment**: Same — server-side cleanup is context-agnostic
- **Direct coach access abandonment**: Same
- **1-exchange sessions**: Now processed instead of silently dropped
- **Memory pipeline**: Will finally populate `coach_memory_index`, `coach_session_summaries`, `coach_pattern_observations`, etc.

