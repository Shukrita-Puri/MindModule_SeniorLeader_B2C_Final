# Canonical Rest Day & Availability SSOT

## Goal

Replace scattered "rest day" heuristics with one shared classifier. Empty weekday calendars stop becoming Rest Days. Regional/FYI holidays stop suppressing productivity. Explicit calendar work overrides passive rest signals. Design admits future Travel SSOT without changing consumers.

## Canonical model

New shared module: `supabase/functions/_shared/availability/availability-classifier.ts`

```ts
export type AvailabilityState =
  | 'WORKDAY'         // normal working day
  | 'LIGHT_ROUTINE'   // working, empty/light calendar
  | 'REST_DAY'        // weekend, no work evidence
  | 'PTO'             // approved leave, no work evidence
  | 'PUBLIC_HOLIDAY'; // applicable holiday, no work evidence

export interface AvailabilityInput {
  now: Date;                                // user local time
  weekendDays?: number[];                   // default [6] (Sat)
  userHomeCountry?: string | null;          // profiles.country
  userCurrentCountry?: string | null;       // reserved for Travel SSOT; falls back to home
  events: Array<{
    title: string;
    startTime: string; endTime: string;
    isAllDay?: boolean;
    isOrganizer?: boolean;
    attendeesCount?: number;
    source?: string | null;
    calendarSummary?: string | null;        // e.g. "Holidays in United Kingdom"
  }>;
  explicitPto?: boolean;                    // user-approved leave signal (future onboarding/UI)
}

export interface AvailabilityResult {
  state: AvailabilityState;
  isRestDay: boolean;                       // true only for REST_DAY | PTO | PUBLIC_HOLIDAY
  workEvidence: { meetingCount: number; hasWorkMeetings: boolean };
  holiday: { detected: boolean; applicable: boolean; title?: string; scope?: string };
  reason: string;                           // audit string
}
```

### Canonical override precedence

Evaluated top-down. First match wins. Workload never enters availability decisions — only shapes workload state after WORKDAY is chosen.

1. **Calendar work evidence** — ≥2 timed events with attendees or `isOrganizer=true` → `WORKDAY`. Overrides weekend / PTO / holiday. (Covers: Saturday with client meetings, PTO with work meetings, holiday with work meetings, travelling-for-work while home region has a holiday.)
2. **Explicit user intent** — `explicitPto === true` → `PTO`. Travel never overrides PTO.
3. **Applicable public holiday** — see applicability rules below → `PUBLIC_HOLIDAY`.
4. **Weekend day** (`weekendDays`, default Saturday) → `REST_DAY`.
5. **Workload split** — `events.length === 0 || calendarLoad low` → `LIGHT_ROUTINE`. Otherwise `WORKDAY`.

### Holiday applicability

`_shared/availability/holiday-applicability.ts`:
- `parseHolidayRegionFromTitle(title)` — extracts `(N Ireland)`, `(Scotland)`, `US`, etc.
- `isFyiHolidayCalendar(event)` — matches `Holidays in <Country>` subscription summaries.
- `matchesUserCountry(region, userCountry)` — GB umbrella vs GB-NIR/GB-SCT/GB-ENG mapping table.
- All-day requirement: only all-day events with PTO/holiday regex titles feed step 3. Timed events with "holiday" in title (e.g. "Holiday Lunch", "School Holiday Reminder") never trigger REST_DAY.

Applicability uses `userCurrentCountry ?? userHomeCountry`. Today `userCurrentCountry` is unset; when Travel SSOT ships it populates that field only — classifier untouched.

## Behavioural scenarios covered

**Calendar-aware overrides**
- Saturday with ≥2 work meetings → `WORKDAY` (step 1 beats step 4).
- PTO day with ≥2 work meetings → `WORKDAY` (step 1 beats step 2).
- Applicable holiday with ≥2 work meetings → `WORKDAY` (step 1 beats step 3).
- Saturday, no meetings → `REST_DAY`.
- PTO, no meetings → `PTO` (rest-day).
- Applicable holiday, no meetings → `PUBLIC_HOLIDAY` (rest-day).

**Travel-flavoured scenarios (no Travel SSOT built here)**
- Travelling for work, home region has a bank holiday, calendar has ≥2 meetings → `WORKDAY` via step 1. No location knowledge required.
- Travelling on approved Annual Leave → `PTO` via step 2 (explicit intent). Travel does not override.
- User travelling across time zones → classifier already receives `now` in user local time; consumers pass current-tz `now`. No classifier change needed.
- User working remotely from another country → when Travel SSOT populates `userCurrentCountry`, applicability step 3 uses that automatically; today the calendar-work-evidence override handles the common case.

## Consumer changes

### 1. Planner — `supabase/functions/generate-mastery-plan/index.ts`
- `deriveStructuralDayFlags` (L7138) — replace `hasRestSignals = calendarLoad === 'low' && events.length === 0` with `availability.isRestDay`.
- Call sites at L7412 / L7421 / L7471 pass through availability result.
- Persist `availability_state` in `mastery_plan_snapshots.meta` for observability.

### 2. Brief — `supabase/functions/_shared/brief-signal-coverage.ts`
- `hasPtoMarker` / `personalHolidayInferred` (L236, L456, L470) gated on `availability.state === 'PUBLIC_HOLIDAY' || 'PTO'`.
- `_shared/ceo-behaviour/pto-holiday.ts` `holidayReducedTouch` / `ptoWithMeetingFallback` — `ptoActive()` reads availability instead of raw title regex.

### 3. Smart Nudges — `supabase/functions/smart-nudges/index.ts`
- `dayShape === 'rest_day'` and `_isPtoOrHoliday` gates (L1891/1914 `buildDayShapeLine` + suppression sites) read from availability.

### 4. Shared PTO helpers
- `PTO_TITLE_RX` kept for tokenization only.
- Direct callers of `isPtoOrHolidayTitle` / `isPersonalHolidayTitle` for rest-day gating are removed. Signal-pill copy paths retain them.

## User country capture

`profiles.country` already exists. Planner, Brief and Nudges read it via existing profile joins. No migration, no onboarding UI in this ticket. Null country → any region-qualified holiday title is treated as non-applicable (safer default: assume irrelevant), and FYI subscription calendars are also treated as non-applicable.

## Files changed

**New**
- `supabase/functions/_shared/availability/availability-classifier.ts`
- `supabase/functions/_shared/availability/holiday-applicability.ts`
- `supabase/functions/_shared/availability/availability-classifier.test.ts`

**Modified**
- `supabase/functions/generate-mastery-plan/index.ts`
- `supabase/functions/_shared/brief-signal-coverage.ts`
- `supabase/functions/_shared/ceo-behaviour/pto-holiday.ts`
- `supabase/functions/smart-nudges/index.ts`

**Not modified**
- Allocator (`_shared/jit/slot-allocator.ts`) — still takes `hasRestSignals` boolean; only derivation changes.
- Travel logic, notification pipeline, APIs, client code.

## Test coverage (Deno)

Required scenarios:
1. Monday, empty calendar → `LIGHT_ROUTINE`, `isRestDay=false`.
2. Monday, "Bank Holiday (N Ireland)" all-day, `userHomeCountry='GB-ENG'` → `WORKDAY`.
3. Monday, applicable England Bank Holiday all-day, `userHomeCountry='GB-ENG'` → `PUBLIC_HOLIDAY`.
4. Monday, `explicitPto=true`, no meetings → `PTO`.
5. Saturday, no meetings → `REST_DAY`.
6. "Holiday Lunch" timed event only → `LIGHT_ROUTINE` (not rest).
7. Empty weekday → `hasRestSignals=false` at planner boundary.

Calendar-aware override scenarios:
8. Saturday, 3 client meetings → `WORKDAY`.
9. `explicitPto=true` with 3 work meetings → `WORKDAY`.
10. Applicable holiday with 3 work meetings → `WORKDAY`.

Travel-flavoured scenarios:
11. Applicable home-region holiday, `userCurrentCountry` differs, 3 meetings → `WORKDAY` (step 1).
12. `explicitPto=true` while travelling, no meetings → `PTO` (travel never overrides PTO).
13. `userCurrentCountry` set, home holiday no longer applicable → `WORKDAY`/`LIGHT_ROUTINE` per workload.

Existing tests: `generate-mastery-plan/ledger-evolution.test.ts` and `slot-allocator.test.ts` remain valid — they pass `hasRestSignals` explicitly to the allocator.

## Rollback

Revert the four modified files and drop `_shared/availability/`. No schema changes.

## Out of scope

- Travel SSOT (populating `userCurrentCountry` from location pings).
- Onboarding UI for country/region confirmation.
- Explicit-PTO capture UI (`explicitPto` seam ships but has no producer yet — planner continues passing `undefined`).
- Bug 1/2/3 Stage 2 follow-ups.
