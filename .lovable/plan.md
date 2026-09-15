# Restore reverted reminder behaviour + audit missing context in reminder copy

All findings below are confirmed against the current `supabase/functions/smart-nudges/index.ts`. Work stays inside that one function (plus its own tests). One isolated deploy of `smart-nudges` at the end, nothing else touched.

## 1. Weekend framing must follow one rule for every country

The rule, unchanged for anyone: **first day of the weekend gets the recovery/light-day copy; last day of the weekend gets the week-ahead copy.** Saturday/Sunday countries already behave this way. Friday/Saturday countries must follow the exact same rule with the same copy — recovery on Friday, week-ahead on Saturday.

Today the evening prompt builder hardcodes day numbers (`dayOfWeek === 0` for week-ahead, `=== 6` for recovery, `=== 5` for "close the week") while the send-window and skip gates in the same file already resolve the weekend from the user's home country. For Friday/Saturday countries the schedule and the copy disagree.

Fix: in the evening prompt case, resolve `firstWeekendDay` / `lastWeekendDay` from `ctx.homeCountry` with the two helpers already imported, then key the existing branches off them:
- last weekend day → the current week-ahead framing and CTA verbs (unchanged text),
- first weekend day → the current recovery framing and CTA verb (unchanged text),
- the day before the first weekend day → the existing "close the week" framing,
- everything else → the existing weekday branch.

No copy is rewritten and no rule changes. For Saturday/Sunday countries the resolved numbers are identical to today's hardcoded ones, so their behaviour is byte-for-byte the same.

## 2. Wire up the context that already exists but is ignored

The reminder run already hydrates travel state, availability and load shape, then throws them away at the rule-evaluation step:
- the rule context is handed `travelDay: false` even though `ctx.travelSignal.travelDay` is already computed,
- the `availability` field is not passed at all even though `ctx.dayContext.availability` is already classified,
- a redundant per-reminder `travel_state` query runs anyway,
- the load-shape prompt reader is imported but never called.

With travel pinned false and availability absent, the time-off / public-holiday / weekend and travel rules can never fire, so those branches silently vanish from the copy prompt.

Fix: pass the already-hydrated travel verdict and availability into the rule evaluation, drop the redundant query, and call the existing load-shape prompt reader, appending its block the same way the behaviour block is appended. Every failure path stays silent (falls back to today's behaviour), so nothing can regress into an error.

## 3. Event-phase gate is skipped for all AI copy

`generateNudgeCopy` accepts an event-phase argument but no caller passes one, so the check that stops copy calling an already-running meeting "next" never runs on AI copy — only the built-in fallback still does it.

Fix: compute the phase inside `generateNudgeCopy` from the anchor event already in its inputs (using the existing resolver) and use it for the AI validation, keeping the argument as an override for the fallback path. In the midday recalibrate prompt, replace the flat "Next event" line with the phase-correct clause, and gate the "name the morning state" instruction behind the existing state-provenance helper so copy only claims a morning state when a real check-in exists.

## 4. Audit: why reminder copy has no wearable / readiness / pattern context

Audited; three concrete reasons, all in this file:

1. **Historical patterns never reach the copy prompt.** The pattern store *is* loaded onto the reminder context, but it is only used for two things: ranking which reminder variant wins, and the separate standalone "pattern alert" reminder. No prompt lists pattern facts, so the model has no way to write "the last 3 board meetings ran with elevated heart rate" — that sentence type only exists as a fixed deterministic string in the pattern-alert reminder.
2. **Readiness (MRS) is never given to the model at all.** The readiness score is read from the snapshot for logging only, is not in any prompt, and the rule evaluation is passed `scoreToday: null`, so readiness-driven behaviour rules cannot fire either.
3. **Wearable data is present unevenly and only as today's numbers.** The morning prompt gets full wearable lines; the midday and evening prompts get at most one HRV/RHR line, and the JIT prompts get one HRV line. Nothing is comparative (no "vs the last 3 of these"), and stale data is nulled out, so on many runs the wearable block reads "not available".

Proposed fix, additive and small: one shared "immediate context" prompt block, built from data already on the context, appended to every reminder prompt — today's wearable signals, the readiness state/score when present, and the single strongest matching pattern fact for the anchor event (event type, occurrence count, direction of the physiological shift). The existing copy contract keeps the guard rails: only real named tokens, never an invented number, and the pattern fact only appears when the store actually holds it.

## Safety

- Nothing outside `smart-nudges` is edited; no schema change, no frontend change.
- No existing copy string is rewritten in items 1-3; the only new text is the item-4 prompt block, which the existing quality gate already validates.
- Every new read is failure-tolerant: if it is missing, the prompt degrades to exactly today's content.
- `deno check` must be clean (including no unused imports), and the full existing smart-nudges test suite must stay green.
- New tests: a Friday/Saturday-weekend country gets recovery framing on Friday and week-ahead framing on Saturday; a Saturday/Sunday country is unchanged; an underway anchor event never produces future-tense copy; the immediate-context block is empty rather than invented when no wearable, readiness or pattern data exists.
- Deploy `smart-nudges` on its own, then check one live run's logs.
