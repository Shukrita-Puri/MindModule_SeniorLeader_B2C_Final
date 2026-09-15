# Restore three reverted behaviours in the reminders function

All three reports are confirmed against the current file (`supabase/functions/smart-nudges/index.ts`). Work is confined to that one file plus its tests, and one isolated deploy of `smart-nudges`. No other function, no frontend change.

## 1. Weekend framing disagrees with the send window

Confirmed: the evening prompt builder uses hardcoded day numbers (`ctx.dayOfWeek === 0`, `=== 5`, `=== 6` at lines 3153, 3176-3182), while the send-window and skip gates at 3992 and 4013 use `firstWeekendDayForHomeCountry` / `lastWeekendDayForHomeCountry`. For Fri/Sat-weekend countries the scheduler and the copy pick different days.

Fix: in the `nudge_three` case, derive
- `firstWeekendDay` / `lastWeekendDay` from `ctx.homeCountry` using the same two helpers already imported at lines 90 and 112,
- `isLastWeekendEvening = ctx.dayOfWeek === lastWeekendDay` (the Sunday-equivalent, week-ahead framing and CTA verbs),
- `isFirstWeekendEvening = ctx.dayOfWeek === firstWeekendDay` (the Saturday-equivalent recovery framing),
- the pre-weekend "close the week" branch keyed off the day before `firstWeekendDay`,
- the plain weekday branch as "neither weekend day nor the pre-weekend day".

For Sun/Sat-weekend countries the resolved numbers are identical to today's hardcoded ones, so behaviour there is unchanged.

## 2. Behaviour rules cannot fire for reminder copy

Confirmed: the `evaluateForScope` call at ~3252 passes `timezone: { …, travelDay: false }`, omits `availability`, and re-queries `travel_state` inline even though `ctx.travelSignal` (built at ~2049-2056) and `ctx.dayContext.availability` (set at 2596) are already hydrated. With `travelDay` pinned false and no availability, the PTO / public-holiday / weekend and travel rules can never match, so those branches drop out of the copy prompt.

Fix:
- pass `travelDay: ctx.travelSignal.travelDay`,
- pass `availability: ctx.dayContext.availability`,
- derive `travelState` from the hydrated `ctx.travelSignal` and delete the per-nudge `travel_state` query and its local variable,
- restore the load-shape prompt reader block (`fetchRenderableLoadShape` / `getLoadShapeOrDefault` / `nudgeShapePromptBlock`), whose imports at lines 6 and 8 are currently unused, appending its block to `behaviourPromptBlock` the same way the wiring block does, and staying silent on failure.

## 3. Event-phase gate skipped for all AI copy

Confirmed: `generateNudgeCopy` takes `anchorPhase` as an optional parameter (line 2937) and none of the call sites pass it, so `violatesTruthContract` → `validateEventPhaseInCopy` never runs on AI copy. Only the static fallback at ~3921 still resolves a phase.

Fix:
- inside `generateNudgeCopy`, compute the phase from the anchor title in `specificSignals` via the existing `resolveCtxEventPhase(ctx, title)` and use it for `tryAIProvider`; keep the parameter as an explicit override so the fallback path can still supply one,
- in the `nudge_two_recalibrate` prompt, replace the flat `- Next event: "${eventTitle}"` line with the phase-correct clause from `resolveCtxEventPhase` (so an underway block is never called "next"), and gate the "name the morning state" instruction behind `buildStateProvenanceLines(ctx)` (already defined at 1591, currently unused) so copy only asserts a morning state when a real check-in exists.

## Verification

- `deno check` on the function must be clean, including no unused imports.
- Run the existing smart-nudges test suite (`fallback_floor_contract_test.ts`, `v5_validation_test.ts` and peers); all must stay green.
- Add three targeted tests: a Fri/Sat-weekend `homeCountry` gets the week-ahead framing on its last weekend day and recovery framing on its first; an underway anchor event yields no future-tense AI copy; the recalibrate prompt omits the morning-state instruction when there is no morning check-in.
- Deploy `smart-nudges` alone.
