# Stress Load tab UI pass + calendar-month strip, plus a follow-up audit document

This run is UI only. No formulas, weights, thresholds, ranking or scoring change anywhere.

## 1. Section label matching the Burnout tab

The Burnout tab shows a small uppercase caption ("Weekly HRV trend") directly above its grid. Stress Load has no caption (the coral pill was removed last turn).

Add the same caption element above the Stress Load grid, reading **"Heart Rate x Event trend"** — identical size, letter-spacing, colour and position as the Burnout caption.

## 2. Fully readable category names, same grid size

Row labels ("Daily Rhythm & Ba…") are truncated at a fixed width. Change:

- row labels render on a single line, never wrapped and never ellipsed;
- the grid keeps its current cell sizes and overall footprint — nothing is enlarged;
- the label column stays inside the existing horizontal scroller, so the user scrolls the section sideways to read the full name.

No change to which rows appear, their order, or cell dimensions.

## 3. Show Monday through Sunday

The grid renders Mon–Fri only. Sunday is a working day in Israel and the Gulf, so the week should read Mon…Sun.

Front-end change: render seven day columns instead of five, with Sat and Sun showing the neutral "·" empty cell when the payload has nothing for them.

Note on the data side: the engine currently discards Saturday and Sunday events before any maths, so those two columns will stay empty until the engine's column set is widened. That is a change to which days are bucketed — not a formula change — but since this run is UI-only, I will leave it out and flag it as the first item in the follow-up document, ready to action on your word.

## 4. Calendar-month window for the trend strip (correction to the previous run)

The strip and share export currently load a rolling 30-day window ending today, which pulls in late-July days alongside August. Change both to the **current calendar month only**:

- window runs from the 1st of the current month (1 August 2026) through month end — no previous-month days;
- the export renders a single Monday-aligned block for that month, so the 1st lands on its true weekday (Saturday for August 2026);
- days after today render as dotted/outline placeholder pills for the remainder of the month, on both the strip and the export;
- strip header shows the month name, and the layout/auto-scroll pass re-runs after a share capture;
- identical across all four tabs (Clarity, Emotion, Pressure, Regulation).

## 5. Follow-up document (written after this run, no code)

A written reference covering the "What Drains Your Performance" card (Stress Load, Burnout Risk, Recovery Time) and the "When You Perform Best" card, so you can judge whether the metrics and maths are right. Contents:

- **Upstream sources** per tab: which tables and columns feed it (`calendar_events`, `wearable_data.hr_samples`, `resting_heart_rate`, `hrv`, `sleep_score`, `daily_checkins`, `brief_snapshots`), and which sync path populates each.
- **Downstream consumers**: which surfaces read the same stored payload (card UI, smart nudges via `causality_findings.signal_summary`, deep links).
- **Data duration** per tab: lookback window, minimum sample gates, confidence tiers, and behaviour when a source is missing.
- **Calculation walkthrough** in plain terms for each tab, including the exact per-event Stress Load maths (event-window peak HR minus resting baseline), the Burnout Risk four-dimension weekly mapping, and the Recovery Time derivation.
- **Open questions stated plainly**: Burnout Risk is a weekly rollup with no event attribution at all — it never says which events or day types drove the risk, and the "week" unit is an editorial choice rather than a derived one; Stress Load is a correlation, not causation (nothing controls for exercise, caffeine, or stacked meetings inside a window); the resting baseline is a window mean rather than a trailing pre-event baseline; weekend events are dropped today.
- **Verification appendix**: a read-only per-event dump from your account (date, weekday, category, event window, peak HR in window, resting baseline, delta, sample count) so on-screen cells can be reconciled against raw rows.

## Technical notes

- `src/components/insights/PerformanceCausalityCard.tsx` — add the caption above the Stress Load grid; in `DrainHeatmapGrid` swap the row-label `truncate` / `max-w-[7rem]` for `whitespace-nowrap` while keeping cell sizing untouched; render seven day columns.
- `src/components/insights/LevelTrendCalendar.tsx` — calendar-month range (1st → month end), dotted placeholder pills for future days, single Monday-aligned month block on share capture, auto-scroll re-run after capture.
- No edge function edits, no SQL, no deploys in this run.
- Verification: typecheck, build, existing insights tests, and Playwright screenshots of `/insights/performance-causality` (all three tabs) and `/insights/performance-rhythm` (all four tabs) on a mobile viewport.
