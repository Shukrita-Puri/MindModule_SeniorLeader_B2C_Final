

# Plan: Fix Behavior Log Tracking for Coach Session Ends

## Problem

Two gaps in session-end tracking:

1. **`dialogue-session-manage` `end` action** — marks session completed but does NOT insert into `behavior_logs`. Only `process-orphaned-sessions` does. So user-initiated "End Session" clicks produce no behavior log.

2. **`dialogue-session-manage` `end` action** — does NOT fire downstream processing functions (insights, summaries, patterns, etc.). The client (`useCoachConversation.ts`) fires these client-side, but if the user drifts away (unmount cleanup calls `endSession`), the fire-and-forget fetches may be killed by the browser before completing. `process-orphaned-sessions` handles abandoned sessions but only runs every 10 minutes with a 5-min idle threshold.

## Fix

### File 1: `supabase/functions/dialogue-session-manage/index.ts`

In the `end` action (after session update at line 148):

1. **Fetch session metadata** — change the select at line 111 from `"user_id"` to `"user_id, context_type, coach_personality, meta_data"` so we have context for the behavior log.

2. **Insert behavior_log** — fire-and-forget insert with `behavior_type: 'coach_session'`, `event_title: 'coach'`, and `context_event_data` containing `sessionId`, `context_type`, `totalMessages`, `durationSeconds`.

3. **Fire downstream functions server-side** — after the session update, fire the same 7 downstream functions that `process-orphaned-sessions` fires (plus chained `extract-session-memories`), using the service role key. This ensures processing happens server-side regardless of whether the browser stays open. Add a guard: only fire if `totalMessages >= 2`.

This makes the `end` action self-sufficient — whether the user clicks "End Session" or the browser fires it on unmount via beacon/cleanup, the server handles all downstream work.

### File 2: `supabase/functions/process-orphaned-sessions/index.ts`

- Add `context_event_data` to the existing behavior_logs insert (line 105-113) with `sessionId`, `context_type: 'coach'`, `totalMessages: msgCount`, `source: 'orphan_cleanup'`.

### File 3: `src/hooks/useCoachConversation.ts` (optional cleanup)

- The client-side downstream calls (lines 491-597) become redundant once the server handles them. However, keeping them provides a "belt and suspenders" approach — the server-side `end` action will check for existing summaries before re-processing (same as `process-orphaned-sessions` does). No change strictly required, but we could add a comment noting the server now handles this.

## Changes Summary

| File | Change |
|------|--------|
| `supabase/functions/dialogue-session-manage/index.ts` | Expand session select to include `context_type`; add `behavior_logs` insert with `context_event_data`; fire 7 downstream functions + chained memories server-side when `totalMessages >= 2` |
| `supabase/functions/process-orphaned-sessions/index.ts` | Add `context_event_data` to existing `behavior_logs` insert |

