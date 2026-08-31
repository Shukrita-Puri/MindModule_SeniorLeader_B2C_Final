# LLM Token Cost Optimisation — Audit & Recommendation

Goal: bring per-active-user-per-day LLM spend down from ~$1.67 without losing quality on the surfaces that carry the product (Brief, Coach). Recommendation only — nothing is implemented until you approve a follow-up build.

## What the audit found

There are 26 edge functions calling an LLM. Claude runs on your own Anthropic key (every model constant, including `CLAUDE_MODELS.SONNET`, already points at Haiku 4.5). Gemini runs through the Lovable AI gateway.

Three structural cost problems, in order of impact:

1. **No token telemetry anywhere.** `_shared/anthropic.ts` reads the `usage` object off the response and throws it away. Nothing is persisted. Today nobody can say which feature owns the $1.67, so every cut is a guess.
2. **Enormous input prompts on the highest-frequency surface.** The Brief user prompt in `compute-outer-readiness` is assembled from 155 separate `userPrompt +=` appends across ~8 buckets, plus a system prompt from `copy-vocabulary.ts` (42 KB source) plus a leader-voice block. Output is capped at 380 tokens. So the Brief is ~95% input cost, and it runs up to 3 windows/day/user plus manual refreshes, plus a Claude retry on validator rejection.
3. **Prompt caching is effectively unused.** Only one `cache_control` marker exists in the whole codebase. The Brief system prompt, the Coach persona/Vault prompt and the nudge system prompt are large, byte-stable across users, and re-billed at full input price on every single call.

Secondary drivers: `smart-nudges` runs `generateNudgeCopy` at up to 8 call sites per user per day, each with a Claude attempt then a Gemini attempt; `synthesize-cos-profile` allows 8192 output tokens; the coach and dialogue paths resend full conversation history each turn.

## Priority map — where to keep quality, where to be aggressive

**Keep quality (optimise cost without touching model tier or reasoning depth)**
- Brief (`compute-outer-readiness`)
- Self-Mastery Coach (`self-mastery-coach`, `dialogue-engine`)
- Mastery Plan why-lines (`_shared/plan/why-llm.ts`)

**Be aggressive (cheapest viable model, tight caps, or drop the LLM entirely)**
- Smart Nudges copy
- All extraction/classification jobs: `extract-coach-insights`, `extract-tool-commitments`, `resolve-session-commitments`, `detect-recurring-patterns`, `detect-coach-scenarios`, `infer-current-state`, `resolve-attendee-relationship`, `analyze-probing-effectiveness`
- All insight generators: `generate-dashboard-insight`, `generate-energy-insight`, `generate-onboarding-insight`, `generate-debrief-insights`, `insights-semantic-analysis`, `state-patterns-insights`, `synthesize-cos-profile`

## Recommended workstreams

### W1 — Measure (prerequisite, ~1 day)
Persist `input_tokens` / `output_tokens` / `cache_read_input_tokens` / model / function / user from every call, in the two shared helpers only (`_shared/anthropic.ts` and the Lovable gateway helper), so no feature code changes. Add a small admin view: cost per feature per day, cost per user per day. Everything below then gets validated against real numbers instead of estimates.

### W2 — Prompt caching on the big stable prompts (largest single saving, quality-neutral)
Anthropic ephemeral caching bills cached input at ~10% of normal. Apply to the Brief system prompt, the Coach system prompt and the nudge system prompt, and reorder each prompt so the stable block is first and the per-user block last. Expected 40–60% cut on the Brief and Coach input bill with zero output change.

### W3 — Brief input diet (quality-neutral)
- Cut buckets the validator and copy contract never consume, and stop sending signals that are already summarised elsewhere in the same prompt.
- Send compact key:value lines rather than prose narration of each signal.
- Cap Bucket 3 (patterns/history) to the top N ranked entries rather than the full ledger.
- Skip the Claude retry when the validator rejection is deterministic-repairable — that is a second full-price call for a fault we can fix locally.
- Suppress regeneration when no input signal changed since the last snapshot for the window (cache-hit brief).

### W4 — Nudges: static-first, LLM-last
Today AI copy is attempted first and static copy is the fallback. Invert for the low-variance nudge types: use the deterministic copy bank by default and call the model only for the one or two nudge types where phrasing genuinely varies. Also drop the Claude-then-Gemini double attempt to a single Gemini Flash Lite attempt with static fallback. Expected 70–85% cut on the nudge line.

### W5 — Batch and downgrade the background jobs
- Move every extraction/classification job to `google/gemini-3.1-flash-lite`, the cheapest viable tier for structured extraction.
- Batch: several of these jobs run per session/day per user on overlapping data. Merge the coach post-session jobs (insights, commitments, commitment resolution, scenario detection) into one call with one structured-output schema instead of four calls each resending the same transcript.
- Tighten `max_tokens` to the real output size (`synthesize-cos-profile` at 8192 is far above what it writes).
- Gate on change: skip the job when the underlying data has not changed since the last run.

### W6 — Conversation trimming (Coach/Dialogue)
Rolling window plus a cached running summary rather than resending the full transcript each turn. Quality-neutral for the tested session lengths, and it removes the quadratic input growth that makes long sessions expensive.

## Expected outcome

W2 + W3 + W4 alone should take the Brief and Nudge lines — which you identified as the bulk of the $1.67 — down by roughly 60–75%, with no model downgrade on Brief or Coach. W5 handles the long tail. Firm numbers only after W1 is live.

## Technical notes

- Nothing here changes any user-visible copy contract, validator, prompt version, or the deterministic fallback path.
- Caching changes are confined to the shared helpers plus prompt block ordering.
- Each workstream is separately deployable; Brief changes deploy only `compute-outer-readiness`.
- Suggested order: W1 → W2 → W4 → W3 → W5 → W6.
