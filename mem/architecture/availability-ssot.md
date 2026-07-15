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
  **Status:** HOLD — branch-only, not merged pre-launch. High blast-radius orchestrator; land after launch stability behind a one-week feature flag.
- **C2 (MEDIUM) — LANDED 2026-07-15 (Path B, pre-launch)** — `supabase/functions/_shared/events/event-classifier.ts` no longer defines local `AWAY_KEYWORDS` / `OOO_KEYWORDS` / `TRAVEL_KEYWORDS` arrays. `detectDayKindFromEvents` now delegates to `isTravelTitle` (canonical travel SSOT at `_shared/ceo-behaviour/travel.ts`) and `isPtoOrHolidayTitle` (canonical PTO SSOT re-export). Legacy `'ooo'` return kind was folded into `'away-day'` — the SSOT PTO regex already matches OOO titles, and every downstream Smart Nudges consumer treated both as the same PTO branch. `PTO_TITLE_RX` itself was NOT widened; informal-title expansion (bare `\bAway\b`, bare `\bday\s*off\b`) was deferred because stress-testing found real false positives ("Team Away Day" — UK offsite; "Sign day off checklist" — sign-off collision). CI guard extended in `availabilitySsotShimImports.test.ts` to fail on any re-introduction of the forbidden keyword-array names under `supabase/functions/` (allowlist: SSOT + `event-subtypes.ts`).
- **C3 (LOW — watch, do not fix pre-launch)** — soft duplications of availability heuristics in `build-executive-home-cards/index.ts` and `generate-mastery-plan/index.ts`. Not parallel classifiers; recorded here for post-launch cleanup only.
- **C4 (LOW — watch, do not fix pre-launch)** — same category as C3, different call sites. Post-launch cleanup only.
- **Post-launch PR3 (informal-title expansion + `isAllDay` gate)** — deferred from PR2. Extends `PTO_TITLE_RX` with narrower informal patterns (title-anchored `^(?:my\s+|taking\s+(?:a|the)\s+)?day\s*off\b` and a suffix-anchored `away` variant), and adds an `isAllDay` gate to title-only PTO filters in `_shared/brief-signal-coverage.ts:203-211` and `build-executive-home-cards/day-type.ts:100,125`. The `isAllDay` gate is worth landing independently even without the regex change, because it closes a class of bug where a widened SSOT regex silently drops timed work events (e.g. a 9-5 "Team Away Day" offsite) from meeting counts.
- Delete the two shim files after one green release with zero CI failures and zero shim `console.warn` hits in production logs.

## Validation — 2026-07-14

End-to-end validation after breadcrumb pass (Option B: discoverability
comment + `README.md` added under `_shared/ceo-behaviour/`; physical
location of the SSOT unchanged).

| Stage | Command | Result |
| --- | --- | --- |
| Vitest shim-import guard | `npx vitest run src/__tests__/availabilitySsotShimImports.test.ts` | ✅ 2/2 |
| Deno SSOT tests | `deno test --no-check availability-classifier.test.ts availability-classifier-consolidation.test.ts availability-cross-surface.test.ts` | ✅ 31/31 |
| Grep — deprecated shim path | `rg "from .*availability/holiday-applicability" .` | Only the guard test's error string; zero real imports |
| Grep — regex symbols | `rg "PTO_TITLE_RX\|PERSONAL_HOLIDAY_TITLE_RX" .` | Only SSOT, its tests, the two shim files, docs/comments |
| Grep — applicability helpers | `rg "isApplicableHoliday\|parseHolidayRegionFromTitle\|isFyiHolidayCalendar\|matchesUserCountry" .` | Only SSOT, its tests, and the shim re-export |
| Consumer wiring — Brief | `brief-signal-coverage.ts` imports `classifyAvailability` from the SSOT (lines 27–30, 375, 938) | ✅ |
| Consumer wiring — Plan | `generate-mastery-plan/index.ts:64` imports `classifyAvailability` from the SSOT; used in `deriveStructuralDayFlags` / `_isPtoOrHoliday` (lines 4394, 6904, 7339) | ✅ |
| Consumer wiring — Nudges | `smart-nudges/index.ts:9–12` imports both `classifyAvailability` and `classifyDay` from the SSOT; used at lines 1339, 1610 | ✅ |
| Consumer wiring — ceo-behaviour | `pto-holiday.ts:22–24` re-exports SSOT regexes as `@deprecated` shims; predicates stay local | ✅ |
| Follow-ups still tracked | C1 (`build-executive-home-cards/day-type.ts`, HIGH) and C2 (`event-classifier.ts`, MEDIUM) present in this file | ✅ |

No parallel availability inference (no `events.length === 0` or
`calendarLoad === 'low'` off-day heuristics) found outside the SSOT in
any of the four consumers.