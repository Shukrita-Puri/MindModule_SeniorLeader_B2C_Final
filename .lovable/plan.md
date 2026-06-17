# Fix: MRS awaiting state must not render as 0

## Root cause
`composeBaselineV4` returns `baseline: 0` when every v4 sub-component is unavailable. Downstream code in `compute-inner-readiness` decides "awaiting" via `mrsV4AwaitingSignals && score == null`, so `0` slips through, becomes `innerReadinessScore`, and then `compute-outer-readiness` writes `morning_baseline_score = 0`, `readiness_score_baseline = 0`. The UI dial and brief copy then treat the user as genuinely depleted.

The downstream awaiting branches in `compute-inner-readiness` (line 878+) and `compute-outer-readiness` (line 1805, 5398-5419), the dial (`MrsGauge`, `InnerReadinessDial` already render `—` when score is null), and `getReadinessOneLiner` (already returns null on null input) all gate on `score == null` / `innerReadinessScore == null`. So the **single source of truth** to fix is the composer: stop returning `0` for awaiting.

## Changes

### 1. `supabase/functions/_shared/signal-engine/mrs-v4-compose.ts`
- Widen `ComposeBaselineResult.baseline` to `number | null` with a doc comment.
- When `awaitingSignals` is true, return `{ baseline: null, awaitingSignals: true, weightProvenance }` instead of `baseline: 0`.

### 2. `supabase/functions/compute-inner-readiness/index.ts`
- `score` is already typed `number | null`. No code change — line 878 (`awaitingReadiness = mrsV4AwaitingSignals && score == null`) will now fire correctly, cascading nulls into `displayedScore`, `scoreBaseline`, `scoreRefined`, `band`, `tierLabel`, etc. (already wired).
- No legacy v3 fallback re-enabled.

### 3. `supabase/functions/compute-outer-readiness/index.ts`
- Already gated by `innerStateIsAwaiting` (line 1805 uses `innerReadinessScore == null`). With inner now returning `score: null` for awaiting:
  - `inner_score`, `readiness_score_baseline`, `readiness_score_refined`, `tier_displayed`, `tier_cap_reason` → written as NULL.
  - `morning_baseline_score` → **not written** (`shouldWriteMorningAnchor` requires `currentReadingIsReal`).
  - Afternoon back-fill (`shouldBackfillMorningAnchor`) already requires `currentReadingIsReal && awaiting_signals !== true` → still safe.
- No code change needed.

### 4. Tests
- `supabase/functions/_shared/signal-engine/mrs-v4-compose_test.ts` already asserts `r.baseline === null` for the awaiting case (line 123). Currently failing against the live code — the fix makes it pass.
- Run `supabase--test_edge_functions` on `_shared` after the change.

## UI
No changes needed:
- `MrsGauge` (`src/components/home/mrs/MrsGauge.tsx:108`) renders `'—'` when `score` is null.
- `InnerReadinessDial` (`InnerReadinessDial.tsx:236`) renders `'—'` when `todayScore` is null, and shows "EARLY READ" caption + neutral copy when `isAwaiting`.
- `getReadinessOneLiner(null)` returns `null` → no "running on empty" string.
- Brief LLM userPrompt (`compute-outer-readiness/index.ts:3680`) already prints `'awaiting'` when score is not a number.

## Acceptance
- New morning compute for the affected user writes `inner_score = NULL`, `readiness_score_baseline = NULL`, `morning_baseline_score = NULL`, `weight_provenance.awaiting_signals = true`.
- Dial shows `—` with "EARLY READ" caption, not `0 / 100`.
- Brief no longer surfaces "running on empty …".
- Afternoon/evening cycles will only write `morning_baseline_score` once a real (non-awaiting) reading lands.

## Risk
Minimal. One-line semantic change + type widening. All downstream awaiting branches already exist; this just makes them trigger. Rollback: revert the one file.
