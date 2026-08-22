# Four fixes: back buttons, sub-card styling, share chart accuracy, chart flash

## 1. Consistent back button on Profile and its sub-pages

Today the Insights sub-pages use a plain ghost chevron button in a light sticky header. Profile, Privacy, Terms, Connected Data and Refer all render `UnifiedTopBar`, which uses a `glass` button on a white bar with a bottom border — visually different.

Change:
- Make the `UnifiedTopBar` back control match the Insights one: ghost variant, `h-10 w-10 rounded-full`, `ChevronLeft` at `w-5 h-5`, same transparent/blurred header treatment (no solid white bar, no hard bottom border).
- Behaviour unchanged (`onBack` / `backPath` / `navigate(-1)` fallback stays exactly as is).
- Payment / subscription page (`Stage6Payment`): remove the visible word "Back" next to the chevron; keep the chevron, the click handler and `aria-label="Back"` for accessibility.

## 2. "When You Perform Best" sub-cards — remove the line, use surface + shadow

Sections A and B currently sit in `card-standard` boxes whose outline reads as a line against the white parent card.

Change (presentation only, inside `PerformanceRhythmCard.tsx`):
- Drop the border on both sub-cards.
- Give each a soft tinted surface from the existing palette (a subtle warm/neutral surface token, not white on white) plus a low-elevation shadow so they read as raised panels.
- Keep spacing, radius, headers, toggles, chart, bullets and collapse behaviour unchanged.

## 3. Share export of the trend chart — wrong month and missing days

Two separate defects to fix:

**a. Lock both views to a single 30-day window.** The strip currently loads a 90-day window, so it legitimately contains July as well as August — which reads as "the wrong month" because the columns look like one month. Longer 3M/6M/1Y ranges are out of scope for now.

Fix:
- Change all four tabs (Clarity, Emotion, Pressure, Regulation) to a 30-day lookback for both the on-screen strip and the share export, so the two always show the same days.
- Auto-scroll the strip to the current week within that 30-day range on load, and re-run the layout/auto-scroll pass after a share capture ends (the share routine clears the pinned inline column widths and the re-pin pass does not currently re-run, leaving the strip parked on an earlier week).
- Show the month name in the strip header so a column can never be mistaken for the wrong month.

**b. Share grid drops data and mislabels cells.** The export grid is built only from the current calendar month, so days inside the loaded window that fall in the previous month are silently omitted.

Fix and audit:
- Build the export grid from the same 30-day loaded range, rendering a Monday-aligned block per month present in that range (each labelled with its month) rather than a hard-coded current-month grid.
- Ensure every day cell resolves its three slot values from the same indexed data the strip uses, so a day coloured on screen is coloured identically in the export.
- Verify the leading blank offset per block against the real weekday of the 1st (1 Aug 2026 = Saturday) so numbers land under the correct weekday column.
- Repeat the check across all four tabs since they share this component.

## 4. Momentary "no data" flash on the Clarity chart

The calendar fetch treats an auth-token failure the same as "no rows": the token helper is timing out intermittently (visible in the console as `[authTokenService] Token retrieval failed: timeout`), the loader sets an empty day list, and the empty/unlock state paints until the next refresh succeeds.

Fix:
- Distinguish "no token / request failed" from "no data". On a token or request failure, keep any previously loaded days and retry once with a short backoff instead of rendering the empty state.
- Only render the unlock/empty state when a successful response genuinely contains no check-ins.
- While switching tabs or retrying, keep the skeleton rather than falling through to the empty state.

## 5. Audit: Clarity and Regulation patterns read identically

The Clarity and Regulation tabs currently show word-for-word equivalent findings ("3 Fridays in a row…", "thursdays run your sharpest / most regulated — 100% vs 75% on Saturdays", "evenings … 100% vs 80%"), differing only in the dimension tag. This is unverified as either a genuine data coincidence or a tagging/reuse bug, so the first step is a data audit, not a code change.

Audit steps (read-only, before any fix):
- Pull the raw `daily_checkins` rows for the account and compare `clarity_level` against `regulation_level` day by day. If the two columns are literally the same values, the sentences are correct and the finding is real (the miner reduces each dimension to a "top band" flag, so two dimensions with identical values must produce identical percentages).
- If the raw values differ but the output percentages match, trace the miner: confirm each dimension is mined from its own column via the dimension→column map, that the per-dimension results are keyed separately, and that no shared/mutated accumulator or cached series is being reused across dimensions.
- Confirm nothing in the pipeline is falling back to placeholder or synthetic values when a dimension has sparse data.

Outcome:
- If it is a genuine coincidence, no code change; optionally suppress a duplicate line when two dimensions produce an identical sentence with identical numbers, so the card does not read as repeated.
- If it is a tagging/reuse bug, fix the miner so each dimension is derived strictly from its own column, and add a unit test that feeds two clearly different dimension series and asserts the resulting sentences differ.

Findings will be reported before any change is applied.

## Files touched


- `src/components/navigation/UnifiedTopBar.tsx`
- `src/pages/onboarding/stages/Stage6Payment.tsx`
- `src/components/insights/PerformanceRhythmCard.tsx`
- `src/components/insights/LevelTrendCalendar.tsx`
- `src/utils/shareInsightCard.ts` (post-capture layout restore hook only)

No edge functions, no SQL, no scoring or ranking logic changes.

## Verification

- Typecheck and build.
- Existing insights tests.
- Playwright: Profile + a profile sub-page and an insights sub-page screenshots to confirm identical back controls; payment page shows chevron with no "Back" text.
- Playwright: `/insights/performance-rhythm` on mobile and desktop, one per tab — sub-card styling, share snapshot showing every loaded day with correct weekday alignment, and the strip still on the current week after sharing.
