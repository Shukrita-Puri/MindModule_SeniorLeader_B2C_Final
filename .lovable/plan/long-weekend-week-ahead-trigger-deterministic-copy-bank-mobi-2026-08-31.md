# Long-weekend Week-Ahead trigger, deterministic copy bank, mobile slot layout

## 1. Why Mon 31 Aug (UK bank holiday, last day of long weekend) missed Week-Ahead

Confirmed by reading the code:

- `supabase/functions/generate-mastery-plan/index.ts:9767` builds the response's
  `weekAheadDecision` by calling `evaluateWeekAheadMode({ dayOfWeek, homeCountry, localHour, manualOverride })`
  only. None of `ptoTodayAllDay`, `holidayAllDayEventToday`, `tomorrowIsWorkday`,
  `isLastDayOfLongWeekend` are passed, so branches 2–4 of the waterfall can never fire
  from the Plan. On a Monday, `dayOfWeek !== planningDayOfWeek('GB')` → inactive.
- The internal call at `index.ts:8533` hard-codes `ptoTodayAllDay: false`,
  `holidayAllDayEventToday: false`, `tomorrowIsWorkday: false` with a comment saying it
  lacks tomorrow's availability.
- `supabase/functions/compute-outer-readiness/index.ts:3680` calls the same predicate with
  only `dayOfWeek`/`localHour`, so the Brief never flips its driver to `week_recap` on a
  holiday and instead narrated generic weekend copy on a Monday.
- Only `smart-nudges` hydrates the full input set (`index.ts:2225`, `4527`) using
  `classifyDay()` + `isLastDayOfLongWeekend()` from the Availability SSOT.

### Fix

Extract the hydration that already exists in `smart-nudges` into a shared helper
(`supabase/functions/_shared/availability/week-ahead-hydration.ts`) that, given the user's
events, locale and local now, returns
`{ ptoTodayAllDay, ptoTomorrowAllDay, holidayAllDayEventToday, tomorrowIsWorkday, isLastDayOfLongWeekend, todayIsOffDay }`
using `classifyDay()` over a bounded ±1/-14 day window (no new detection logic, no new
holiday source — same feed-based classifier).

Then:
- `generate-mastery-plan`: hydrate once in `buildSharedContext` and feed both the
  `deriveStructuralDayFlags` call (8533) and the response `weekAheadDecision` (9767).
- `compute-outer-readiness`: hydrate and pass the same inputs so
  `driver = 'week_recap'` fires on end-of-long-weekend / end-of-holiday, and the
  deterministic brief gets a "last day of the long weekend / back tomorrow" frame instead
  of weekend copy on a Monday.
- `smart-nudges` switches to the shared helper (behaviour unchanged).

Tests: extend `week-ahead-mode.test.ts` with a UK Mon-bank-holiday fixture (Sat REST,
Sun REST, Mon PUBLIC_HOLIDAY, Tue workday) asserting `end_of_public_holiday` precedence and
`end_of_long_weekend` for the PTO-adjacent variant; add a hydration unit test.

## 2. Deterministic copy bank from the existing TypeScript (no new engine)

The deterministic bank already exists in code — it is just not the guaranteed fallback.
Reuse it rather than adding a parallel module:

- `_shared/plan/title-prefixes.ts` — `buildPriorityTitle({ slotAnchor: { eventTitle, categoryId, phase }, isTomorrow, practicePriorityTag })`,
  plus `verbForCategoryPhase()` (A–H × pre/during/post) and `executiveObjectiveFor()`.
  This is already a full A–H × arc-position title bank with a window-aware
  state-management fallback when there is no event.
- `_shared/plan/why-signals.ts` — tiered evidence bundle + Protect / Prevent /
  Prepare / Build role, and `composeEvidenceWhyLine()`.
- `_shared/plan/copy-contract.ts` — `validateWhyContract()` and the Title/Why shape rules.
- `generate-mastery-plan/index.ts:7589` `composeWhyLine()` — last-resort composer.

Changes:
- Extend `title-prefixes.ts` and `why-signals.ts` with the missing rows only (A–H ×
  pre/during/post × role, each with a second variant string) so every combination
  resolves without invention. No new file, no new resolution path.
- Make the resolution order explicit and total in `generate-mastery-plan`:
  Why LLM → `composeEvidenceWhyLine()` (evidence bundle) → role/category row →
  `composeWhyLine()`. The chain can no longer end empty; the same order applies to
  titles via `buildPriorityTitle()` when the LLM title is rejected.
- Delete the three hard-coded fallback strings at `index.ts:8273–8277` and route those
  cases through `buildPriorityTitle`/`why-signals` instead.
- De-duplicate across the day's three slots: if two slots resolve to the same row, the
  second uses that row's alternate variant, so the cards never repeat verbatim (the
  screenshot shows the same why line three times).
- Log `whySource: 'llm' | 'evidence' | 'category_row' | 'composed'` in the existing
  selection-provenance log.

Tests: extend `priority-title.test.ts` for full A–H × phase × role coverage; add a
why-line coverage test (every combination non-empty and passing `validateWhyContract`)
and a no-repeat-across-three-slots test.


## 3. Mobile iOS slot layout — DEFERRED

Not part of this change. `src/components/home/TodayThreePriorities.tsx` stays as-is;
the stacked, unclamped mobile column is a follow-up.


## Deployment

After the edits: deploy `generate-mastery-plan`, `compute-outer-readiness`, and
`smart-nudges`; run the Deno plan tests and the frontend vitest suite.
