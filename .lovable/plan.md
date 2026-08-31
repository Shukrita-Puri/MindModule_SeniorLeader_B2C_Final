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

### 2. Recurrence rule for "not this week" vs "never"
- **`never`** → permanently excluded everywhere: plan slots and Week Ahead. Never resurfaces.
- **`not this week`** → hard-excluded from plan slots for its tagged week only. From the following week the event is eligible again, per your rule.
- **Recurring series only** → for the 4 weeks after the tagged week, keep a **soft −25 demotion** in plan-slot ranking. It can still win a slot if it genuinely outranks everything else; it just stops being the automatic pick.
- **Week Ahead is unaffected by the demotion**: the event still appears in the picker for those weeks, carrying the existing `historically_low_signal` tag so the reason is visible and the user can re-prioritise it in one tap.
- `priority` or `tag_cleared` clears the demotion immediately via the existing `isSuperseded` path.


### 3. Travel always earns its own slot or a full arc (backend)
`slot-allocator.ts` already has `hasTravelDay → travel_day_full_arc` and G in the multi-phase set, but only when G is the top-ranked candidate. Change it so a G candidate inside the horizon **always** claims at least one slot even when A/B/C outranks it — matching the Brief's travel rule. Category weights are untouched; this is a reservation, not a re-score.

### 4. Stale slot refills instead of disappearing (frontend)
Revising Fix 2 per your note. In `TodayThreePriorities.tsx`, when a slot is stale (pre-slot >30 min after start, during-slot after end, post-slot >4h after end, and not completed), do not just hide it — **backfill from the plan's remaining candidates** so the card still shows 3. Order of preference: the next unused horizon module from the snapshot, then the existing `buildFallbackHorizonModules` state-only slot. Completed slots keep their ✓. The empty state only appears when there is genuinely nothing left.

### 5. Crisper titles and no duplicated arc word (mobile iOS)
The truncation is a mobile-width problem plus a title that repeats the badge. Both screenshots show `RECOVER` as a badge and "Steady composed presence…" as the title — two ways of saying the same thing, eating the width that the why-line and practice card need.

- **Drop the arc badge from the card header.** The arc word moves into the title as its first word: `Recover presence for the morning rhythm`. One arc word per card, never two.
- **Shorten the event reference to 1–2 words.** "Chief AI Thursday connects" → "Chief AI"; "Q2 Board Meeting" → "Board". `title-prefixes.ts` trims the anchor title to its first 1–2 meaningful words (dropping filler and trailing words like "meeting", "call", "connects").
- **Cap the whole title at 6 words**, down from 10, so it fits two lines at iPhone width without an ellipsis.
- Keep `line-clamp-2 break-words` as the safety net; with a 6-word title it should never engage.

The arc value still reaches the UI in the slot data, so ordering, debug payloads and the completion tracker are unchanged — only the badge chip stops rendering.


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
