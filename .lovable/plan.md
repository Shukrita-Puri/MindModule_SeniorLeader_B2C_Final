

# Switching from Lovable AI (Gemini) to Anthropic Claude

## Current State

Your project has **21 edge functions** making LLM calls via the Lovable AI Gateway (`ai.gateway.lovable.dev`), all using OpenAI-compatible format. Here's the full list:

| Edge Function | Use Case | Current Model |
|---|---|---|
| `self-mastery-coach` | Coach conversation (streaming) | gemini-3-flash-preview |
| `dialogue-engine` | Dialogue Room simulation | gemini-2.5-flash |
| `compute-outer-readiness` | Performance Readiness Brief | gemini-2.5-flash |
| `generate-mastery-plan` | Today's 3 Priorities context | gemini-2.5-flash |
| `smart-nudges` | Push notification copy | gemini-2.5-flash |
| `generate-coach-summary` | Post-session summary | gemini-2.5-flash |
| `extract-coach-insights` | Insight extraction | gemini-2.5-flash |
| `detect-recurring-patterns` | Pattern detection | gemini-2.5-flash |
| `detect-coach-scenarios` | Scenario detection | gemini-2.5-flash |
| `resolve-session-commitments` | Commitment tracking | gemini-2.5-flash |
| `extract-tool-commitments` | Tool offer extraction | gemini-2.5-flash |
| `analyze-probing-effectiveness` | Probing analysis | gemini-2.5-flash |
| `state-patterns-insights` | Leadership patterns AI | gemini-2.5-flash-lite |
| `insights-semantic-analysis` | Inner World Map | gemini-2.5-flash |
| `generate-debrief-insights` | Debrief feedback | gemini-2.5-flash |
| `generate-dashboard-insight` | Dashboard trend text | gemini-2.5-flash |
| `generate-energy-insight` | Energy insight | gemini-2.5-flash |
| `generate-onboarding-insight` | Onboarding insight | gemini-3-flash-preview |
| `infer-current-state` | State prediction | gemini-2.5-flash |
| `tiny-wins-insights` | Win analysis | gemini-2.5-flash |
| `dialogue-session-manage` | Tiny wins at session end | gemini-2.5-flash |
| `process-orphaned-sessions` | Orphaned session wins | gemini-2.5-flash |

## What Needs to Change

### 1. API Format Differences

Lovable AI Gateway uses **OpenAI-compatible** format. Anthropic uses a **different API format**:

```text
CURRENT (OpenAI-compatible):
  URL: https://ai.gateway.lovable.dev/v1/chat/completions
  Auth: Authorization: Bearer $LOVABLE_API_KEY
  Body: { model, messages: [{role, content}], stream, max_tokens, temperature }
  Response: { choices: [{ message: { content } }] }
  Streaming: data: { choices: [{ delta: { content } }] }

CLAUDE (Anthropic native):
  URL: https://api.anthropic.com/v1/messages
  Auth: x-api-key: $ANTHROPIC_API_KEY
  Headers: anthropic-version: 2023-06-01
  Body: { model, system (string), messages: [{role, content}], stream, max_tokens }
  Response: { content: [{ text }] }
  Streaming: event: content_block_delta / data: { delta: { text } }
```

Key differences:
- **System prompt** is a top-level `system` field, not a message with `role: "system"`
- **`max_tokens` is required** (not optional)
- **Response shape** is `content[0].text` not `choices[0].message.content`
- **Streaming events** use `content_block_delta` with `delta.text` not `delta.content`
- **Tool calling** format differs slightly

### 2. Step-by-Step Migration

**Step 1 — Get your Anthropic API key**
- Go to https://console.anthropic.com/
- Create an account or sign in
- Navigate to API Keys and create a new key
- Copy the key (starts with `sk-ant-...`)

**Step 2 — Store the key as a secret**
- I'll use the `add_secret` tool to prompt you to paste your `ANTHROPIC_API_KEY`
- This makes it available to all edge functions

**Step 3 — Create a shared helper module**
- Create `supabase/functions/_shared/anthropic.ts` with a reusable `callClaude()` function
- This centralizes the API format so each function just imports it
- Handles both streaming and non-streaming
- Maps the system prompt extraction automatically

**Step 4 — Update each edge function**
- Replace `fetch('https://ai.gateway.lovable.dev/...')` calls with the shared helper
- Extract `system` messages from the `messages` array
- Map response parsing from `choices[0].message.content` to `content[0].text`
- For streaming functions (`self-mastery-coach`), update SSE parsing

**Step 5 — Choose Claude models**
Recommended mapping:

| Current Model | Claude Equivalent | Use For |
|---|---|---|
| gemini-3-flash-preview | claude-sonnet-4-20250514 | Coach (streaming), Dialogue |
| gemini-2.5-flash | claude-sonnet-4-20250514 | Most functions |
| gemini-2.5-flash-lite | claude-haiku-3-5-20241022 | Lightweight tasks (patterns, wins) |

### 3. Risk Assessment

- **Cost**: Claude pricing differs from Lovable AI. You'll pay Anthropic directly instead of through Lovable credits.
- **Rate limits**: Anthropic has separate rate limits per tier. New accounts start at Tier 1.
- **Streaming format**: The coach and dialogue engine use SSE streaming — this parsing must change.
- **Tool calling**: `analyze-probing-effectiveness` and `process-orphaned-sessions` use function/tool calling — Anthropic's tool format is slightly different.
- **Rollback**: Keep `LOVABLE_API_KEY` configured as fallback.

### 4. Implementation Order

I recommend migrating in phases to reduce risk:

**Phase 1** (low risk, high visibility):
- `compute-outer-readiness` — Readiness Brief
- `generate-mastery-plan` — Today's 3 context
- `smart-nudges` — Notification copy

**Phase 2** (coach — streaming):
- `self-mastery-coach` — Main coach
- `dialogue-engine` — Dialogue Room

**Phase 3** (post-session analytics — background):
- All remaining functions

## Decision Point

Before I proceed, I need your Anthropic API key. Once you confirm you have one, I'll prompt you to store it as a secret, then begin the migration starting with the shared helper and Phase 1 functions.

