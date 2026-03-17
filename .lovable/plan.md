

# Plan: Wire Event Context + Add First-Message Contextual Awareness

## Problem

The coach has rich upstream context (memories, patterns, HRV, calendar correlations, commitments, insights) but **none of it shapes the first message**. Additionally:

1. **`eventTitle` is never forwarded** — JitCarousel passes `eventTitle` via `locationState`, but `useCoachConversation` never includes it (or `jitContext`) in the context payload sent to the edge function. The `jitContext` field in `CoachContext` is always `undefined`.

2. **No first-message instruction** — The system prompt has context sections but no explicit instruction telling the coach to reference relevant context in its opening response (except for the narrow HRV × calendar opener). The coach treats the first user message like any other.

3. **No entry-point awareness** — The edge function receives `flowType` but doesn't know *how* the user arrived (JIT event, ToD plan, or independent). This limits proactive contextual openers.

## Fix Plan

### Fix 1: Forward event context from client to edge function

**`src/hooks/useCoachConversation.ts`**
- Accept `eventTitle` as a settable field (like `flowType`)
- On first message, include `jitContext: { trigger: 'jit', eventTitle, minutesUntil }` in the context payload when `eventTitle` is set

**`src/pages/SelfMasteryCoach.tsx`**
- Pass `locationState.eventTitle` to the hook via a new setter (similar to `setFlowType`)

### Fix 2: Add `entryPoint` field to request payload

**`src/hooks/useCoachConversation.ts`**
- Derive `entryPoint` from available signals: `'jit'` (fromIntervention + eventTitle), `'tod_plan'` (fromRitual), or `'independent'` (neither)
- Send as part of the request body alongside `flowType`

**`supabase/functions/self-mastery-coach/index.ts`**
- Parse `entryPoint` from request body
- Pass to `buildSystemPrompt`

### Fix 3: Add FIRST-MESSAGE CONTEXTUAL OPENER instruction to system prompt

**`supabase/functions/self-mastery-coach/index.ts`**

Add a new section to `buildSystemPrompt` that generates a **first-message instruction block** based on entry point and available context. This section is only appended when `messages.length === 1` (first user message).

The instruction tells the coach:

- **JIT entry**: Reference the specific event by name, any historical HRV/state correlations for that event type, and relevant memories from past similar situations. Make the user feel the coach already knows the stakes.

- **ToD plan entry**: Reference the user's current state (inner readiness score, check-in outcome), any pending commitments, last session summary, or named patterns. Show continuity.

- **Independent entry**: Use the most salient available signal (pending commitment due, unnamed pattern with 3+ observations, consecutive state pattern, recent breakthrough not acted on) as a natural opener. If nothing urgent, use the last session summary for continuity.

The key instruction: *"Your first response should demonstrate that you know this user. Reference ONE specific piece of context naturally — don't dump everything. Make them feel understood, not profiled."*

### Fix 4: Add `isFirstMessage` flag to edge function

**`supabase/functions/self-mastery-coach/index.ts`**
- Detect `messages.length === 1` (only the user's opening message)
- When true, append the first-message instruction block to the system prompt
- When false, skip it (the coach already has conversation momentum)

## Files to change

1. **`src/hooks/useCoachConversation.ts`** — Add `eventTitle` setter, derive `entryPoint`, include `jitContext` and `entryPoint` in request
2. **`src/pages/SelfMasteryCoach.tsx`** — Pass `eventTitle` and `fromRitual`/`fromIntervention` to hook
3. **`supabase/functions/self-mastery-coach/index.ts`** — Parse `entryPoint`, add first-message contextual opener instruction block to system prompt

## What this achieves

- JIT → coach: "I see you have 'Board Meeting' in 45 minutes. Last time, your HRV dropped to 34ms around similar events..."
- ToD → coach: "Welcome back. Last session you had a breakthrough about delegation. How did that land this week?"
- Independent → coach: "You committed to pausing before reacting 3 days ago. How's that going?"
- All entries: Coach demonstrates knowledge of the user from message one

