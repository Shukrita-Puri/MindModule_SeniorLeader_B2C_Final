---
name: Canonical Availability SSOT
description: Single classifier deciding WORKDAY / LIGHT_ROUTINE / REST_DAY / PTO / PUBLIC_HOLIDAY. Consumed by Planner, Brief, Nudges.
type: architecture
---

Location: `supabase/functions/_shared/availability/availability-classifier.ts` + `holiday-applicability.ts`.

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