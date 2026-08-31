# Calendar Load Truth: all connected calendars, FYI markers, same-slot collapse

## Where the FYI exclusion already lives

You were right that this already exists. There are **three** separate FYI lists in the codebase, and the load path uses none of them:

| What it covers | Where it lives | Used by the load verdict? |
|---|---|---|
| FYI holiday subscription calendars, home vs foreign country | `_shared/availability/availability-classifier.ts` — `isFyiHolidayCalendar`, `isApplicableHoliday`, `looksLikeHolidayMarker` | No |
| Personal chores and admin noise — pay bills, groceries, dry cleaning, dentist, reminders, subscriptions, commute | `_shared/events/event-classifier.ts` — `NOISE_KEYWORDS` / `isNoiseTitle` | No |
| Public/bank holiday as a taxonomy subtype (`rhy.holiday`, Category H) | `_shared/events/event-subtypes.ts` | No |

Instead, `_shared/signal-engine/db-queries.ts` defines its own private `PUBLIC_HOLIDAY_RX` — a five-word English regex — and applies it *only* to the meeting count, after the load verdict has already been computed. That is the whole defect. The load verdict never sees any FYI rule at all.

The availability SSOT already implements exactly the home-vs-foreign behaviour you described: it returns `fyi_matches_user_country` (→ holiday / long-weekend framing) or `fyi_foreign_country` (→ normal working-day framing), and neither state is meant to contribute load. It is simply not wired into the load path.

**One gap in the SSOT itself:** `isFyiHolidayCalendar` reads fields named `source` / `calendarSummary` and matches `/holidays? in /`. Your calendar stores the feed name at `event_metadata.calendarTitle`, and today's two entries came from `Holidays in United Kingdom` and `UK Holidays`. The second one does not match the current pattern, and neither field name is being mapped. So even the correct helper would miss one of your two holidays today.

## What changes

### Fix 1 — All connected calendars feed the load (iOS)

`primary_calendar_events` picks one winning provider and discards every other row. On iOS Apple wins, so a meeting that exists only in your Google calendar never reaches the brief at all.

Replace provider *exclusion* with provider *precedence*: the view returns events from **every** connected calendar, and where the same event appears in more than one provider, Apple's copy wins on iOS (Google's on web). Apple stays first — it stops being the only one. The existing cross-provider merge helper already knows how to pick the winner; the view stops doing the discarding.

### Fix 2 — One FYI filter, used by the load verdict, the deterministic path and the LLM

Route all three through the availability SSOT rather than the local regex:

- Any all-day event from a holiday subscription feed is a holiday marker. **No attendee condition** — a public holiday with an attendee on it is still a public holiday, and it must not count as work evidence either.
- Home-country holiday → holiday / long-weekend framing. Foreign-country holiday → ordinary working-day framing. **Neither adds load.**
- Personal chores and admin noise route through the existing `isNoiseTitle` list rather than being re-listed.
- Travel legs and all-day personal-rhythm blocks keep their existing category-based exclusion.

Widen `isFyiHolidayCalendar` to match any holiday-named feed (`UK Holidays`, `Australian Holidays`, `Holidays in United Kingdom`) and map `event_metadata.calendarTitle` into the field it reads, so the helper actually sees your data. The widening is bounded to *calendar feed names*, never event titles, and is checked against a negative fixture (`Holiday cover rota`, `Holiday planning`) so an ordinary work calendar with "holiday" in its name is not swallowed.

### Fix 3 — Load is day-level, computed on the filtered list, with same-slot collapse

Load stays a whole-day verdict. It is computed once, after the FYI filter, using the existing shared helpers rather than a row count:

- `countLoadUnits` from `_shared/rules/calendarEvents.ts` — two events in the same slot count as one, because you cannot be in two meetings at once.
- `mergeCalendarEvents` from `_shared/rules/calendar-merge.ts` — cross-provider copies of the same event collapse (unchanged, already working).
- Near-identical titles for the same holiday on the same day collapse to one.

Window heaviness stays what it is today: an additive mention layered on the day-level verdict, not a second verdict. `meetings_completed` and `meetings_remaining` remain available to both the deterministic and LLM paths — the change is that all three consumers derive them from the same filtered list, so the narrative and the pill cannot disagree.

### Fix 4 — Removing a holiday from load must not remove it as the day's context

Dropping the bank holidays from the load count is only half the job. Today is a **home-country public holiday**, so it is still the frame for the whole brief — not a working day that happens to be quiet.

The availability SSOT already produces exactly this distinction and the brief does not consume it:

- Home-country holiday → `PUBLIC_HOLIDAY`, off-day. Reduced-touch, weekend-mode framing. No work directive, no "protect your focus block", no performance push.
- Foreign-country holiday → not an off-day. Ordinary working-day framing.
- Neither contributes load, in either case.

So the availability state is passed into both the deterministic and LLM brief paths alongside the filtered event list, and the copy selection branches on it before any load-based copy is chosen. A finished meeting on a home holiday does not flip the day back to work mode — it is mentioned as done, not as evidence of a workday. (The SSOT's work-evidence override still applies at its existing threshold: a genuinely full working day of meetings on a holiday is a workday.)

## Expected result for today

Both bank holidays drop out of load as FYI, but the home one sets the day's frame. The brief reads as a public holiday / long-weekend day: light day, one meeting already done, nothing left this afternoon, and the directive is returning to weekend mode rather than working the day. No heavy-afternoon claim and no work directive.

## Verification

- Today's brief: public-holiday framing, light, 1 meeting done, no remaining afternoon load, weekend-mode directive, no work directive.
- The `Australian Holidays` entries already in your calendar: zero load contribution, ordinary working-day framing.
- A home bank holiday with an attendee attached: still a holiday, still zero load, still holiday framing.
- A home holiday with one finished meeting: stays holiday framing (does not flip to workday).
- A work calendar named "Holiday cover rota": events still count as load, no holiday framing.
- A Google-only meeting on iOS: appears in the brief and counts toward load.
- Two overlapping distinct meetings: one load unit.
- Fixture tests for each of the above, asserting the load verdict, the deterministic count and the LLM-facing count are identical.
- Same brief checked on web and iOS.



## Pre-launch scope — four core fixes only

Ship: the view merge, the SSOT wiring, the predicate unification, and the holiday-framing pass-through. Everything else is deferred.


**Deferred to immediate post-launch follow-up** (tidying, no correctness or user-visible payoff today):

- Replacing the hardcoded `>= 4` thresholds in `compute-outer-readiness/index.ts` with `LOAD_HIGH_EVENT_COUNT`.
- Refactoring `generate-mastery-plan`'s local load derivation onto the shared helper.

## Invariants each change is checked against before merge

These are cascade risks, not isolated-correctness risks, and they are verified as merge gates:

1. **One filtered list, constructed once.** The FYI filter runs a single time and the resulting list is passed down to the load verdict, the deterministic count and the LLM-facing count. No consumer re-derives it. A test asserts all three read the same array instance-derived numbers, so call order cannot make the pill and the narrative disagree again.
2. **Filter runs before counting.** `countLoadUnits` and `mergeCalendarEvents` are only ever called on the post-`isLoadBearingEvent` list, never on raw rows.
3. **Mirror parity.** `supabase/functions/_shared/rules/calendarEvents.ts` and `src/utils/rules/calendarEvents.ts` stay byte-parallel. The same-day holiday-title collapse lands in both or neither; a parity check compares the two files. Same rule for `calendar-merge.ts`.
4. **Bounded widening.** `isFyiHolidayCalendar` matching is broadened only over calendar feed names, with negative fixtures for work calendars containing "holiday".
5. **Clean removal.** Before deleting `PUBLIC_HOLIDAY_RX` from `db-queries.ts`, grep the whole repo for references and imports; the delete only lands if the call site being replaced is the only one.

Rollback is a per-fix revert: the view migration, the SSOT widening and the predicate unification are independently revertable, and none of them depends on the deferred tidying.

## Technical notes

- **View change (migration):** rewrite `primary_calendar_events` and `web_primary_calendar_events` to return all providers, ranking duplicates by `identity_key` with platform precedence, instead of filtering to a single provider.
- `_shared/availability/availability-classifier.ts` — widen `isFyiHolidayCalendar` to any holiday-named feed; accept `event_metadata.calendarTitle` as a calendar-name source; confirm the work-evidence rule cannot promote an all-day holiday marker via `attendeesCount >= 1`.
- `_shared/signal-engine/db-queries.ts` — delete the local `PUBLIC_HOLIDAY_RX` (after the reference grep); `isLoadBearingEvent` delegates to the availability SSOT plus `isNoiseTitle`; apply the filter above `computeCalendarDemand`; feed the verdict through `countLoadUnits`.
- `_shared/signal-engine/_event-utils.ts` — `meetingCount()` consumes the already-filtered list rather than re-applying a predicate.
- `_shared/rules/calendarEvents.ts` (+ `src/utils/rules/calendarEvents.ts` mirror) — same-day near-duplicate holiday-title collapse, landed in both files together.
- Redeploy `compute-outer-readiness` and `smart-nudges`. `generate-mastery-plan` is untouched in this pass.

