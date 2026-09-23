# Switch writing to Gemini Flash (Claude kept, switchable) + coach AI off

Two independent changes, both reversible by an env var, with no prompt, wording
rule, validator, schema, table or screen changes.

## Part 1 — Coach features make no model calls at all

The coach isn't live, so its functions must not call any provider.

- New env var `COACH_AI_ENABLED`, default `"false"`.
- At the very top of each coach function — before any provider call and before
  any write — return `200 { skipped: "coach_disabled" }` when the flag isn't
  `"true"`: `self-mastery-coach`, `generate-coach-summary`,
  `extract-coach-insights`, `detect-coach-scenarios`,
  `analyze-probing-effectiveness`, `dialogue-session-manage`,
  `process-orphaned-sessions`, `extract-tool-commitments`,
  `resolve-session-commitments`, `detect-recurring-patterns`,
  `infer-current-state`.
- Existing code stays intact behind the flag; these functions are **not**
  migrated to Gemini in this run.
- Scheduled trigger found: the `process-orphaned-sessions` cron job runs every
  10 minutes. The flag makes it a cheap no-op; the job is also unscheduled so
  nothing is invoked automatically. No other coach function is on a schedule or
  a database trigger. `dialogue-session-manage` is invoked from app code only.
- Frontend untouched; a call that reaches a coach function returns a clean 200,
  never a visible error.

## Part 2 — Writing routes to Gemini Flash by default, Anthropic kept

`_shared/anthropic.ts` becomes provider-switchable:

- `WRITING_PROVIDER`: `"gemini"` (default) | `"anthropic"`.
- `WRITING_MODEL`: default `google/gemini-3.1-flash-lite`.
- Every existing export keeps its current Anthropic implementation
  (`callClaudeText`, `callClaude`, `callClaudeWithTools`, `callAIText`,
  `streamClaude`, `streamClaudeAsOpenAI`, `CLAUDE_MODELS`) and gains a Gemini
  branch selected by the env var.
- The Gemini branch returns the **same shapes callers already read**:
  `content[0].text`, `tool_use` blocks, and `stop_reason` mapped from
  `finish_reason` (`stop`→`end_turn`, `tool_calls`→`tool_use`,
  `length`→`max_tokens`).
- Message conversion: system prompt → `system` message; `tool_use` /
  `tool_result` blocks → `tool_calls` plus `role: "tool"` messages with matching
  ids; `cache_control` dropped; a trailing assistant prefill (e.g. `"{"`) is
  folded into the prompt instead of sent as a message.
- Streaming: in Gemini mode the SSE the client receives keeps today's shape —
  text deltas, tool-call deltas, `[DONE]`.
- Key gates test the **active** provider only (`LOVABLE_API_KEY` in Gemini mode,
  `ANTHROPIC_API_KEY` in Anthropic mode), so an empty Claude balance can no
  longer silently disable a feature. On failure, callers keep their existing
  deterministic/static fallbacks.

### Raw Anthropic fetch sites

The functions that call `https://api.anthropic.com/v1/messages` directly and are
**not** coach-only route through the shared helper so they obey
`WRITING_PROVIDER`, keeping each prompt, temperature, token cap, JSON cleanup and
parsing exactly as written, with `frozenAwareFetch` still wrapping the call:
`compute-outer-readiness` (Brief fallback), `insights-semantic-analysis`,
`generate-coach-summary`-adjacent insight writers
(`generate-dashboard-insight`, `generate-energy-insight`,
`generate-onboarding-insight`, `generate-debrief-insights`,
`state-patterns-insights`). Coach-only functions are left as they are, disabled
by Part 1.

`ANTHROPIC_API_KEY` stays configured. No Anthropic code is deleted.

## Not changing

Prompt text, copy contracts and forbidden-word rules, validators, pattern
eligibility gate, JIT, Insights, signal pills, readiness/MRS scoring, schema,
RLS, frontend, iOS/Android, notification timing, subscriptions.

## Verification

- `deno check` on every edited function; backend test suite at its current
  baseline.
- Redeploy in order (shared code only takes effect on redeploy), confirming each
  live before the next: `compute-outer-readiness` → the insight writers → the
  coach functions (flag off).
- Coach: invoke each one once with the flag off and confirm the no-op response,
  nothing written, and zero calls to `api.anthropic.com` or
  `ai.gateway.lovable.dev` in its logs; confirm no scheduled job triggers them.
- Writing: regenerate a Brief and confirm the AI fallback path returns text
  instead of a credit error; run past inputs through each live insight function
  and confirm the same JSON fields.
- Confirm logs show no `api.anthropic.com` calls while `WRITING_PROVIDER=gemini`.
- Test rollback once: set `WRITING_PROVIDER=anthropic` on one function, confirm
  it still works, set it back.
