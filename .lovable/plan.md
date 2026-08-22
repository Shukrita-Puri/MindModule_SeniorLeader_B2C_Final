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

**a. On-screen strip shows the wrong dates after sharing.** The strip loads a 90-day window (so it legitimately contains July as well as August) and pins column widths via inline styles. The share routine clears those inline widths for the snapshot and restores them afterwards, but the layout pass that re-pins widths and re-scrolls to the current week does not re-run, so the strip lands on an earlier week (e.g. "Wed 1" = 1 July) after the share sheet closes.

Fix: re-run the layout/auto-scroll pass after a share capture ends, so the strip returns to the current week. Additionally show the month name in the strip header so a July column can never be mistaken for August.

**b. Share grid drops data and mislabels cells.** The export grid is built only from the current calendar month, so any day in the loaded 90-day window that falls outside this month is silently omitted, and days present in `days` but outside the current month never render.

Fix and audit:
- Build the export grid from the full loaded range, rendering one Monday-aligned month block per month present in the data (each block labelled with its month), instead of a single hard-coded current-month grid.
- Ensure every day cell resolves its three slot values from the same indexed data the on-screen strip uses, so a day coloured on screen is coloured identically in the export.
- Verify the leading blank offset per month block against the real weekday of the 1st (1 Aug 2026 = Saturday) so numbers land under the correct weekday column.
- Repeat the check across all four tabs (Clarity, Emotion, Pressure, Regulation) since they share this component.

## 4. Momentary "no data" flash on the Clarity chart

The calendar fetch treats an auth-token failure the same as "no rows": the token helper is timing out intermittently (visible in the console as `[authTokenService] Token retrieval failed: timeout`), the loader sets an empty day list, and the empty/unlock state paints until the next refresh succeeds.

Fix:
- Distinguish "no token / request failed" from "no data". On a token or request failure, keep any previously loaded days and retry once with a short backoff instead of rendering the empty state.
- Only render the unlock/empty state when a successful response genuinely contains no check-ins.
- While switching tabs or retrying, keep the skeleton rather than falling through to the empty state.

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
