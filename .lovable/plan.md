# Share Export: Compact Month Grid for iOS

Scope guard: this is a presentation-only change. No data fetching, scoring, gating, ranking, thresholds, pattern rules or edge functions are touched. Same `days` data, same sentences, same tiers — only how the calendar is laid out during the iOS share capture.

## 1. iOS double screenshot

Confirmed: iOS app version 1.3 (86) already shares exactly one image. No changes to iOS share code, `Share.share` payload, or the single-flight lock are required. If any adjustments to `src/utils/shareInsightCard.ts` were introduced for the double-screenshot issue, they will be reverted to the 1.3 (86) behavior for iOS before the grid work lands, so the existing correct iOS behavior is preserved.

## 2. Compressing the export calendar

Current export renders one row per day — roughly 30 rows — which produces a very tall image.

Recommendation: **month grid, not a day list.** For the iOS share capture only, the calendar renders as a standard calendar month: 7 columns (Mon–Sun) x 5–6 week rows. Each day cell is a single small tile split into three thin horizontal stripes — morning, midday, evening — coloured with the same tier ramp used on screen.

```text
 Mon  Tue  Wed  Thu  Fri  Sat  Sun
 [=]  [=]  [=]  [=]  [=]  [ ]  [ ]     <- each tile = 3 stacked stripes
 [=]  [=]  [=]  [=]  [=]  [ ]  [ ]
 ...
```

Why this beats both the horizontal T-view and the day list:
- The whole month fits in about six rows, so the exported card is a portrait image a recipient reads without scrolling.
- Nothing is dropped: every day and all three windows are still present, just smaller.
- Week-over-week and weekday-vs-weekend rhythm becomes readable at a glance, which the linear day list actually hides.
- It matches the mental model people already have of a month, so a PA opening it cold understands it instantly.

Details:
- Day numbers in small type inside or above each tile; leading blanks for the days before the 1st so weekday columns line up.
- Future days keep the dashed treatment; no-check-in days keep the outlined white tile.
- A compact stripe legend (Morning / Midday / Evening) plus the existing tier legend sits under the grid.
- The pattern sentences underneath the chart are unchanged and still included in the export.
- On-screen behaviour is untouched — the horizontal week strip with scroll stays exactly as today.

If you would rather keep the day-list reading order, the fallback is a two-column split (days 1–15 left, 16–31 right), which halves the height but loses the weekday alignment.

## Technical notes

- Revert any iOS share-code changes introduced for the double-screenshot issue back to the 1.3 (86) baseline.
- `src/components/insights/LevelTrendCalendar.tsx` — replace the `shareCapturing` vertical day-list branch with a month-grid branch (presentation only, same `days` data).
- Verification: export all four cards on iOS and confirm a portrait image with the full month legible and exactly one attachment per share.
