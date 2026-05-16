---
name: Smart Nudges LLM prompt snapshot (pre-refactor ground truth)
description: Verbatim capture of nudge system prompt + per-nudge user prompts in smart-nudges/index.ts as of the shared-modules refactor. Rollback reference for Phase 3a.
type: reference
---
# Smart Nudges LLM prompt snapshot — pre Phase 3a refactor

Source: `supabase/functions/smart-nudges/index.ts`:
- `FORBIDDEN_WORDS_V6` constant at ~line 1071
- `systemPrompt` constant at ~line 1225 ("You are the Chief of Staff for the Mind of a C-suite leader…")
- Per-nudge `userPrompt` blocks at ~lines 1325 / 1346 / 1363 / 1378 / 1393 / 1412 / 1441 (morning, JIT first-touch, mid-day JIT, mid-day plan-remaining, recalibration, reserves-down lure, evening)
- `tryAIProvider('claude', …)` at ~line 1474 with Haiku 3.5 fallback to Gemini

## What changes in Phase 3a

Additive only:
1. Replace inline `FORBIDDEN_WORDS_V6` array with `import { forbiddenWords } from '../_shared/copy-vocabulary.ts'`. Behaviour unchanged — same words.
2. Call `evaluate(ctx)` from `_shared/behaviour-evaluator.ts` once per nudge build.
3. When a high-severity `BehaviourFlag` exists for the nudge's JIT anchor event, pass `copyHint` + `anchorEvent` + `stake` into the existing `userPrompt` as a `=== BEHAVIOUR ===` block at the end. The systemPrompt is unchanged.
4. V8 CTA verbs (`CTA_PHRASES`) stay as a separate export in `_shared/copy-vocabulary.ts` under `ctaVerbs` — do NOT couple them to the forbidden list.

No changes to: slot model, comparator, scheduling, DND/quiet-hours, JIT silence, V8 copy contract validators (`violatesCopyContractV8`, `violatesMeaningSentence`, `requiresNamedContextToken`, `nudgeTtlSeconds`, `nudgeCollapseId`), `architecture` telemetry stamp.

## Rollback procedure

Phase 3a changes are additive — the only structural change is the forbidden-words import. To rollback: revert the import line to the original inline array. Behaviour flag reads can be left in place returning empty arrays harmlessly.

## Verbatim capture

Full prompt text preserved in git at the pre-Phase-3a commit. This file documents the migration, not the original text.