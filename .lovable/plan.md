# Calendar Load Truth: FYI markers, same-slot dedupe, and completed meetings

## What is actually happening on your calendar today

Mon 31 Aug holds exactly three rows:

| Title | Calendar it came from | All-day | Attendees |
|---|---|---|---|
| Summer Bank Holiday (regional holiday) | `Holidays in United Kingdom` | yes | 0 |
| Summer Bank Holiday (England, Wales, N Ireland) | `UK Holidays` | yes | 0 |
| Meeting with Sara | personal | no (10:00–10:20, finished) | 2 |

The load verdict is computed **before** the FYI filter runs. It sees three events. Their all-day spans overlap the meeting, which produces negative gaps between events, which trips the "tight gaps" rule and returns HEAVY. The meeting count is computed **after** the filter, which correctly strips both holidays and returns 1. Same card, two different views of the same day.

So the whole-day load is right in principle — it is being fed the wrong list.

## The three real defects

### 1. FYI markers reach the load calculation

Today's two holidays only got excluded from the meeting count because their titles happened to contain "Bank Holiday". That is a fragile test: a holiday named "Diwali", "Thanksgiving", "Feiertag" or "Jour férié" passes straight through.

Your calendar carries a far better signal that we are currently ignoring: **`calendarTitle`**. Both of today's entries came from subscribed holiday calendars — `Holidays in United Kingdom` and `UK Holidays`. Your calendar also carries `Australian Holidays` and Scottish regional entries. All of these are read-only FYI subscriptions, all-day, zero attendees, you are not the organiser.

The rule becomes: **anything sourced from a subscribed holiday calendar is FYI and never counts as load — regardless of country, language, or title.** Your own home country is irrelevant to this decision: a UK bank holiday and an NSW bank holiday are both FYI markers, not work. The same treatment extends to travel legs and all-day personal-rhythm blocks, which the existing category filter already handles.

### 2. Same-slot events are not collapsing into one load unit

The rule is: you cannot be in two meetings at once, so two events occupying the same slot count as **one** load unit. That rule exists in the shared helper (`countLoadUnits`) but the brief's load path never calls it — it counts rows. Cross-provider duplicates do collapse (an Apple/Google copy of the same meeting merges correctly), but two *differently titled* events overlapping the same slot each count.

Today's two holidays are exactly that case, at two levels: they occupy the identical all-day slot, and their titles are near-identical variants of the same holiday. Either rule alone would have collapsed them to one. Both should apply.

### 3. Completed meetings are not reflected in the window layer

Whole-day load stays whole-day — that is by design. On top of it sits a window layer that says which part of the day is heavy. Right now that layer never asks what has already finished, so at 15:20 with the day's only meeting done at 10:20 it still says "heavy this afternoon".

`meetings_completed` and `meetings_remaining` are correct signals and both the LLM and deterministic paths should keep receiving them — the problem is that they are computed three different ways. The deterministic path applies the FYI filter; the LLM path uses a weaker helper that only drops zero-duration rows; the load verdict uses neither. All three need the same filtered list so the window layer and the narrative cannot disagree.

## The fix

**A. One FYI exclusion, applied before anything counts.**
Add a subscribed-holiday-calendar test to the load-bearing filter: exclude when the event's source calendar is a holiday subscription, or when it is all-day with zero attendees and the user is not the organiser and the description reads as a holiday notice. Keep the existing title regex as a backstop for providers that do not send calendar metadata. Country is never part of the test.

**B. Filter first, then score.**
Apply the load-bearing filter once, at the top, and derive the load verdict, pressure, gaps, back-to-back hours, meeting count and remaining count from that single filtered list. Keep the unfiltered list purely as narrative reference, so the brief can still mention a flight or acknowledge the holiday without it counting as work.

**C. Same-slot collapse feeds the load verdict.**
Route the filtered list through the existing `countLoadUnits` rule before the verdict is computed, so overlapping events count once. Add a same-day near-duplicate title collapse so two variants naming the same holiday resolve to one entry.

**D. One count, three consumers.**
Point the window-context builders at the same filtered list so `meetings_completed` / `meetings_remaining` match what the deterministic path and the pill show. The window layer then reads "one meeting, done" and stops calling the afternoon heavy.

**E. Remove the drift risk.**
The "4+ events" threshold is hardcoded in roughly eight copy builders instead of importing the shared constant, and the Mastery Plan derives its own load from a raw event count with no filter at all. Both route through the shared helper.

## Verification

- Re-run today's brief: expect load `light`, "1 meeting done, nothing ahead", and no "heavy afternoon".
- Re-run against the Australian and Scottish holiday entries already in your calendar: expect zero load contribution from all of them.
- Re-run tomorrow (1 Sep, training event duplicated across Apple and Google): expect one event.
- Fixture tests for: a holiday from a non-home country, a holiday whose title contains no English holiday word, two overlapping distinct meetings, two near-identical holiday titles, and a completed-only afternoon — asserting the LLM-facing count, the deterministic count and the pill verdict are identical in every case.
- Confirm the same brief on web and iOS.

## One thing I want your call on

`primary_calendar_events` does not merge providers — it picks one winning provider and discards the rest. On iOS, Apple wins. A meeting that exists **only** in your Google calendar is therefore invisible to the brief entirely. That is a separate risk from the one you reported and I have not included it above. Say the word and I will scope it as a follow-up.

## Technical notes

- `supabase/functions/_shared/signal-engine/db-queries.ts` — extend `isLoadBearingEvent` with an FYI-calendar test reading `event_metadata.calendarTitle` / `description` plus the all-day + zero-attendee + non-organiser shape; move the filter above the `computeCalendarDemand` call.
- `supabase/functions/_shared/rules/calendarEvents.ts` (+ `src/utils/rules/calendarEvents.ts` mirror) — `countLoadUnits` becomes the load input; add same-day near-duplicate title collapse. The two files stay byte-parallel.
- `supabase/functions/_shared/signal-engine/_event-utils.ts` — `meetingCount()` adopts the load-bearing predicate.
- `supabase/functions/compute-outer-readiness/index.ts` — window layer reads completed vs remaining from the shared filtered counts; replace hardcoded `4` with `LOAD_HIGH_EVENT_COUNT`.
- `supabase/functions/generate-mastery-plan/index.ts` — replace the local raw-count load derivation with the shared helper.
- Redeploy `compute-outer-readiness`, `smart-nudges`, `generate-mastery-plan`.
