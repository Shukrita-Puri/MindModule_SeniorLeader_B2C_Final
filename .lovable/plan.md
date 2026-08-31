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

## Expected result for today

Both bank holidays drop out as FYI (one home, one regional — both non-load). One meeting remains, already finished. Load reads **light**, the pill reads "1 meeting done", and the narrative stops calling the afternoon heavy.

## Verification

- Today's brief: light, 1 meeting done, no heavy-afternoon claim.
- The `Australian Holidays` entries already in your calendar: zero load contribution, working-day framing.
- A home bank holiday with an attendee attached: still a holiday, still zero load.
- A Google-only meeting on iOS: appears in the brief and counts toward load.
- Two overlapping distinct meetings: one load unit.
- Fixture tests for each of the above, asserting the load verdict, the deterministic count and the LLM-facing count are identical.
- Same brief checked on web and iOS.

## Technical notes

- **View change (migration):** rewrite `primary_calendar_events` and `web_primary_calendar_events` to return all providers, ranking duplicates by `identity_key` with platform precedence, instead of filtering to a single provider.
- `_shared/availability/availability-classifier.ts` — widen `isFyiHolidayCalendar` to any holiday-named feed; accept `event_metadata.calendarTitle` as a calendar-name source; confirm the work-evidence rule cannot promote an all-day holiday marker via `attendeesCount >= 1`.
- `_shared/signal-engine/db-queries.ts` — delete the local `PUBLIC_HOLIDAY_RX`; `isLoadBearingEvent` delegates to the availability SSOT plus `isNoiseTitle`; apply the filter above `computeCalendarDemand`; feed the verdict through `countLoadUnits`.
- `_shared/signal-engine/_event-utils.ts` — `meetingCount()` adopts the same predicate.
- `_shared/rules/calendarEvents.ts` (+ `src/utils/rules/calendarEvents.ts` mirror) — same-day near-duplicate holiday-title collapse. The two files stay byte-parallel.
- `compute-outer-readiness/index.ts` — replace the ~8 hardcoded `>= 4` copy thresholds with `LOAD_HIGH_EVENT_COUNT`.
- `generate-mastery-plan/index.ts` — replace its local raw-count load derivation with the shared helper.
- Redeploy `compute-outer-readiness`, `smart-nudges`, `generate-mastery-plan`.
