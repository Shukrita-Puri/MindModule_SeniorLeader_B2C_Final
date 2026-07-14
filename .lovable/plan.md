# Availability SSOT — Consolidation (v3, gaps closed)

## What changed from v2

Three questions from the reviewer, all with concrete findings from re-reading the code:

1. **C1 downstream consumption + severity** — investigated. C1 is **High severity, likely already user-facing**. Scheduling changed from "unprioritized follow-up" to "fast-follow PR immediately after this one".
2. **CI wiring** — investigated. The repo has **no `.github/workflows/`** and `npm test` runs `vitest run` only; Deno tests are not gated on merge. The enforcement test is therefore rewritten as a **Vitest** file-scan (Node `fs`) so it runs under `npm test`, the actual merge gate.
3. **Frontend re-audit** — per-file evidence added below.

## 1. C1 severity assessment (was "follow-up, out of scope")

**Consumers of `day-type.ts` output (`build-executive-home-cards/index.ts`):**

- `dayTypeDecision.allowedWindows` — line 540: cards are **suppressed** when the current window isn't in the allowed set (e.g. PTO → morning only; light day → no afternoon regen). A wrong day-type actively silences an entire notification window.
- `dayTypeDecision.dayType` — persisted onto the card row (lines 558, 880) and read downstream by the UI as the canonical card kind.
- `dayTypeDecision.weekAheadReason` — routes into the Week-Ahead card path with `last_day_pto` / `last_day_holiday` / `last_day_long_weekend` reasons.

**How the bug manifests today:**

`day-type.ts` calls `evaluateWeekAheadMode` with `consecutiveOffDaysBefore` hydrated by a bespoke lookback that does not go through `classifyDay`, and with `ptoTodayAllDay` derived from a title-regex-only helper that ignores `userHomeCountry`. This is the **same input-shape bug** we just fixed in smart-nudges. For `shukrita@mindmodule.me` on Mon 6 Jul and Tue 14 Jul, home-cards would have received the same inflated `consecutiveOffDaysBefore` and the same `last_day_long_weekend` route that smart-nudges did — meaning the executive-home surface almost certainly showed a Week-Ahead card on those workdays and suppressed the afternoon regen window. This is not theoretical; it is the same user-visible symptom the original bug report described, on a different surface.

**Severity: High. Schedule: fast-follow PR immediately after this one, not indefinite.**
Scope of that fast-follow (recorded now so it isn't lost): replace `isPtoAllDayToday` / `isPtoAllDayTomorrow` / `isLightCalendarDay` / bespoke weekend + `consecutiveOffDaysBefore` walk with `classifyDay`; plumb `userHomeCountry` through `resolveDayTypeAndCadence`; add a regression fixture for the GB-ENG + N. Ireland holiday case.

This PR still does not change home-cards behaviour — but the follow-up ticket is now sized and prioritised, not deferred.

## 2. CI wiring — confirmed and corrected

- **`.github/workflows/` does not exist.** No GH Actions pipeline gates merges.
- **`npm test` = `vitest run`** (from `package.json`). Vitest is the only test runner that runs in the current merge path.
- **Consequence:** a `deno test` file is NOT automatically enforced. The v2 plan's `no-shim-imports.test.ts` as a Deno test would have been theoretical.

**Fix in this PR:** implement the enforcement as a **Vitest** test at `src/__tests__/availabilitySsotShimImports.test.ts` using Node `fs` + `fast-glob` (already transitively available; falls back to `readdirSync` recursion if not). It walks every `.ts` / `.tsx` under `supabase/functions/` and `src/`, and fails if any file — except the two shim files themselves — imports:

- `holiday-applicability` (any path)
- `PTO_TITLE_RX`, `PERSONAL_HOLIDAY_TITLE_RX`, `parseHolidayRegionFromTitle`, `isFyiHolidayCalendar`, `matchesUserCountry`, `isApplicableHoliday`, or `RegionToken` from any path other than `_shared/availability/availability-classifier`

Because it lives under Vitest, `npm test` (i.e. the actual PR gate) fails on drift. This is the real belt-and-suspenders CI gate the reviewer asked for; the `console.warn` runtime signal in the shim files remains as the second layer.

Also in scope: add a small `README` note under `.github/BUG_FIX_PROMPT.md` (or a new `.github/CONTRIBUTING.md` line) stating "`npm test` must pass before merge; it runs the shim-import guard." This documents the invariant so a future contributor doesn't disable it.

## 3. Frontend re-audit — per-file evidence (not just "server-driven")

- **`src/hooks/useWeekAheadMode.ts`** — the only client-side date-conditional is a fallback: when `serverDecision` is `undefined`, `active` returns `true` iff `dow === 0` (Sunday). This does not infer PTO/holiday/off-day status; it only mirrors the always-safe Sunday branch of the server predicate and can never fire the `last_day_*` misfire class. When `serverDecision` is defined (the production path), it is the sole source. Verified by reading lines 40–52. No parallel classifier.
- **`src/components/home/WeekAheadPriorities.tsx`** — copy dictionary only (`REASON_COPY` keyed on the server-provided `reason` string). No `Date`, `getDay()`, `holiday`, or `pto` conditional. Confirmed via `rg` — the only hits are literal copy strings.
- **`src/components/insights/PerformanceRhythmCard.tsx`** — `getDay()` usage (lines 543, 561, 973–980, 1050, 1276) is purely analytics: bucketing check-ins into weekday vs weekend for a rhythm chart on the Insights page. It does not gate cards, nudges, notifications, or any availability decision. It reads persisted `checkin_date` values, not "is today off". Not a classifier.
- **`src/utils/rules/calendar-merge.ts`** — the `holiday` match is inside a dedupe/merge path over calendar events; it is a string containment check for merging duplicate rows, not an availability decision. No `isPto`, `getDay`, or off-day inference. Not a classifier.

Conclusion: no frontend file computes availability independently of the server payload. The `useWeekAheadMode` Sunday fallback is the only client-side date branch, and it is correctness-safe.

## Canonical definitions (unchanged from v2)

Written into `availability-classifier.ts` and referenced by Brief, Plan, Nudges — no consumer may re-derive:

- Off-day = SSOT state ∈ {PTO, PUBLIC_HOLIDAY (applicable to user's home country only), REST_DAY (weekend)}. Empty calendar ≠ off-day.
- Weekend ≠ long weekend.
- Last day of PTO / holiday / long-weekend predicates require `todayIsOffDay === true`.
- FYI foreign-region holidays are non-events.

## Changes in this PR (final)

1. **`_shared/availability/availability-classifier.ts`** — absorb `holiday-applicability.ts` and the two title regexes from `ceo-behaviour/pto-holiday.ts`. Exports unchanged.
2. **`_shared/availability/holiday-applicability.ts`** — reduced to `@deprecated` re-export shim with a one-line, idempotent `console.warn` gated on `globalThis.__availShimWarned_holidayApplicability`.
3. **`_shared/ceo-behaviour/pto-holiday.ts`** — regex definitions moved out; file re-exports them from the classifier with the same warn pattern. `isPtoOrHolidayTitle` / `isPersonalHolidayTitle` stay here (many callers), internally referencing the re-exports.
4. **`src/__tests__/availabilitySsotShimImports.test.ts`** (Vitest) — the CI-gated shim-import guard described in §2.
5. **`_shared/availability/availability-classifier-consolidation.test.ts`** (Deno) — verifies every symbol still exports from the consolidated file and produces the expected values for: PTO title match, N. Ireland vs GB-ENG (non-applicable), England & Wales vs GB-ENG (applicable), FYI UK feed for GB (applicable), FYI foreign feed for GB (non-applicable), `classifyDay` on empty weekday (`isOffDay=false`), `classifyDay` on Saturday (`isOffDay=true`).
6. **`mem/architecture/availability-ssot.md`** — updated to state: single-file location, shim policy, empty calendar ≠ off-day, ~500-line size ceiling + `availability/` sub-folder split path when it's hit, C1 and C2 recorded as scheduled follow-ups (C1 = High, immediately after this PR; C2 = Medium).
7. **`.github/CONTRIBUTING.md`** — new short note: `npm test` gates merge and runs the shim-import guard.

## Consumer wiring — audit only, no code changes

Confirmed against source in v2 and re-verified: Plan (`generate-mastery-plan`), Brief (`_shared/brief-signal-coverage`), Smart Nudges (`smart-nudges/index.ts`), `evaluate-week-ahead-mode`, and `scripts/dry-run-week-ahead.ts` all route through `classifyAvailability` / `classifyDay`. No off-day inference from raw event rows in any consumer.

## Diff shape (approx.)

```text
availability-classifier.ts                          +160 / -3
holiday-applicability.ts                             +10 / -140
ceo-behaviour/pto-holiday.ts                          +8 / -6
availability-classifier-consolidation.test.ts        +90 / 0   (new, deno)
src/__tests__/availabilitySsotShimImports.test.ts    +60 / 0   (new, vitest, CI-gated)
.github/CONTRIBUTING.md                              +10 / 0   (new)
mem/architecture/availability-ssot.md                +22 / -2
```

Zero changes to Brief, Plan, Smart Nudges, home cards, event-classifier, or any UI code.

## Verification

1. `npm test` — must pass; `availabilitySsotShimImports.test.ts` is part of the gate.
2. `deno test` on the four availability test files locally — must pass.
3. `rg "events\.length === 0|calendarLoad === 'low'"` under `supabase/functions/` — no off-day inference outside the classifier.
4. Manual re-check of the three consumer files to confirm no logic changed.
5. Runtime spot-check after deploy: any lingering shim import surfaces as a single `[availability-shim]` warn per cold start in edge-function logs.

## Follow-ups (recorded, scheduled)

- **C1 — HIGH, fast-follow PR** — `build-executive-home-cards/day-type.ts`: replace `isPtoAllDayToday` / `isPtoAllDayTomorrow` / `isLightCalendarDay` / bespoke `consecutiveOffDaysBefore` walk with `classifyDay`; plumb `userHomeCountry` through `resolveDayTypeAndCadence`; add regression fixture. Same class of bug as the smart-nudges misfire and plausibly already affecting GB-ENG users on regional/FYI-foreign holidays and post-weekend workdays.
- **C2 — MEDIUM** — `_shared/events/event-classifier.ts`: replace `AWAY_KEYWORDS` local vocabulary with `PTO_TITLE_RX` (or a documented superset). Vocabulary drift risk, no known active user-facing symptom.
- Delete shim files after one green release with zero CI warnings + zero shim `console.warn` hits in production logs.
- Travel SSOT (out of scope, seam reserved via `userCurrentCountry`).
