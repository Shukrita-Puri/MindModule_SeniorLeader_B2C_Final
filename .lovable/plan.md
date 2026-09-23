# Retire Claude everywhere — one cheap Gemini Flash writing model

Every AI writing/extraction call moves to `google/gemini-3.1-flash-lite` on the
Lovable AI Gateway (already the model used by the Plan why-lines and Smart
Nudges). Anthropic is removed as a provider. No prompts, wording rules,
validators, schemas, tables or screens change — only which model writes the text.

## Where Claude is used today

Already Gemini-only (no change): Smart Nudges copy, Plan why-lines, COS profile.

Still calling Anthropic:

| Function | Calls | What it writes |
|---|---|---|
| compute-outer-readiness | 1 | Brief copy fallback provider |
| self-mastery-coach | 2 | Coach chat (streaming) + tool call |
| insights-semantic-analysis | 3 | Insight text, observations, summary |
| generate-coach-summary | 2 | Session summary + surfacing line |
| generate-dashboard-insight | 1 | Dashboard trend line |
| generate-energy-insight | 1 | Energy insight line |
| generate-onboarding-insight / generate-debrief-insights / state-patterns-insights | via shared helper | Insight lines |
| extract-coach-insights, extract-tool-commitments, resolve-session-commitments, detect-recurring-patterns, detect-coach-scenarios, analyze-probing-effectiveness, infer-current-state, dialogue-session-manage, process-orphaned-sessions | 1 each | Structured extraction (JSON) |

## Approach

1. **Turn the shared Claude helper into a Gemini-backed shim.**
   `_shared/anthropic.ts` keeps its exported names and signatures
   (`callClaudeText`, `callClaude`, `callClaudeWithTools`, `callAIText`,
   `streamClaude`, `streamClaudeAsOpenAI`, `CLAUDE_MODELS`) but every one routes
   to `https://ai.gateway.lovable.dev/v1/chat/completions` with
   `google/gemini-3.1-flash-lite`, reusing the existing `callLovableAIText`
   request/error handling in that file. System prompts collapse to a `system`
   message; Anthropic tool blocks map to OpenAI-style function tools;
   `streamClaudeAsOpenAI` passes the gateway's OpenAI SSE through unchanged
   (it was already converting *to* that shape). Cache-control blocks are
   dropped — not applicable, and they only affected billing.
   This makes every call site above correct without touching it.

2. **Rewrite the raw `fetch('https://api.anthropic.com/v1/messages')` sites**
   (the 13 extraction/insight functions) to call the shim instead, keeping each
   prompt string, temperature, token cap, JSON-cleanup and parsing exactly as
   written. `frozenAwareFetch` stays in place as the wrapper so the LLM freeze
   switch keeps working.

3. **Remove the Anthropic key gates.** Any `if (!ANTHROPIC_API_KEY) throw` or
   `if (ANTHROPIC_API_KEY && …)` branch becomes the equivalent
   `LOVABLE_API_KEY` check, so a missing Anthropic secret can no longer
   suppress a feature (this is what silently disabled the Brief fallback while
   the Claude balance was empty). The two-provider fallback in `callAIText`
   collapses to a single provider; on failure callers keep their existing
   deterministic/static fallbacks.

4. **Model constant in one place.** `CLAUDE_MODELS.HAIKU` becomes an alias for
   the single Gemini model, with a `WRITING_MODEL` export and an optional env
   override, so a future model change is one line. The file gets renamed in
   comments only — no import paths change this run.

5. **`ANTHROPIC_API_KEY` stays configured but unused** so nothing 500s
   mid-deploy; removal can follow once all functions are live and verified.

## Not changing

Prompt text, copy contracts and forbidden-word rules, validators, pattern
eligibility gate, JIT, Insights, signal pills, readiness/MRS scoring, schema,
RLS, frontend, iOS/Android, notification timing, subscriptions.

## Verification

- `deno check` on every edited function; full backend test suite at its current
  baseline.
- Deploy in this order, confirming each live before the next: shared helper +
  `compute-outer-readiness` → `self-mastery-coach` →
  `insights-semantic-analysis`, `generate-coach-summary`,
  `generate-dashboard-insight`, `generate-energy-insight` → the extraction
  functions.
- Live checks: regenerate a Brief and confirm the AI fallback path now returns
  text instead of a credit error; run one coach session end to end (streaming
  reply + tool call + post-session commitment resolution); confirm one
  extraction function writes the same shaped rows as before.
- Confirm the logs no longer contain `api.anthropic.com` or "credit balance".
