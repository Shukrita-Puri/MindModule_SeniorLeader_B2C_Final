# Brief LLM — Day-Shape Awareness (Holiday / PTO / Travel / Conference)

Isolated change to the Brief LLM only. No new detection logic: everything is already computed by the shared modules the Plan (JIT v2) uses. Today those signals reach the Brief only indirectly (a few fired behaviour rules), so the Brief can still emit workday copy on a holiday, or ignore a work-travel arc the Plan is anchoring on.

## What already exists (verified)

- `_shared/brief-signal-coverage.ts` → `buildSignalMatrix()` already derives: `ptoTodayAllDay`, `ptoMeetingPresent`, `personalHolidayInferred`, `workTravelInferred` (travel event + high-stakes meeting after landing — the "meeting post travel" rule), `travelDay`, `travelTier`, `longHaulFlight`, `preFlightWindowMinutes`, `inFlightConnectionMinutes`, `nextTravelEventTitle`, `yesterdayWasTravelDay`, `postTripReentryRisk`, `awayFromHome`, `sameDayReturn`, plus the full conference cluster (`conferenceDayNumber` / `conferenceTotalDays` / `conferenceStartsTomorrow` / `speakingBlocksToday` / `trailingConferenceLoad`).
- `compute-outer-readiness` already builds that matrix (via `buildBehaviourSnapshot`), injects the public-holiday name, weekend flags, the A–H event categories, and a MATERIAL DAY CONTEXT line for travel+work days.
- `_shared/ceo-behaviour/travel.ts` / `conference.ts` / `pto-holiday.ts` own the arc rules (pre-flight / in-flight / landing / post-trip re-entry).

Gap: `buildBehaviourSnapshot` discards the raw matrix, so the prompt never states the day shape explicitly, and the system prompt has no non-workday or travel-arc directive (only the weekend one added last change).

## Changes

1. `_shared/behaviour-snapshot.ts`
   - Return the already-computed `SignalMatrix` on the result as `signals` (no extra computation — `buildSignalMatrix` already runs inside `evaluateForScope`; call it once and pass it through).

2. New `_shared/brief/day-shape.ts`
   - `deriveDayShape(signals, { isPublicHoliday, holidayName, isWeekend })` returns one canonical `dayShape`: `workday | weekend | public_holiday | pto | personal_holiday | work_travel | personal_travel | conference`, plus `travelPhase: pre | in_transit | post | null` and a short `travelReason` (e.g. "meeting scheduled after landing").
   - Precedence: personal holiday / PTO > public holiday > conference > travel > weekend > workday. A day is `work_travel` only when `workTravelInferred` is true; a travel event with no post-landing work reads as `personal_travel`.
   - `formatDayShapeBlock()` renders a `=== DAY SHAPE ===` prompt block with the shape, travel phase, tier / long-haul, conference day X of Y, and the one-line rationale.

3. `_shared/brief/copy-vocabulary.ts` (SSOT for persona/directives)
   - Add directive constants alongside the existing `WEEKEND_DIRECTIVE`:
     - `NON_WORKDAY_DIRECTIVE` (public holiday / PTO / personal holiday): beat (c) must not reference meetings, calls or workday tasks; closes toward recovery or the return to work. If `ptoMeetingPresent`, allow a single reference to the one meeting that breaks the day.
     - `WORK_TRAVEL_DIRECTIVE`, phase-aware: pre → assess the current cognitive read and give a high-level protect-before-you-fly direction; in transit → arrival-state framing; post → re-entry / lag-recovery framing before the first work block. It states explicitly that the Plan carries the prevention/recovery protocols, so the Brief stays at direction level and never prescribes a practice or duration (four-beat contract unchanged).
     - `PERSONAL_TRAVEL_DIRECTIVE` — no work framing, no performance push.
     - `CONFERENCE_DIRECTIVE` — day X of Y, speaking load, trailing fatigue.
   - `buildBriefSystemPrompt` gains `dayShape` / `travelPhase` options and appends exactly one directive (the weekend directive stays, reused when the shape is `weekend`).

4. `compute-outer-readiness/index.ts`
   - After `briefBehaviourSnapshot` is built: derive the day shape, append the `=== DAY SHAPE ===` block to `userPrompt` (before the behaviour block), and pass `dayShape` + `travelPhase` to `buildBriefSystemPrompt`.
   - Per `mem://reliability/brief-prompt-variable-scoping`, declare the day-shape variables in the same outer scope as `userPrompt`.
   - Bump the brief prompt version constant so cached briefs regenerate.

5. `_shared/brief/deterministic-brief.ts`
   - Same guard on the fallback path: when the shape is a non-workday, the deterministic copy must not emit work-directive prose (reuse the existing weekend branch, extended to holiday / PTO / personal travel).

## Validation

- Unit tests for `deriveDayShape` covering: public holiday, all-day PTO, PTO with one meeting, personal vacation, work travel pre/in/post, personal travel (no post-landing meeting), conference day 2 of 3, weekend-straddling holiday, and plain workday.
- Prompt-assembly test asserting exactly one directive is appended and that a non-workday prompt contains no work-directive instruction.
- Beta-data validation: query recent `calendar_events` for users with travel titles and check `workTravelInferred` against actual post-landing meetings, confirming the work-vs-holiday split behaves on real data before deploy.
- `tsgo`, `deno check`, full vitest run, then deploy `compute-outer-readiness`.

## Out of scope

No changes to Plan, Nudges, MRS, scoring, freshness gating, or any detection rule. The Brief only reads signals the Plan already produces.