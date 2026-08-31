# Plan Feature — audit findings + launch-safe fixes

## Audit: why "Chief AI Thursday connects" still reaches a plan slot

I queried the live rows for shukrita@mindmodule.me. The tags **were written** — the problem is not the write path and not an event-id mismatch. It is that the deprioritisation is week-scoped and expired, and the code path that would honour scope is never called.

What the data shows:

- Four `not_this_week` rows exist for `chief_ai_thursday`, written 19 Jul, 26 Jul and 2 Aug. The most recent carries `scope='target_week'`, `effective_week_start=2026-08-03`.
- Today is the week of 31 Aug. That deprioritisation was for the week of 3 Aug, so it has legitimately expired — and the next occurrence (3 Sep) was never tagged.
- The 2 Aug row has `resolved_event_id = NULL` and `identity_confidence='ambiguous'`, so even inside its own week it could only match by category/type key, not by occurrence.

What the code does:

- `_shared/plan/exclusion-evaluator.ts` is the documented SSOT for `never` / `not_this_week` precedence and week scoping. **It has zero callers in `supabase/functions` outside its own tests.** It is dead code today.
- The live path is `load-jit-context.ts` → `applyEventPriorityMemory()`, which treats `not_this_week` as a **soft −15 score delta, only for 14 days**, with no scope/`effective_week` awareness. At 29 days old, the Chief AI rows contribute exactly 0.
- Only `never` hard-demotes. `not_this_week` never excludes.

So: sovereign tags work, Week Ahead is not overwriting anything, and the recurring series simply has no live suppression. The fix is to honour the scope columns that are already being written, and to make a recurring deprioritisation carry to the next occurrence.

## Changes to make

### 1. Wire the exclusion evaluator into the live selector (backend)
In `load-jit-context.ts`, load the scope-aware rows (`loadPriorityMemoryRowsForUser`, already written for this purpose) and run `evaluateEventExclusion` per candidate event alongside the existing delta:
- `never` → hard exclude (unchanged behaviour, now via the SSOT).
- `not_this_week` matching the candidate's **local week** by `resolved_event_id`, else by `(category, type_key)` → hard exclude for that week, `reason='user_deprioritised_*'`.
- Outside its week → no effect, as designed.

`applyEventPriorityMemory`'s soft delta stays for the ranking nuance; the evaluator only adds exclusion.

### 2. Carry a recurring deprioritisation to the next occurrence (backend)
A weekly series tagged "not this week" today should not silently return next week with no signal. Add a bounded recurrence rule in the evaluator: when a `not_this_week` row matches a candidate by `(category, type_key)` and the series recurred at the same weekday/time, keep a **soft −25 demotion** (not a hard exclude) for 4 weeks after the tagged week. Never becomes permanent; `priority` or `tag_cleared` supersedes it immediately via the existing `isSuperseded` path.

### 3. Travel always earns its own slot or a full arc (backend)
`slot-allocator.ts` already has `hasTravelDay → travel_day_full_arc` and G in the multi-phase set, but only when G is the top-ranked candidate. Change it so a G candidate inside the horizon **always** claims at least one slot even when A/B/C outranks it — matching the Brief's travel rule. Category weights are untouched; this is a reservation, not a re-score.

### 4. Stale slot refills instead of disappearing (frontend)
Revising Fix 2 per your note. In `TodayThreePriorities.tsx`, when a slot is stale (pre-slot >30 min after start, during-slot after end, post-slot >4h after end, and not completed), do not just hide it — **backfill from the plan's remaining candidates** so the card still shows 3. Order of preference: the next unused horizon module from the snapshot, then the existing `buildFallbackHorizonModules` state-only slot. Completed slots keep their ✓. The empty state only appears when there is genuinely nothing left.

### 5. Title truncation (frontend + backend copy)
The screenshot confirms the diagnosis: "Steady composed presence for the…" is a generated title too long for two lines, not a CSS bug. Two changes:
- Backend: tighten the title word cap in `title-prefixes.ts` from 10 words to 6 for the priority title, so titles read as labels ("Steady presence for the board") not sentences.
- Frontend: allow the title to use 3 lines on mobile (`line-clamp-3`) so a 6-word title never clips.

### 6. Selection provenance logging (backend, log-only)
One structured line per plan listing each candidate: id, title, category, importance, slot assignment, and exclusion reason (`never`, `not_this_week_target_week`, `sovereign_demote`, `memory_hard_demote`, threshold). This is what makes the next report answerable from logs instead of a live query.

## Already implemented — verified, no change

- Practice recency penalty (`recencyPenalty()` −30/−16/−8) is live and consumed.
- Arc-position directive is in the Why prompt.
- Sovereign tag bonus + `sovereign.demote` exclusion is live in `select-jit.ts`.

## Deferred (post-launch)

- Why-line Jaccard tightening (0.85/0.8 → 0.6) — small, can ride along if you want it; listed here so it is a choice, not an omission.
- Progressive per-window slot generation — structural change to generation + ledger.
- Category-event practice memory from `causeEffect.practiceImpact`.
- Broad G/F/E weight recalibration — item 3 handles the travel case without it.

## Technical notes

Files: `_shared/jit/load-jit-context.ts`, `_shared/plan/exclusion-evaluator.ts`, `_shared/jit/slot-allocator.ts`, `generate-mastery-plan/index.ts` (logging + travel reservation), `_shared/plan/title-prefixes.ts`, `src/components/home/TodayThreePriorities.tsx`.

Not touched: MRS, Brief, signal pills, JIT scoring weights, schema, RLS, edge function config.

Verification: Deno tests for exclusion/allocator/title suites, `tsgo`, frontend vitest, then a real plan generation for shukrita to confirm from the provenance log that the 3 Sep Chief AI occurrence carries the recurrence demotion and that travel holds a slot.
