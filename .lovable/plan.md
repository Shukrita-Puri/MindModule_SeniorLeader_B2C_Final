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

## 2. Deterministic copy bank for titles and why lines

New module `supabase/functions/_shared/plan/copy-bank.ts`:

- Keyed by `(eventTypeKey | A–H category, arcPosition/role)` where the type key comes from
  `normalizeEventTypeKey()` / the A–H resolver and the role from the existing
  Protect / Prevent / Prepare / Build valence in `why-signals.ts`.
- Each entry supplies a title template (WHAT + HOW, ≤8 words) and a why template with
  evidence slots filled from the tiered evidence bundle (Pattern > Behavioural >
  Immediate > Strategic), ≤15 words, obeying `copy-contract.ts`.
- A generic-by-role fallback row for unmatched event types, plus a state-only row for
  no-calendar days, so **every** slot resolves to non-empty copy.

Wiring in `generate-mastery-plan/index.ts`:
- Why LLM stays primary. On rejection/timeout/empty, the repair path resolves the copy bank
  first, then the existing `composeEvidenceWhyLine` / `composeWhyLine` chain only if the
  bank has no row (it always will, via the generic row).
- Remove the three hard-coded string fallbacks at lines 8273–8277 in favour of bank rows.
- Slot titles use the bank when the LLM title is rejected, so we stop emitting the
  identical "Land recovery to close the day" across days.
- De-duplication: if two slots resolve to the same bank row, the second takes that row's
  alternate variant, so the three cards never repeat verbatim (the screenshot showed the
  same why line three times).
- Log `whySource: 'llm' | 'copy_bank' | 'composed'` in the existing selection-provenance
  log.

Tests: bank coverage test (every role × every A–H category resolves), contract-validator
test (all rows pass `validateWhyContract`), and a no-repeat test across three slots.

## 3. Mobile iOS slot layout

`src/components/home/TodayThreePriorities.tsx` only — presentation change:

- Title (line 2617): drop `line-clamp-2`, keep `break-words`, bump to
  `text-[17px] md:text-[16px] leading-snug` on mobile.
- Why line: full text, no clamp, `text-[15px] leading-relaxed` on mobile.
- Practice row (line 2940/2953): remove `line-clamp-2` / `line-clamp-3`, stack
  label → title → meta in a single tight column (`flex-col gap-1`) rather than the
  current side-by-side row on narrow widths; bump practice title to `text-[15px]` and
  meta to `text-[13px]`.
- Tighten vertical rhythm between the three blocks so the taller text does not inflate the
  card (`space-y-2` inside the block, unchanged outer padding).
- Desktop sizes unchanged via `md:` prefixes.

## Deployment

After the edits: deploy `generate-mastery-plan`, `compute-outer-readiness`, and
`smart-nudges`; run the Deno plan tests and the frontend vitest suite.
