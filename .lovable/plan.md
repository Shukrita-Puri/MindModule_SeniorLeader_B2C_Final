## Problem

Week-Ahead Priorities (the card that opened in your screenshot) runs a separate, weaker pipeline than the weekday Plan:

- It uses `rankJitCandidates` (legacy ranker) instead of `selectJitCandidates` (the triangulated Immediate / Tactical / Strategic + Sovereign + Memory selector that powers the daily Plan).
- It never loads attendee relationships, `event_priority_memory`, sovereign tags from `plan_ledger`, `causality_findings.signal_summary`, skip / follow-through counts, or user goals — so a CEO interview can't earn the `direct_boss`/`board_member`/`investor` hoisted relationship bonus, and a presentation can't pick up tactical pattern weight.
- The classifier mis-tags some events (a recurring "Chief UK In Transition" trips the `trv.flight` keyword `transit`; an "Interview with EY CEO" surfaces as "leadership / strategic / you're organising" instead of the candidate-interview bucket because no relationship roles are loaded; "Presenting Mind Module to St James" never makes it in because the influence subtype keyword list omits `present`/`presenting`).
- `selectJitCandidates` hard-caps events at a 24h horizon, so even if you wired it in directly today you'd get zero results for a 7-day window.

The fix is to unify the selection path and patch the classifier gaps the audit surfaced.

## Plan

### 1. Extract the JIT context loader as a shared module

New file: `supabase/functions/_shared/jit/load-jit-context.ts`.

Move the loader logic that today lives inline in `generate-mastery-plan/index.ts` (≈lines 180–510) into a single `loadJitContextForEvents(supabase, userId, events, opts)` helper that returns the full `{ input: SelectInputEvent[], ctx: SelectContext }` pair. It pulls and composes:

- attendee emails per event, `attendee_relationships` rows (source + confidence), `memory_user_tag` replay, domain-heuristic backstop, optional async resolver fan-out (gated by `opts.fireLateResolve`).
- `event_priority_memory` sovereign tag history (`tag_importance_*`, `tag_custom`, `tag_cleared`) into `tags`.
- `event_priority_memory` derived state via existing `applyEventPriorityMemory` into `memoryDeltaByEventId` (delta / hardDemote / sovereignEscalation).
- `causality_findings.signal_summary`, `accountAgeDays`, skip/follow-through counts (empty for now to match Plan PR1), and `goals` from the profile snapshot.

`generate-mastery-plan/index.ts` is refactored to call this helper — no behaviour change for the Plan, identical inputs to `selectJitCandidates`.

### 2. Add a configurable horizon to the selector

In `supabase/functions/_shared/jit/select-jit.ts`:

- Add `ctx.horizonMs?: number` (default `24 * 60 * 60_000` for back-compat). Replace the hardcoded ceiling check with `if (startMs - nowMs > horizonMs) { excluded.push(... 'outside_horizon_ceiling'); continue; }`.
- Existing Plan callers and tests keep the 24h behaviour automatically.

### 3. Rewrite `list-week-ahead-priorities` on top of the unified selector

In `supabase/functions/list-week-ahead-priorities/index.ts`:

- Drop `rankJitCandidates`, `applyEventPriorityMemory`, and the local component-reason builder.
- After dedupe + noise/educational filtering, call `loadJitContextForEvents(supabase, userId, dedupedEvents, { fireLateResolve: false })` then `selectJitCandidates(input, { ...ctx, horizonMs: 7 * 86_400_000 })`.
- Map each `SelectedCandidate` to the API shape the UI already consumes:
  - `category` = a coarse token derived from `categoryId` + `bucket` so the chip under each title reads from the same source as the Plan ("interview", "influence", "investor"…) rather than the legacy coarse map.
  - `scoreReasons` derived from `components.breakdown` (`relationshipLeads` → relationship label; high `sovereignBonus` → "high stakes" / "you tagged this"; `situationalBoost > 0` → "interview" / "media"; high `tactical` → "recurring high-pressure pattern").
- Keep the existing per-category soft cap (4) and `TOP_N=10`, plus chronological re-sort for the UI.

### 4. Classifier / taxonomy patches

In `supabase/functions/_shared/events/event-subtypes.ts`:

- Add `transition`, `in transition`, `chief`, `cto in transition`, `interim` to `trv.flight.excludeKeywords` so recurring leadership "in transition" calls stop being labelled Travel.
- Extend `inf.client_presentation.keywords` with `present`, `presenting`, `presentation`, `pitch` (and add `excludeKeywords` for `presentation deck review` if needed) so titles like "Presenting Mind Module to St James" classify as B-Influence.
- Add a dedicated `inf.exec_presentation` entry only if the audit shows pitches need a separate label; otherwise reuse the client-presentation subtype.

In `supabase/functions/_shared/jit/select-jit.ts`:

- `MY_INTERVIEW_TITLE_RE` already covers `interview with .*ceo|founder|chair`, so once the unified selector receives attendee roles "Interview with EY CEO" will resolve to `candidate` and pick up the +18 situational boost on top of any hoisted relationship weight. No code change required in this file beyond the horizon param.

### 5. Display-label alignment

In `src/components/home/WeekAheadPriorities.tsx` (or wherever the chip reads `category`): use the canonical bucket the selector now returns (Influence, Visibility, Governance, People, etc.) instead of the legacy coarse-token vocabulary. Same vocabulary the Plan card uses.

### 6. Validation

- Unit: extend `select-jit.test.ts` with a `horizonMs: 7*86400_000` case and a regression test that `Interview with EY CEO` + attendee role `direct_boss` ranks above a same-day `Weekly AI Forum`.
- Unit: classifier test asserting `Chief UK In Transition` does NOT classify as travel and `Presenting Mind Module to St James` classifies as `inf.client_presentation`.
- Smoke: curl `list-week-ahead-priorities` for the dev user, confirm the picker emits the three example events (`Interview with EY CEO`, the presentation, the fundraising open mic) ranked above generic standups.

## Files touched

- new: `supabase/functions/_shared/jit/load-jit-context.ts`
- edit: `supabase/functions/_shared/jit/select-jit.ts` (horizonMs param)
- edit: `supabase/functions/_shared/events/event-subtypes.ts` (keyword fixes)
- edit: `supabase/functions/generate-mastery-plan/index.ts` (use new helper)
- edit: `supabase/functions/list-week-ahead-priorities/index.ts` (unified selector)
- edit: `src/components/home/WeekAheadPriorities.tsx` (chip vocabulary)
- tests: `supabase/functions/_shared/jit/__tests__/select-jit.test.ts`, classifier test

## Out of scope

- No changes to the Brief, scoring weights, sovereign tag hierarchy, or memory schema. Plan behaviour is byte-for-byte identical (same inputs → same selector).
- Skip / follow-through count wiring stays empty (matches current Plan PR1 state); enabling those is its own PR.
