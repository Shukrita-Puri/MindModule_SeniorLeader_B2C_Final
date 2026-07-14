---
name: Canonical Availability SSOT
description: Single classifier deciding WORKDAY / LIGHT_ROUTINE / REST_DAY / PTO / PUBLIC_HOLIDAY. Consumed by Planner, Brief, Nudges.
type: architecture
---

Location: `supabase/functions/_shared/availability/availability-classifier.ts` — SINGLE FILE.

`holiday-applicability.ts` is a `@deprecated` re-export shim (kept one release for back-compat). The regex exports `PTO_TITLE_RX` and `PERSONAL_HOLIDAY_TITLE_RX` on `_shared/ceo-behaviour/pto-holiday.ts` are also `@deprecated` re-exports — the definitions live in `availability-classifier.ts`. The predicates `isPtoOrHolidayTitle` / `isPersonalHolidayTitle` remain in `pto-holiday.ts` and are the recommended surface there.

A CI-gated Vitest guard (`src/__tests__/availabilitySsotShimImports.test.ts`) fails `npm test` if any file imports availability primitives from a deprecated path. Runtime `console.warn` in the shim files is the second layer.

Size ceiling convention: keep `availability-classifier.ts` under ~500 lines. If new rules push past that, split internals into an `availability/` sub-folder (`regex.ts` / `regions.ts` / `classifier-core.ts`) and keep the classifier file as the public re-export barrel — consumers keep one import path.

Precedence (first match wins):
1. Calendar work evidence (≥2 timed events with attendees or `isOrganizer`) → WORKDAY. Overrides weekend / PTO / holiday.
2. `explicitPto === true` → PTO. Travel never overrides PTO.
3. Applicable public holiday (region-qualified titles gated on `userCountry`; FYI subscription calendars gated on feed country) → PUBLIC_HOLIDAY.
4. Weekend day (default Saturday) → REST_DAY.
5. Otherwise → WORKDAY / LIGHT_ROUTINE by workload.

Workload signals (`calendarLoad === 'low'`, `events.length === 0`) NEVER decide rest days. They only split WORKDAY vs LIGHT_ROUTINE inside step 5.

Wired into `deriveStructuralDayFlags` and `_isPtoOrHoliday` in `generate-mastery-plan`. `pto-holiday.ts` `ptoActive()` reads an optional `availability` field on the rule context so Brief/Nudges can pass the SSOT result through when available.

`userCurrentCountry` seam is reserved for a future Travel SSOT — falls back to `userHomeCountry`. Consumers do not need changes when travel context is added.

Tests: `_shared/availability/availability-classifier.test.ts` covers the 13 scenarios from the ticket (empty weekday, foreign holiday, applicable holiday, PTO, Saturday, timed "Holiday Lunch", planner boundary, override cases, travel-flavoured cases).

`classifyDay(input)` is a thin adapter around `classifyAvailability` returning `{ state, isOffDay, reason }`. `isOffDay ⇔ state ∈ { PTO, PUBLIC_HOLIDAY, REST_DAY }`. Empty calendar days are NEVER off-days. This is the SINGLE function consumers must use to classify past/future dates (e.g. smart-nudges 14-day lookback). Any code deciding "is this day off?" from raw event rows / `events.length === 0` is a bug — route it through `classifyDay`.

## Known follow-ups (scheduled)

- **C1 (HIGH — fast-follow PR)** — `supabase/functions/build-executive-home-cards/day-type.ts` currently reimplements PTO / weekend / holiday / consecutive-off-days detection instead of calling `classifyDay`. It does NOT plumb `userHomeCountry`, so regional / FYI-foreign holidays are misclassified — the same input-shape bug already fixed in smart-nudges. Since `day-type.ts` output drives `allowedWindows` (window suppression) and `weekAheadReason` routing, this is plausibly affecting home-card selection for GB-ENG users on regional-holiday and post-long-weekend days today. Replace bespoke helpers with `classifyDay`; plumb `userHomeCountry` through `resolveDayTypeAndCadence`; add a regression fixture.
- **C2 (MEDIUM)** — `supabase/functions/_shared/events/event-classifier.ts` defines a local `AWAY_KEYWORDS` vocabulary. Route through `PTO_TITLE_RX` (or a documented superset regex) to eliminate drift.
- Delete the two shim files after one green release with zero CI failures and zero shim `console.warn` hits in production logs.