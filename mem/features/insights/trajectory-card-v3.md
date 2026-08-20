---
name: Insights Trajectory Card v3
description: Insights page decluttering — hidden monthly streak card + half dial, "Mental Readiness Streak · This Week" week row, bottom toggle, inline share slot, no card borders
type: feature
---

/insights decluttering rules (user feedback: too much content):

- `PerformanceStreaks` ("Performance Streak · This Month") hidden behind `SHOW_PERFORMANCE_STREAKS = false` in `Insights.tsx`. Hidden, not deleted.
- `InnerReadinessDial`: half dial hidden behind `SHOW_INNER_READINESS_DIAL = false` (duplicates MRS on executive home). Week row uses the full card width — `text-[13px]` day letters, `w-7 h-7` dots.
- Sub-label is "Mental Readiness Streak · This Week" (never "Inner Readiness Streak").
- Expand/collapse control sits at the BOTTOM of the card, directly above the trend panel, labelled Show trend / Hide trend.
- Weekly dot attribution: any brief snapshot with a numeric score counts (delivered or not); if no snapshot exists, fall back to the day's check-in composite. Delivered-only still governs brief history + trend panel.
- Share button lives inline in each detail card's title row next to the (i) icon via `InsightShareSlot` — never in the detail page top nav.
- No line borders on Insights cards or the detail header (shadow-only elevation).

Trend panel v4 (2026-08-20):
- Ranges are 1M / 6M / 1Y (1W removed — the streak dots already cover the week). Default 1M.
  Bucketing: 1M daily, 6M weekly, 1Y monthly; empty buckets are gaps, never zeros.
- Header shows AVERAGE + value + range label instead of the word "Trend".
- Chart (`MrsSparkline` with `showMarkers`): open-circle markers on measured points, solid
  line between adjacent points, dotted connector across gaps, dotted baseline for empty ends.
- Single data source: `src/services/mrsDailySeries.ts` (brief snapshot scores averaged per
  local date, else the day's check-in composite) feeds BOTH the weekly dots and the chart.
  `mental_fitness_scores` is no longer read by the trend hook.
