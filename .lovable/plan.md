# Two-Model Consolidation — validation result + load-shape question

## Answer first: no, the load-shape atomic rules should not be implemented now

`loadShape` is now correctly passed into the atomic validation context in `compute-outer-readiness` (verified at the `atomicCtx.signals.loadShape` assignment). But the shared validator it feeds contains no rule that reads it — there is no front-loaded / back-loaded / fragmented branch anywhere in `supabase/functions/_shared/brief-validators.ts`.

So the value arrives and is ignored. Making those rules actually fire is net-new validator logic — exactly the class of change the launch plan rules out ("no validator, copy contract, or Brief prompt version changes"). Adding rejection rules two days before launch can only increase Brief rejection rate, which is the stated red line. Recommendation: keep the hoist (it is harmless and removes the typecheck errors), defer the rules to post-launch.

## Validation of the seven surfaces

| Change | State |
|---|---|
| C1 — Claude constants | Done. `SONNET` alias removed, both helper defaults repointed to `HAIKU`, smoke test uses `HAIKU`, zero `CLAUDE_MODELS.SONNET` call sites remain. |
| C2 — Brief | Done, launch variant. `llmAttempts` is a single entry on `google/gemini-3.1-flash-lite` via the gateway; deterministic/awaiting fall-through untouched. Haiku + prompt caching is the agreed post-launch step. |
| C3 — Nudges | Done, launch variant. Single Gemini 3.1 Flash Lite attempt, then the static bank. The Claude leg in `tryAIProvider` is unreachable dead code kept for the post-launch flip. |
| C4 — Plan why-lines | Done. `_shared/plan/why-llm.ts` `MODEL = "google/gemini-3.1-flash-lite"`. |
| C4 — CoS Profile | Done. Both `AI_MODEL` and `AI_MODEL_FALLBACK` are Gemini 3.1 Flash Lite; the Claude 3.5 Haiku leg is gone. |
| C4 — Attendee resolver | Done. Gemini 3.1 Flash Lite, not frozen. |
| C4 — Onboarding insight | Was the one real gap: still ran a three-model Claude ladder straight against the Anthropic API. Now moved to the Lovable gateway helper on Gemini 3.1 Flash Lite, single attempt, 200-token cap and deterministic fallback preserved, 429/402 error path preserved. Typechecks clean. |
| C5 — Leadership patterns | Done. Anthropic observation call deleted, field returned as `null`. |
| C6 — Dormant freeze | Done. All twelve functions import the shared `llm-freeze` gate; default off returns each function's existing empty/null shape. |

## Remaining steps to close this out

1. Deploy `generate-onboarding-insight` (the only function changed by this validation pass).
2. Run one real onboarding-insight request and confirm a non-fallback insight comes back — the model-swap verification rule applies to this call as much as it did to the CoS tool call.
3. No other function is redeployed; nothing else changed.

## Deferred (post-launch, explicitly not now)

- Brief and Nudges move to Claude Haiku 4.5 with `cacheSystemPrompt: true`.
- Load-shape-keyed atomic validator rules (the question above).
- L2 prompt diet, L4 change-gating, token telemetry.
