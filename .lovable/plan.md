# Share Export: One Image + Compact Month Grid

Scope guard: this is a presentation-only change. No data fetching, scoring, gating, ranking, thresholds, pattern rules or edge functions are touched. Same `days` data, same sentences, same tiers — only how they are laid out for the export and how the share sheet is invoked.

## 1. Still two images in the share sheet

Confirmed on all four tabs of "When You Perform Best", and identical content in both attachments — so it is a duplicated invocation or a duplicated file, not two different parts of the card. The single-flight lock and the files-only native payload are already in place, so the cause is elsewhere and step one is diagnosis, not a blind fix.

Candidates to check, in order:
- Two share controls bound to the same card (the inline title button and the shared share slot), so one tap runs two captures.
- iOS firing both a touch and a click on the icon, with the lock already released because `Share.share` resolves as soon as the sheet is presented rather than after the send.
- The previous PNG still sitting in `Directory.Cache` under the same filename and being picked up alongside the new write.

Fix approach once identified: one share owner per card, a lock held until the share promise settles plus a short cool-down, and a unique per-capture filename with the prior cache file removed before writing.

Verification: export each tab of all four cards on device and confirm exactly one attachment per share.


## 2. Compressing the export calendar

Current export renders one row per day — roughly 30 rows — which produces a very tall image.

Recommendation: **month grid, not a day list.** For the share capture only, the calendar renders as a standard calendar month: 7 columns (Mon–Sun) x 5–6 week rows. Each day cell is a single small tile split into three thin horizontal stripes — morning, midday, evening — coloured with the same tier ramp used on screen.

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

- `src/components/insights/LevelTrendCalendar.tsx` — replace the `shareCapturing` vertical branch with a month-grid branch (presentation only, same `days` data).
- `src/utils/shareInsightCard.ts` — hold the lock through the full share promise plus cool-down, unique cache filename per capture with cleanup of the prior file.
- `src/components/insights/ShareCardButton.tsx` / share slot — ensure a single handler owner per card.
- Verification: export all four cards, confirm one attachment each and a portrait image with the full month legible.
