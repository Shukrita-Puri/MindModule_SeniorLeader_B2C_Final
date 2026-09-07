# Light Day: correct gate, correct order, correct notifications

## What I confirmed in the code

- `generate-mastery-plan/index.ts` (`deriveStructuralDayFlags`, ~line 8670) calls `classifyLightDay({ ... events: [] })`. With an empty array `countTimedMeetings()` returns 0, so any non-off day takes the `meetingCount <= 1` branch and comes back `isLightDay: true`.
- The composed flag `isLightDay = !weekAhead.active && !isFullWorkingWeekend && (lightDay.isLightDay || (!availability.isRestDay && realMeetingCount <= 1))` therefore evaluates true on essentially every working day — the real meeting count only appears in the redundant second half of the OR.
- In `_shared/jit/slot-allocator.ts` the light-day branch sits at line 164–166, **above** the travel-day arc (176/191), the conference arc (195) and all dominant-event / mixed-day allocation. So a board-meeting-plus-flight day is replaced by three fixed recovery slots.
- `buildLightDayResult` (line 360) only swaps one slot when a ranked pre-phase A/B/C/G candidate exists, and never builds a prep → event → debrief arc.
- Brief (`compute-outer-readiness`, line 5125) and Smart Nudges (line 2242) already pass the real event rows, so they are classifying correctly today. The defect is confined to the plan path and to the ordering inside the allocator.
- There is no `_shared/notifications/smart-notification.ts` and no `_shared/insights/day-classifier.ts` in this project. Notification slot rules live in `smart-nudges/index.ts`; the Insights day shape is the persisted allocator shape. Both will be updated in place — no new files.

## The rule being enforced

Evaluation order, single direction, no re-derivation anywhere:

```text
0. Weekend day (regional calendar)?
   0a. has meetings          -> treat as working day, continue at 1
   0b. last day of weekend / long weekend / PTO / holiday run -> Week Ahead only (exit)
   0c. any other off day     -> Light Day
1. Travel day                -> travel arc (exit)
2. All-day conference        -> conference arc (exit)
3. realMeetingCount >= 2     -> packed / dominant-event / mixed arc (exit)
4. Light Day
   4a. exactly 1 high-stakes meeting -> meeting-anchored arc (prep / meeting / debrief)
   4b. exactly 1 low-stakes meeting  -> 3 recovery slots
   4c. zero meetings                 -> 3 recovery slots
5. otherwise                 -> standard event-anchored plan
```

Notifications on a light day: Morning + Evening. A high-stakes afternoon meeting adds an afternoon, meeting-anchored one (3 total). A high-stakes morning or evening meeting **replaces** that window's recovery message rather than adding to it (2 total). Travel, conference, packed and ordinary working days keep their existing notification rules untouched.

Note: this supersedes the earlier "one notification per light day" rule from the September light-day work — light days now send two (three with a high-stakes afternoon commitment).

## Changes, file by file (no new files)

**`_shared/availability/light-day.ts`**
- Guard at entry: if `events` is missing or not an array, throw `LightDayClassificationError` instead of silently counting zero.
- Hard gate: `isLightDay` can only be true when the timed meeting count is 0 or 1.
- Travel / all-day-conference override: when the day carries a travel signal or an all-day conference block, return `isLightDay: false` with a reason naming the override, so those days exit before any light-day handling.

**`_shared/jit/slot-allocator.ts`**
- Move the light-day branch below the travel, conference and packed checks, with a DO-NOT-REORDER comment block stating its position.
- Add an explicit packed gate (`realMeetingCount >= 2`) ahead of it.
- Rewrite `buildLightDayResult` so a single high-stakes commitment produces a genuine three-slot arc anchored on the event (prep before, the event, debrief/protect after) instead of a one-slot swap; low-stakes and zero-meeting days keep the three recovery slots.

**`generate-mastery-plan/index.ts`**
- Pass the real mapped calendar events into `classifyLightDay` (the same array already built for `classifyAvailability`).
- Compose the flag as `classifier.isLightDay && realMeetingCount <= 1`, dropping the OR fallback.
- Before `allocatePlanSlots`, assert mutual exclusivity of `isLightDay` / `hasTravelDay` / `hasConferenceDay` / packed; on conflict log the full flag state and resolve by specificity Travel > Conference > Packed > Light.

**`smart-nudges/index.ts`**
- Replace the current single light-day allowance with Morning + Evening, plus the conditional afternoon for a high-stakes afternoon commitment, plus the replace-not-add behaviour for a high-stakes morning or evening commitment. The existing `prepMeeting` stakes resolution (A–C / travel / conference) is reused as-is.

**Brief and Insights**
- No logic of their own changes: both consume the corrected classification. The brief already receives the real events; Insights receives the post-override day shape from the plan allocator, so the recovery-vs-execution load allocation follows automatically. No historical Insights records are rewritten; a deployment timestamp is logged so pre/post rows can be told apart.

## Verification

Cases added to the existing `light_day_surfaces_test.ts` and the existing plan/nudge suites — no new test files: zero-meeting workday, one low-stakes meeting, one high-stakes afternoon meeting (3 notifications), one high-stakes evening meeting (2, evening anchored), two-plus meetings (never light), travel day, all-day conference, weekend first day, weekend last day, weekend with meetings. Then a replay of the plan for a packed real account to confirm event-anchored slots return, and `deno check` across the touched functions before deploying plan, nudges and readiness.

## Out of scope

No UI, no copy redesign, no schema change, no new day shapes or notification types, no week-ahead trigger changes, no touching the readiness demand scorer or any unrelated surface.
