# Brief travel awareness + iOS calendar load count

Two isolated fixes, deployed and rollback-able separately.

## What the code read confirms

**LLM path (already correct):** `copy-vocabulary.ts` already exports `PERSONAL_TRAVEL_DIRECTIVE`, `workTravelDirective(phase)`, `CONFERENCE_DIRECTIVE`, `NON_WORKDAY_DIRECTIVE`, `WEEKEND_DIRECTIVE`, routed by `dayShapeDirective()` inside `buildBriefSystemPrompt()`. `compute-outer-readiness` builds the prompt twice — line 6485 without day shape, then line 7804 with `dayShape` + `travelPhase` — and the LLM calls (8790/8799/8848/8860) all use the rebuilt `systemPromptWithLeader`. Bucket 3 (patterns/causality) is present and already reads `causality_findings.signal_summary`.

**Deterministic path (the gap):** `deterministic-brief.ts` has no notion of travel or conference. `DeterministicBriefFallbackOpts` carries only `isWeekend` / `isNonWorkday`, and `buildDeterministicBriefFallback` collapses `isNonWorkday` into `isWeekend`. So a Sunday `work_travel` day (flight, then work) produces a workday pillar directive, and personal travel/conference produce weekend copy. The call site (line ~9255) passes `isWeekend` and `isNonWorkday` but not `briefDayShape` / `briefTravelPhase`, both of which are in scope.

**Calendar count:** the pill's `meetingCount` comes from `getServerCalendarMetrics` in `_shared/signal-engine/db-queries.ts:178`, which calls `mergeCalendarEvents(events, 'unknown')` and then counts `meetingList.length`. Two things to note before changing anything:
- The `'unknown'` provider precedence is **identical** to `'ios'` (`apple > google > microsoft`), so passing the real platform does not by itself change the collapse — cross-calendar dedupe already runs on iOS. So the "3 meetings for one flight" symptom is **not yet root-caused**; it may be title/time drift between the three calendar copies (the identity key is normalised title + 5-min start bucket + 10-min duration bucket), or the three events may be genuinely distinct.
- `meetingCount` counts merged events, **not** load units. Per `mem://architecture/event-load-and-dedupe-rules`, overlapping distinct meetings in a slot should count as **1 load unit**. That rule is not applied to this pill.

## Fix 1 — Travel / conference / day-shape reaches the deterministic brief

Files: `_shared/brief/deterministic-brief.ts`, `compute-outer-readiness/index.ts`.

1. Extend `DeterministicBriefFallbackOpts` with optional `dayShape`, `travelPhase`, `longHaulFlight`, `conferenceDayNumber`, `conferenceTitle`. All optional — existing callers and tests unaffected.
2. Stop collapsing `isNonWorkday` into `isWeekend` when a `dayShape` is supplied; route `buildDirective()` by day shape first (work_travel by phase, personal_travel, conference, holiday/PTO, weekend), falling through to the current pillar branches for `workday`. Existing weekend and workday strings stay byte-identical.
3. Add matching day-shape closes in `closeFor()` (travel/conference/off-day), weekend and workday closes unchanged.
4. Pass `dayShape: briefDayShape`, `travelPhase: briefTravelPhase`, plus long-haul and conference fields from `briefBehaviourSnapshot.signals` at the existing call site. No other field changes.
5. Add two worked examples (work travel pre-departure, conference day 2) to `WORKED_EXAMPLES` so the LLM register matches.
6. **Impact, not just awareness:** beat (b)/(c) copy on travel and conference days states the cost of the shape (transit load, accumulated attention) and, where a Bucket 3 pattern exists for the matching event bucket, the LLM is instructed to cite it ("the last flights left the mind mixed the following morning"); when no pattern exists, it names the generic cognitive cost instead. The deterministic strings use the generic form only — the deterministic path has no pattern access.

## Fix 2 — iOS calendar load count

Sequenced as investigate → fix, because the cause is not confirmed:

1. Query this user's `calendar_events` rows for 9 Aug and inspect the three flight copies: provider, title, start/end. Determine whether the identity key differs (title or time drift) or whether the events are genuinely distinct.
2. Pass the already-computed `platform` (from `detectClientPlatform(req)`, line 3143) instead of the hard-coded `'unknown'` at every `mergeCalendarEvents` call site in `compute-outer-readiness` and in `getServerCalendarMetrics`. This is correctness hygiene regardless of the root cause; on its own it changes nothing for iOS.
3. Apply the load-unit rule to the pill count: `meetingCount` becomes `countLoadUnits(mergedEvents)` so 2-3 overlapping meetings in one slot count as one unit, matching the documented cross-app rule. Display surfaces that list events keep showing every distinct meeting.
4. If step 1 shows title/time drift, widen the identity tolerance only for that specific drift, in `calendar-merge.ts`, with a unit test — and flag before changing it, since that file is shared.

## Not touched
Scoring, MRS, pill tier computation, gating, freshness, `phraseFor()` / `buildEvidence()` / `buildRead()`, `deriveDayShape`, `buildBehaviourSnapshot`, any UI component, any other edge function, DB schema, API response shape.

## Deploy order
1. `deterministic-brief.ts` + `copy-vocabulary.ts` (Fix 1 steps 1-3, 5) → typecheck + full test run.
2. `compute-outer-readiness` call-site wiring (Fix 1 step 4) → deploy → smoke test work_travel/pre, conference day 2, pto, workday-depleted (regression guard).
3. Fix 2 step 1 investigation → report findings before steps 2-4.
4. Fix 2 steps 2-3 → deploy → verify `[calendar-merge]` logs and the pill count on iOS.
5. `BRIEF_PROMPT_VERSION` → `v7.1-travel-and-dayshape` in both `_shared/brief-prompt-version.ts` and `src/constants/briefPromptVersion.ts`, one commit, one deploy.
