# Switch writing to Gemini Flash (Claude kept, switchable) + coach AI off

Two reversible changes. No prompt, wording rule, validator, schema, table or
screen changes.

## Findings on the four borderline functions

| Function | Who calls it | What it writes | Who reads that | Verdict |
|---|---|---|---|---|
| extract-tool-commitments | dialogue-session-manage, process-orphaned-sessions (coach only) | `coach_tools_offered` | generate-jit-events reads existing rows | Coach-only → disable |
| resolve-session-commitments | dialogue-session-manage, process-orphaned-sessions (coach only) | `coach_accountability_tracker` | smart-nudges, Plan, Brief read existing rows | Coach-only → disable |
| detect-recurring-patterns | dialogue-session-manage, process-orphaned-sessions (coach only) | `coach_pattern_observations` | smart-nudges, Brief read existing rows | Coach-only → disable |
| infer-current-state | only the `INFER_CURRENT_STATE` action in daily-checkins, which nothing in the app or backend calls | `inferred_states` | nothing reads it | Not coach-only but unused → Part 2 (Gemini), not disabled |

Note on the three coach tables: live features (Smart Nudges, Plan, Brief,
JIT events) read rows from them but never write them. Turning the writers off
means no *new* coach rows; existing rows keep being read exactly as today, and
none of those readers requires fresh rows. The pattern eligibility gate,
readiness/MRS scoring and signal pills do not touch these tables at all.

## Pre-build confirmations

**1. Streaming / tool-calling use.** `streamClaude`, `streamClaudeAsOpenAI` and
`callClaudeWithTools` appear outside the shared helper in exactly one place —
`self-mastery-coach` (`callClaudeWithTools` at :3145, `streamClaudeAsOpenAI` at
:3271), a coach function disabled in Part 1. No Part 2 function imports or calls
any of the three, so leaving them Anthropic-only is safe.

**2. Coach table rows** (all real users; no test accounts present).

- `coach_accountability_tracker`: **0 rows** — nothing pending anywhere.
- `coach_tools_offered`: 14 rows, 4 users (joydeepcha75 6, itsmanojkdev 4,
  shukrita 2, nanda.nitasha 2), all `status: pending`, but every `expires_at`
  falls in early April 2026 — long expired.
- `coach_pattern_observations`: 25 rows, 6 users (jamie 9, shukrita 6, udipta 3,
  nanda.nitasha 3, joydeepcha 2, ksuhag 2), all `is_active: true`, last observed
  late March / early April 2026.

Where those open rows could surface, as the code stands today:
- Smart Nudges reads active pattern observations with **no recency filter**, so
  the April rows are already citable — unchanged by this work.
- The Brief requires `last_observed_at` within 7 days, so none qualify.
- JIT events reads pending `coach_tools_offered` with **no expiry filter**, so
  the expired rows are already reachable — also unchanged.
- Plan reads pending commitments only, and that table is empty.

Disabling the writers changes none of this: no new rows appear, and every
existing row keeps being read exactly as today.


## Part 1 — Coach features make no model calls (deployed first)

- New env var `COACH_AI_ENABLED`, default `"false"`.
- At the very top of each coach function — before any provider call and before
  any write — return `200 { skipped: "coach_disabled" }` when the flag isn't
  `"true"`: `self-mastery-coach`, `generate-coach-summary`,
  `extract-coach-insights`, `detect-coach-scenarios`,
  `analyze-probing-effectiveness`, `dialogue-session-manage`,
  `process-orphaned-sessions`, `extract-tool-commitments`,
  `resolve-session-commitments`, `detect-recurring-patterns`.
- Existing code stays intact behind the flag; these functions are **not**
  migrated to Gemini this run.
- Scheduled trigger: the `process-orphaned-sessions` cron runs every 10 minutes.
  The flag makes it a no-op and the job is also unscheduled. No other coach
  function is on a schedule or a database trigger.
  **When the coach is re-enabled, the `process-orphaned-sessions` cron must be
  rescheduled** (every 10 minutes, same URL and cron-secret header).
- Frontend untouched; a call reaching a coach function returns a clean 200,
  never a visible error.

## Part 2 — Writing routes to Gemini Flash by default, Anthropic kept

`_shared/anthropic.ts` becomes provider-switchable:

- `WRITING_PROVIDER`: `"gemini"` (default) | `"anthropic"`.
- Per-function override, checked first: `WRITING_PROVIDER_<FUNCTION_NAME>`
  (upper snake case, e.g. `WRITING_PROVIDER_GENERATE_ENERGY_INSIGHT`), falling
  back to `WRITING_PROVIDER`. Callers pass their function name into the helper;
  this is what the rollback test uses, since env vars are project-wide.
- `WRITING_MODEL`: default `google/gemini-3.1-flash-lite`.
- Every existing export keeps its current Anthropic implementation. A Gemini
  branch is added **only to the text paths**: `callClaudeText`, `callClaude`
  without tools, and `callAIText`. The Gemini branch returns the same shapes
  callers read today — `content[0].text` and `stop_reason` mapped from
  `finish_reason` (`stop`→`end_turn`, `length`→`max_tokens`).
- Message conversion: system prompt → `system` message; `cache_control`
  dropped; a trailing assistant prefill (e.g. `"{"`) folded into the prompt
  instead of sent as a message.
- `streamClaude`, `streamClaudeAsOpenAI` and `callClaudeWithTools` get **no**
  Gemini branch this run — nothing live uses them while the coach is off. In
  Gemini mode they throw a clear "not supported in Gemini mode yet" error.
- Key gates test the **active** provider only (`LOVABLE_API_KEY` in Gemini mode,
  `ANTHROPIC_API_KEY` in Anthropic mode), so an empty Claude balance can no
  longer silently disable a feature. On failure, callers keep their existing
  deterministic/static fallbacks.

### Raw Anthropic fetch sites routed through the helper

Keeping each prompt, temperature, token cap, JSON cleanup and parsing exactly as
written, with `frozenAwareFetch` still wrapping the call:
`compute-outer-readiness` (Brief fallback), `insights-semantic-analysis`,
`generate-dashboard-insight`, `generate-energy-insight`,
`generate-onboarding-insight`, `generate-debrief-insights`,
`state-patterns-insights`, `infer-current-state`.

`ANTHROPIC_API_KEY` stays configured. No Anthropic code is deleted.

## Not changing

Prompt text, copy contracts and forbidden-word rules, validators, pattern
eligibility gate, JIT selection/timing, Insights, signal pills, readiness/MRS
scoring, schema, RLS, frontend, iOS/Android, notification timing, subscriptions.

## Verification

- `deno check` on every edited function; backend test suite at its current
  baseline.
- Deploy order (shared code only takes effect on redeploy), confirming each live
  before the next: **coach functions with the flag off** →
  `compute-outer-readiness` → the insight writers → `infer-current-state`.
- Coach: invoke each one once with the flag off and confirm the no-op response,
  nothing written, and zero calls to `api.anthropic.com` or
  `ai.gateway.lovable.dev` in its logs; confirm no scheduled job triggers them.
- Writing: regenerate a Brief and confirm the AI fallback path returns text
  instead of a credit error; run past inputs through each live insight function
  and confirm the same JSON fields.
- Confirm logs show no `api.anthropic.com` calls while `WRITING_PROVIDER=gemini`.
- Rollback test: set `WRITING_PROVIDER_<FUNCTION_NAME>=anthropic` for one insight
  function, confirm it still works, then remove it.
