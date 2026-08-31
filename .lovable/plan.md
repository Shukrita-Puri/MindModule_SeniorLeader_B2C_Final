# Two-Model LLM Consolidation — Launch-Safe Cost Reduction

## Safety note (we are 2 days from launch) — pre-launch constraints

This build is approved for execution with the following non-negotiable constraints. Any change that cannot be made within these constraints is stopped and reported back rather than worked around.

**Scope boundary.** Only the 7 surfaces listed in section 1 are in scope. No other function, route, schema, RLS policy, validator, copy contract, or frontend call site is touched for any reason — including opportunistic fixes noticed during implementation.

**One change at a time.** Deploy in the exact order given in section 4. C1 through C6 are not batched into a single deploy. Each change is verified working in production before the next begins. If any deploy produces an unexpected error or behaviour change, the sequence stops and is reported before continuing.

**Model swap verification is mandatory, not optional.** C2 (Brief), C3 (Nudges) and C4 (CoS Profile tool call) each require a real live request — not just a typecheck — before being marked done. A model that accepts the call in test can still reject the request body in production. This step is not skippable under time pressure.

**Brief quality is the red line.** `compute-outer-readiness` is the core product surface. If Brief output after C2 produces lower quality copy, more validator rejections, or any change in tone compared to pre-change output, C2 is rolled back immediately. No forward-fixing under launch time pressure — revert and ship the Brief unchanged.

**C6 freeze must degrade gracefully.** The env-gated flag on the dormant cluster must return each function's existing empty/null response shape exactly. If any frozen function turns out to have a non-degradable caller, it is left running and reported — the freeze is not forced at the risk of a silent frontend breakage at launch.

**Nothing from section 3 is implemented.** L2 prompt diet, L4 change-gating, and token telemetry are explicitly deferred. If a section 3 change appears to be required to make a section 2 change work correctly, the work stops and is reported — deferred work is not pulled into this build.

**Rollback is always the right call.** With 48 hours to launch, a rolled-back change that preserves current behaviour beats a forward-fix that introduces new uncertainty. The current $1.67/day spend is known and stable. A launch with that spend is better than a launch with a degraded Brief or broken CoS Profile.

---

Approved direction: **only two models across the whole app** — `google/gemini-3.1-flash-lite` and `claude-haiku-4-5`. No Sonnet, no Gemini Pro, no Gemini 2.5, no model ladders across providers. Excluded from this build (kept for post-launch): telemetry, L2 prompt diet, L4 change-gating.


| Surface | Today | Target | Fallback after one attempt |
|---|---|---|---|
| Brief (`compute-outer-readiness`) | Gemini 2.5 Flash → Claude (`SONNET` const) | **Claude Haiku 4.5**, single attempt, cached system prompt | Deterministic brief |
| Smart Nudges | Claude Haiku → Gemini 3 Flash Preview | **Claude Haiku 4.5**, single attempt, cached system prompt | Static copy bank |
| Plan why-lines | Gemini 3 Flash Preview | **Gemini 3.1 Flash Lite** | Deterministic repair line (existing) |
| CoS Profile | Gemini 2.5 **Pro** → Claude 3.5 Haiku | **Gemini 3.1 Flash Lite** | existing error path |
| Onboarding insight | Claude model ladder | **Gemini 3.1 Flash Lite** | existing null path |
| Attendee resolver | Gemini 2.5 Flash | **Gemini 3.1 Flash Lite** | existing null path |
| Leadership patterns | Claude 3.5 Haiku | **No LLM — call deleted** | n/a |

The two biggest single wins are dropping CoS Profile off Gemini 2.5 Pro (most expensive model in the stack, 8192-token cap) and removing the Brief's double-provider attempt.

## 2. Change list, in deploy order

Each change is independently deployable and verified before the next.

**C1 — Fix the Claude constants.** `_shared/anthropic.ts` currently defines `SONNET` and `HAIKU` both as `claude-haiku-4-5-20251001`, and every helper defaults to `params.model || CLAUDE_MODELS.SONNET`. Remove the `SONNET` alias entirely so no call site can request Sonnet, and repoint the helper defaults to `HAIKU`. This is what makes the Sonnet line disappear from the Anthropic bill for good rather than depending on each call site being correct. Update `_shared/anthropic-smoke.ts`, which currently smoke-tests `CLAUDE_MODELS.SONNET`.

**C2 — Brief: single Haiku attempt + prompt caching.** In `compute-outer-readiness/index.ts` the `llmAttempts` array (line ~8979) becomes a single entry: Claude Haiku, direct Anthropic, 10s timeout, `useGateway: false`. The existing loop is `for (attempt = 1; attempt <= llmAttempts.length; ...)` so it self-adjusts to one pass, and the corrective-retry prompt logic becomes dead weight on that path but stays in place untouched. On rejection or failure the existing deterministic/awaiting fall-through runs exactly as today. Caching is already supported: `callClaude` accepts `cacheSystemPrompt` and `buildSystemPayload` emits the `cache_control` marker — the Brief call site just has to pass it. The Brief system prompt from `_shared/brief/copy-vocabulary.ts` is byte-identical across every user and call, which is exactly the shape ephemeral caching bills at ~10%.

**C3 — Nudges: single Haiku attempt + prompt caching.** In `smart-nudges/index.ts`, drop the Gemini leg of the `provider: "claude" | "gemini"` generator so only the Claude Haiku path remains, and pass `cacheSystemPrompt: true` on that `callClaudeText` call. On any failure the existing static copy bank runs — it already re-validates static copy through the same V8 contract, so no new validation is needed. Additionally, flip the low-variance nudge types to static-first so the model is only called where phrasing genuinely varies; the exact type list is decided by reading the current static bank coverage, and any type without a safe static variant stays LLM-first.

**C4 — Gemini consolidation.** Point `_shared/plan/why-llm.ts`, `synthesize-cos-profile`, `generate-onboarding-insight`, and `resolve-attendee-relationship` at `google/gemini-3.1-flash-lite`. `generate-onboarding-insight` currently calls Anthropic directly through a model loop — it moves to the Lovable gateway helper used elsewhere, keeping its 200-token cap and its existing failure path. `synthesize-cos-profile` loses its `anthropic/claude-3-5-haiku` fallback leg (single attempt, existing error path). Its tool-call/`emit_cos_profile` schema is unchanged; because a model swap can change tool-call behaviour, this one gets an explicit live smoke run before it is called done.

**C5 — Delete the Leadership patterns LLM call.** Confirmed: `LeadershipPatternsCard.tsx` contains no reference to `observation`, and the card renders the distribution chart, archetype/state word, dimension deltas and friction trend — all from structured payload fields. The Anthropic call in `state-patterns-insights/index.ts` is deleted and the field is returned as `null` (kept in the response shape so nothing downstream breaks on a missing key). Zero cost, one fewer network hop on Insights load, no visible change.

**C6 — Freeze the dormant clusters.** `insights-semantic-analysis` plus the Coach/Dialogue cluster (`self-mastery-coach`, `dialogue-engine`, `dialogue-session-manage`, `generate-coach-summary`, `extract-coach-insights`, `extract-tool-commitments`, `resolve-session-commitments`, `detect-coach-scenarios`, `detect-recurring-patterns`, `analyze-probing-effectiveness`, `process-orphaned-sessions`).

The freeze is deliberately the least invasive form available before launch: a single shared env-gated flag (default off) checked at the top of each function's LLM call, returning the function's existing empty/null response when off. No function is deleted, no route removed, no frontend call site touched, no schema change. `Insights.tsx` already handles a null/empty semantic payload, so the theme map simply does not populate. Flipping the flag on restores every one of them with no code change when Coach goes live. If, while implementing, any one of these turns out to have a non-degradable caller, that function is left running rather than risking a launch regression, and it is reported back rather than forced.

`resolve-attendee-relationship` is **not** frozen — confirmed live in the Plan feature via `sync-calendar` batches (`_shared/attendeeResolverQueue.ts`) and the lazy resolver in `generate-mastery-plan`. It only changes model (C4).

## 3. Explicitly not in this build

- **L2 prompt diet** — the Brief user prompt is ~155 `userPrompt +=` appends against a 380-token output cap and is where the remaining input cost sits. Deferred to post-launch by your instruction; caching (C2) already discounts the stable half of it.
- **L4 change-gating / regeneration skipping** — deferred.
- **Token telemetry and the `_shared/ai/model-routing.ts` table** — deferred. Consequence to accept: after this ships, per-feature cost still has to be read from provider dashboards rather than from the app.

## 4. Verification and deploy

Per change: `tsgo` typecheck, then the existing Deno test suites for the touched area (Brief golden fixtures and persona tests for C2; nudge V8 contract tests for C3; `archetypeSourceLabelContract` for C4's CoS work), then the frontend vitest suite when a response shape is touched (C5).

Model-swap changes get one real request each before being marked done, per the rule that a swapped model can reject a body the previous model accepted — specifically C2 (Brief Haiku + cache header), C3 (nudge Haiku + cache header), and C4's CoS Profile tool call.

Deploys, one at a time, in order: `compute-outer-readiness` (C1 rides along, C2), `smart-nudges` (C3), `generate-mastery-plan` + `synthesize-cos-profile` + `generate-onboarding-insight` + `resolve-attendee-relationship` (C4), `state-patterns-insights` (C5), then the frozen cluster (C6).

No user-visible copy contract, validator, Brief prompt version, deterministic fallback path, MRS, Plan slot logic, signal pills, schema, or RLS changes anywhere in this plan.
