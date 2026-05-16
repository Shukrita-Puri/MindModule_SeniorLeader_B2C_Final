---
name: Mastery Plan Why-line snapshot (pre-refactor ground truth)
description: Pre-Phase-3b capture of composeWhyLine + STEP_RATIONALE_MAP in generate-mastery-plan/index.ts. The Plan is deterministic, not LLM-driven, so this snapshot is about deterministic composition not prompts.
type: reference
---
# Mastery Plan deterministic composition snapshot — pre Phase 3b refactor

Source: `supabase/functions/generate-mastery-plan/index.ts`:
- `composeWhyLine(hm, req, shared, hrvCorrelations, ceo, briefClaim, fusionEventTitle)` at ~line 3324
- `STEP_RATIONALE_MAP` at ~line 3371
- `strategicAnchorClause` / `tacticalClause` / `immediateClause` (clauses fed into Why line)
- `applyV51Enrichment` and `detectCeoRealities` (existing CEO-reality detection — narrower than the new §2.11–§2.17 evaluator)

## Key insight

The Plan does NOT use an LLM prompt for the Why line — it is deterministic. So Phase 3b is structurally simpler than 3a:
- Read `behaviourFlags` from `behaviour-evaluator` (already imported alongside taxonomy).
- `vetoRisk.high` → boost a Pause module into slot 1 (extend existing scoring boost in `applyV51Enrichment`).
- `postPeakHangover.high` → boost a Reenergise module into slot 3.
- `composeWhyLine` accepts an optional `stake?: string` derived from the active flag, used to add a leadership-variable noun phrase to `strategicAnchorClause` output.
- `generate-jit-events`: when `boardLevelOutcome` fires for a JIT's anchor event, set `signalStrength = 3` via the existing pattern-promotion field.

No prompt to slim, no Atomic Brief Contract to defend, no LLM provider chain.

## What does NOT change

- 3-slot ceiling, slot ordering rules, JIT horizon, plan_ledger contract, per-priority queue contract, regeneration stability, module eligibility, content recommendation weights.
- `detectCeoRealities` keeps its current responsibilities (board / veto / travel regex over today's events). Phase 3b adds, does not replace.

## Rollback procedure

Phase 3b changes are additive — every `behaviourFlags` read can be removed without behaviour regression (slot ordering reverts to pre-flag boosting, Why line keeps composing the same clauses without `stake`).