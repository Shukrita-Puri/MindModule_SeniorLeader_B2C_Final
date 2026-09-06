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

1. **The 9–17 August hotel block vanished after 9 August.** Every surface fetches "today's
   events" by *start time inside today* (`smart-nudges/index.ts:1714`,
   `compute-outer-readiness/index.ts:5215`, `build-executive-home-cards/index.ts:142`,
   `generate-mastery-plan/index.ts:4863`). The hotel stay starts on 9 August, so
   on every date from 10 through 17 August the day looked completely empty of
   it. This is why the system missed a block that was visibly present for the
   full holiday: it queried when the row *started*, not whether it *covered today*.
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

4. **The multi-day lookback repeats the same mistake.** `week-ahead-hydration.ts`
   buckets past days by each row's start date only (`:152-158`) and stops at the
   first day it reads as "on" (`:167`), so an off-run with a multi-day marker is
   cut short there too.

Result: all interior days of the 9–17 August holiday lost the strongest durable
calendar evidence. 13 August then read as an ordinary workday holding its only
meeting, and 14 August ran the normal Friday close-out despite having no meeting.

Note: the single meeting on 13 August was genuine but low-value, not the hotel
block — the meeting counter already ignores all-day markers. One low-value
meeting must not cancel a strongly inferred holiday. (One separate, smaller gap found while
auditing: the readiness demand scorer counts all-day rows as load, unlike every
other counter. It is included in the fix below.)


## The fix (no new surfaces, no UI, no new tables)

### 1. Multi-day events must be visible on every day they cover
Change the day fetch from "starts today" to "overlaps today"
(`start_time < dayEnd AND end_time > dayStart`) at the four call sites above,
via one shared helper in `_shared/availability/`. Apply the same overlap rule to
the day-bucketing in `week-ahead-hydration.ts` so the backward walk over an
off-run no longer breaks on interior days. This alone restores the hotel stay on
13 and 14 August and fixes the same class of bug for any multi-day OOO/leave
block. Also exclude all-day rows from the readiness demand scorer, matching every
other meeting counter.


### 2. Availability SSOT v2 — an inference rung for untitled holidays
Add one new precedence rung to `classifyAvailability`, between explicit PTO and
public holiday. It fires only when the evidence triangulates:

- a persisted trip window covers today (already computed, source of truth is
  `travel_state.meta.trips` via `_shared/travel/hydrate-travel-day.ts`), **or**
  a multi-day accommodation block covers today; **and**
- zero meetings, or one meeting whose existing event classification says it is
  low-value / low-stakes; two or more real meetings or one high-stakes meeting
  preserve the existing workday override; **and**
- at least one supporting leisure/away signal: leisure or sightseeing blocks in
  the window, away-from-home distance, or a zero-work-meeting run inside the window.

Output is the existing `PTO` state with `reason: "inferred_vacation"` plus a new
`confidence: "high" | "medium"` field on the result envelope. No new state, no
new consumer contract. Conference/offsite evidence suppresses it (work trip, not
holiday) — that guard already exists in `trip-windows.ts` and
`brief-signal-coverage.ts`.

### 3. Persistence comes from the window, not from a new store
Because the rung reads the trip window (a date range), the awareness lasts the
whole 9–17 August run automatically, including days with nothing else on the
calendar. The low-value meeting on 13 August remains visible for context but does
not break recovery framing or the holiday run. A high-stakes meeting (or two or
more work meetings) can still create a workday exception without erasing the
surrounding run. The already-shipped last-day-only week-ahead rule keeps working:
the final day of the run still gets the week-ahead invitation.

### 4. One decision, read everywhere
- Brief (morning, afternoon, evening) via `brief-signal-coverage.ts`, which
  already calls the classifier — the existing `ptoTodayAllDay` /
  `personalHolidayInferred` legacy branches become fall-through only.
- Plan via `generate-mastery-plan` (`deriveStructuralDayFlags`).
- Nudges via `smart-nudges` (exactly one recovery-oriented invitation per
  holiday day, preserving the reason to enter the app; no ordinary close-out).
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
  the full 9–17 span retains holiday/recovery awareness, 13 August stays off
  despite its one low-value meeting, 14 August cannot emit the Friday work
  close-out, 17 August is the last day of the run, and 18 August is a workday
  again. Assert exactly one recovery-oriented notification on every interior
  holiday day. Plus the existing 31 availability tests and the cross-surface
  suite must stay green.
- Memory `mem://architecture/availability-ssot.md` updated with the v2 rung.

## Explicitly out of scope
No UI, no copy redesign, no schema change, no touching week-ahead trigger rules,
travel state machine, scoring, or any unrelated surface.
