# Plan Feature — launch-safe fixes (7 items, scoped)

I checked the live code before planning. Three of the seven proposed fixes are **already implemented**, so this plan does not redo them — it verifies them and spends the remaining launch budget on the real gaps.

## What the code already does (verified, no change needed)

- **Fix 4 — practice recency penalty: already live.** `practice-selector.ts` has `recencyPenalty()` (≤1 day −30, ≤3 days −16, ≤7 days −8) and applies it via `ctx.recentPracticeDays`, which `generate-mastery-plan` populates from the 14-day history and passes into the selector. The audit's "computed but never consumed" finding is out of date.
- **Fix 3 — arc-position instruction: already live.** The Why prompt builds an explicit `arcDirectiveFor(arc)` block per slot.
- **Fix 6 — sovereign tag enforcement: already live.** `select-jit.ts` calls `sovereignTagAdjustment(ev.tags)`, applies a bonus, and hard-excludes on `sovereign.demote`, `memory_hard_demote` and `memory_escalated_low`.

If deprioritised events are still appearing, the cause is upstream of the selector (tag rows not written, or event-id mismatch), not the scoring — so this plan adds logging instead of changing weights.

## Changes to make

### 1. Tighten Why-line duplicate detection (backend, one file)
`_shared/plan/why-llm.ts`: lower the two Jaccard duplicate gates from `0.85` / `0.8` to `0.6`. Keep the existing behaviour on reject (drop the LLM line, run the deterministic repair path — no retry). Update `why-llm-validator.test.ts` expectations.

Risk: more deterministic repair lines. Acceptable — repair lines are already validated copy.

### 2. Hide stale slots at render time (frontend only)
`TodayThreePriorities.tsx`: filter the received plan before render, using the anchor event's start/end already present on the slot:
- PREPARE/pre slot: hide once the event started more than 30 minutes ago and the slot is not completed.
- DURING slot: hide once the event has ended.
- RECOVER/post slot: hide from 4 hours after the event ended.
- Completed slots always stay visible with their ✓ (sticky completion is untouched).

No backend change, no ledger change. If every slot is hidden, the existing empty state renders.

### 3. Provenance logging for event selection (backend, log-only)
In `generate-mastery-plan`, log one structured line per plan: for each candidate event — id, title, category, importance score, whether it was ranked into a slot, and the exclusion reason if dropped (`memory_hard_demote`, `sovereign_demote`, threshold, no phase). This is how we confirm the G/F/E calibration and tag-memory questions with real data instead of guessing, without changing any weight two days before launch.

### 4. Sovereign tag write-path check (read-only investigation)
Query `event_priority_memory` for the reporting user and confirm the tagged `event_id` values match the ids the selector sees. Report the finding; only fix if it is a plain id mismatch.

## Deliberately deferred (post-launch)

- **Category-G/F/E weight recalibration** — changes what every user sees on every surface. Do it after the logging from item 3 gives evidence.
- **Progressive per-window slot generation (Fix 5)** — this is a structural change to plan generation, the ledger, and the snapshot read path. Too large for a 2-day window; it is the right architecture but it is a post-launch workstream.
- **Category-event practice memory (Fix 7)** — needs `causeEffect.practiceImpact` threaded into the scorer and changes practice selection for everyone. Defer.
- **Title truncation** — the container is already `line-clamp-2 break-words`; before changing typography I need the specific slot title that truncates.

## Technical notes

Files touched: `supabase/functions/_shared/plan/why-llm.ts`, `supabase/functions/_shared/plan/why-llm-validator.test.ts`, `supabase/functions/generate-mastery-plan/index.ts` (logging only), `src/components/home/TodayThreePriorities.tsx`.

Not touched: MRS, Brief, signal pills, slot allocation, JIT weights, schema, RLS, edge function config, any other feature.

Verification: Deno tests for the plan/why-line suites, `tsgo`, frontend vitest, then one real plan generation to read the provenance log.
