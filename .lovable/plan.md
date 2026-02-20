
# Fix Tiny Win Detection: Store Real Wins, Not Prompts

## Problem

The `self-mastery-coach` edge function stores the wrong content as tiny wins:

- **"Here's one thing I did right today"** is being stored as a win -- this is the coach's prompt, not a real win
- The detection logic (`detectTinyWin`) matches generic phrases like "did right" which catches the prompt text itself
- Only the single triggering message is stored -- follow-up messages that elaborate on the win are missed

Current DB evidence:
- 2 of 4 stored wins are just the prompt phrase "Here's one thing I did right today"
- Only 2 are genuine user reflections

## Solution

### Change 1: Smarter win extraction in `self-mastery-coach/index.ts`

**Problem:** The coach currently detects wins via regex on the latest user message, then stores that raw message. This catches prompt phrases.

**Fix:** Instead of storing the raw user message, use AI to extract the actual win content. The coach AI is already in the loop -- we add a tool call for `store_tiny_win` so the AI itself decides what qualifies as a win and extracts the core content.

Approach:
- Add a `store_tiny_win` function tool to the coach's AI call (similar to how `tiny-wins-insights` uses tool calling)
- The AI extracts the actual win statement from the conversation context, filtering out prompt echoes
- The AI can also consolidate multi-message wins (e.g., initial mention + follow-up elaboration)
- Remove the regex-based `detectTinyWin` + `storeTinyWin` post-hoc logic
- The AI tool call triggers the DB insert with the cleaned win content

This means the coach AI -- which understands conversation context -- decides:
1. Whether a real win was shared (not just a prompt echo)
2. What the actual win content is (consolidated from multiple messages if needed)

### Change 2: Add exclusion filter for prompt phrases

As a safety net, add a blocklist of known coach prompt phrases that should never be stored as wins:
- "Here's one thing I did right today"
- "What's one thing you did right today"
- Other generic prompt starters

### Change 3: Clean existing bad data

Delete the 2 bad records from `tiny_wins` where `win_content` is just the prompt text.

## Technical Details

### File: `supabase/functions/self-mastery-coach/index.ts`

1. Remove `WIN_PATTERNS`, `detectTinyWin()`, and `storeTinyWin()` functions (lines 513-557)
2. Remove the post-response win detection block (lines 572-585)
3. Add a `store_tiny_win` tool definition to the AI chat completion call:

```typescript
tools: [{
  type: "function",
  function: {
    name: "store_tiny_win",
    description: "Store a tiny win when the user shares a genuine personal achievement, accomplishment, or positive reflection. Do NOT call this for generic prompts, greetings, or the coach's own suggested phrases. Extract the core win statement.",
    parameters: {
      type: "object",
      properties: {
        win_content: {
          type: "string",
          description: "The actual win or achievement the user described, in their own words. Consolidate if spread across multiple messages."
        }
      },
      required: ["win_content"]
    }
  }
}]
```

4. After AI response, check for tool calls and execute `store_tiny_win` if present -- insert to DB via service role
5. Still return the AI's text response to the user as normal

### Data cleanup

Delete the 2 records where `win_content = 'Here''s one thing I did right today'` from `tiny_wins`.

## What This Achieves

- The AI understands conversational context, so it won't store prompt echoes
- Multi-message wins get consolidated into one meaningful statement
- The win content stored is the user's actual achievement, not filler text
- Fallback: if AI tool calling fails, no win is stored (safe default -- better than storing garbage)
