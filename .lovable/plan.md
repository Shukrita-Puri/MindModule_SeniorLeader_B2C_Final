# Persistent holiday / PTO / OOO awareness (Availability SSOT v2)

## What went wrong for shukrita@mindmodule.me, 9–17 August

Her calendar for that week holds exactly this (verified in the database):

| Event | When | Type |
| --- | --- | --- |
| Stay at DoubleTree by Hilton New York Downtown | 9 Aug → 17 Aug | all-day, multi-day |
| Flight to New York (BA 183) | 9 Aug evening | timed |
| Chief AI Thursday connects | 13 Aug 15:00–16:00 | timed, real meeting |
| Statue of Liberty / Ellis Island reserve | 15 Aug | timed, leisure |
| Flight to LHR (BA 188) | 17 Aug | timed |

There is **no** "OOO"/"PTO"/"Holiday" event anywhere. So three separate things
combined to make the system forget she was away:

1. **Multi-day markers vanish after day one.** Every surface fetches "today's
   events" by *start time inside today* (`smart-nudges/index.ts:1714`,
   `compute-outer-readiness/index.ts:5215`, `build-executive-home-cards/index.ts:142`,
   `generate-mastery-plan/index.ts:4863`). The hotel stay starts on 9 August, so
   on 13 and 14 August the day looked completely empty of it.
2. **Nothing infers a holiday without a titled marker.** The availability
   classifier (`_shared/availability/availability-classifier.ts`) only accepts
   an explicit PTO flag, a PTO/holiday *title*, or a weekend. A hotel stay,
   sightseeing blocks and being 5,500 km from home are invisible to it.
3. **The awareness that does exist is not persistent.** The classifier judges
   one day at a time from that day's events. The only durable record of the
   trip — the persisted trip window `2026-08-09 → 2026-08-17` already stored on
   `travel_state.meta.trips` (calendar-derived, high confidence, confirmed
   present in the database) — is only ever read to answer "is today a travel
   day?", never "is the user off?".

Result: 13 August read as an ordinary workday holding one meeting, and 14
August ran the normal Friday close-out.

Note: the single meeting on 13 August was a genuine work meeting, not the hotel
block — the meeting counter already ignores all-day markers. The problem is the
day was framed as a workday at all.

## The fix (no new surfaces, no UI, no new tables)

### 1. Multi-day events must be visible on every day they cover
Change the day fetch from "starts today" to "overlaps today"
(`start_time < dayEnd AND end_time > dayStart`) at the four call sites above,
via one shared helper in `_shared/availability/`. This alone restores the hotel
stay on 13 and 14 August and fixes the same class of bug for any multi-day
OOO/leave block.

### 2. Availability SSOT v2 — an inference rung for untitled holidays
Add one new precedence rung to `classifyAvailability`, between explicit PTO and
public holiday. It fires only when the evidence triangulates:

- a persisted trip window covers today (already computed, source of truth is
  `travel_state.meta.trips` via `_shared/travel/hydrate-travel-day.ts`), **or**
  a multi-day accommodation block covers today; **and**
- no work meetings today (the existing ≥2 timed-work-meeting rule still
  overrides everything — a genuine working day inside a trip stays a workday); **and**
- at least one supporting leisure/away signal: leisure or sightseeing blocks in
  the window, away-from-home distance, or a zero-work-meeting run inside the window.

Output is the existing `PTO` state with `reason: "inferred_vacation"` plus a new
`confidence: "high" | "medium"` field on the result envelope. No new state, no
new consumer contract. Conference/offsite evidence suppresses it (work trip, not
holiday) — that guard already exists in `trip-windows.ts` and
`brief-signal-coverage.ts`.

### 3. Persistence comes from the window, not from a new store
Because the rung reads the trip window (a date range), the awareness lasts the
whole run automatically, including days with nothing on the calendar. A single
work meeting mid-trip becomes an exception for that day only — the run itself
does not break. The already-shipped last-day-only week-ahead rule keeps working:
the final day of the run still gets the week-ahead invitation.

### 4. One decision, read everywhere
- Brief (morning, afternoon, evening) via `brief-signal-coverage.ts`, which
  already calls the classifier — the existing `ptoTodayAllDay` /
  `personalHolidayInferred` legacy branches become fall-through only.
- Plan via `generate-mastery-plan` (`deriveStructuralDayFlags`).
- Nudges via `smart-nudges` (light-day cadence, one send per day).
- Home cards via `build-executive-home-cards/day-type.ts`.
- Insights already reads the persisted trip windows; it will now also honour the
  inferred off-day when labelling those days.
All of these are server-side, so iOS and web get the identical answer with no
client change.

### 5. Existing duplicate inference gets folded in, not duplicated
`brief-signal-coverage.ts` already has a private holiday inference (4-weekday
zero-meeting run, workcation branch). That logic moves behind the classifier
rung so there is one inference, not two — the brief keeps its current outputs.

## Technical notes

- New: `_shared/availability/day-overlap.ts` (query helper) and an
  `offRunInference` block inside `availability-classifier.ts`; the classifier
  gains optional inputs `tripWindow`, `awayDistanceKm`, `windowEvents` — all
  optional, so callers that do not pass them behave exactly as today.
- `AVAILABILITY_SSOT_VERSION` bumped to 2 and stamped in the classifier reason
  string for observability.
- Tests: a replay fixture built from the real 9–17 August event set asserting
  10–16 August classify as `PTO/inferred_vacation`, 13 August stays off despite
  one meeting, 17 August (return) is the last day of the run, and 18 August is a
  workday again. Plus the existing 31 availability tests and the cross-surface
  suite must stay green.
- Memory `mem://architecture/availability-ssot.md` updated with the v2 rung.

## Explicitly out of scope
No UI, no copy redesign, no schema change, no touching week-ahead trigger rules,
travel state machine, scoring, or any unrelated surface.
