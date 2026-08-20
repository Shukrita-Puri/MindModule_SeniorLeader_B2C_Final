# Insights page — declutter and fix the weekly streak dots

## 1. Hide "Performance Streak · This Month"

The second trajectory card (Peak/Friction counts per dimension) is hidden behind a
`SHOW_PERFORMANCE_STREAKS` flag set to `false` — component and data stay intact so it can be
re-enabled later with a one-line change.

## 2. Rework "Your Performance Trajectory · This Week"

- Sub-label becomes **"Mental Readiness Streak · This Week"**.
- The header stops being the toggle. The open/close chevron moves to a full-width control at the
  **bottom of the card**, directly above the panel it opens (the Trend sparkline + 1W/1M/6M range
  picker). Same session-persisted expand state, same trend content.
- The **half dial is hidden** (flag `SHOW_INNER_READINESS_DIAL = false`, code kept) because the MRS
  number already appears on the executive home cards.
- With the dial gone, the M T W T F S S row uses the **full card width**: larger day letters and
  noticeably larger dots, evenly distributed across seven columns, today still ringed.
- No scoring, tier, colour or data logic changes.

## 3. Why Mon/Tue dots are empty — findings

This was checked against the live data for the account in the screenshots, this week:

```text
Mon 17 Aug  morning brief  score 58 (managing)   delivered_at = NULL   -> dot hidden
Tue 18 Aug  morning+evening  score NULL          delivered_at = NULL   -> no score at all
Wed 19 Aug  evening brief  score 38 (depleted)   delivered_at set      -> dot shows
Thu 20 Aug  today, live score                                          -> dot shows
```

There were no check-ins recorded on those days. So it is **both**:

- **Too strict attribution** on Monday — a real score of 58 exists but the card only reads briefs
  where `delivered_at` is set, so a generated-but-never-opened brief is dropped.
- **Genuinely no data** on Tuesday — no score was ever computed and no check-in exists.

To answer the direct question: a dot does **not** require both baseline and refined data. It
requires one delivered brief snapshot carrying a numeric score. That single condition is what is
hiding Monday.

**Fix:** the weekly dot row will fall back to any brief snapshot with a numeric score for that date
when no delivered one exists, and days that carry only a check-in (no brief) will colour from the
check-in composite already implemented in the component. Days with neither stay empty — no invented
data. The delivered-only rule stays untouched for the Trend sparkline and brief history.

## 4. Remove line borders

Insights and its detail pages follow the same no-line policy as the "Mental Performance Insights"
list: strip the detail-page sticky header bottom border and the outlines on card containers and
inner blocks, keeping separation through background tint and the existing soft shadow.

## 5. Move the share button onto the card

The share control leaves the detail page's top nav and sits **inside each card's title row, on the
same line as the (i) icon**, immediately to its left — for When You Perform Best, What Drains Your
Performance, What Restores Your Performance and the trajectory card. It keeps `data-share-hide`, so
the exported image still excludes the control itself and captures the currently active tab.

## Technical notes

- `src/components/insights/InnerReadinessDial.tsx` — copy, chevron relocation, dial flag, widened
  dot row, dot-source fallback.
- `src/pages/Insights.tsx` — `SHOW_PERFORMANCE_STREAKS` flag around `<PerformanceStreaks />`.
- `src/pages/InsightDetail.tsx` — remove header border + header share button; provide the capture
  ref and title through a small context so each card can render the share button in its own header.
- `src/components/insights/ShareCardButton.tsx` — unchanged behaviour, new mount point.
- Card files (`PerformanceRhythmCard`, `PerformanceCausalityCard`, `LeadershipPatternsCard`,
  `PracticeEffectiveness`) — share slot next to the existing `InsightInfoModal`, border removal.
- No edge function, engine, scoring or query-contract changes.
