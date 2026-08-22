# Stress Load tab: header, readable rows, Mon–Sun week, and an HR-vs-event audit

## 1. Section label matching the Burnout tab

The Burnout tab shows a small uppercase caption ("Weekly HRV trend") directly above its grid. Stress Load currently has no caption (the coral pill was removed last turn).

Add the same caption element above the Stress Load grid, reading **"Heart Rate x Event trend"** — identical size, letter-spacing, colour and position as the Burnout caption.

## 2. Fully readable category names

Row labels ("Daily Rhythm & Ba…") are truncated by a fixed max width. Change to:

- row labels never wrap and never truncate (single line, full text);
- the grid keeps its horizontal scroll, so the user scrolls the section sideways to read long names;
- table sizes to content instead of stretching to the card width.

No change to which rows appear or their order.

## 3. Show Monday through Sunday

Today the engine builds a Mon–Fri week and drops weekend events entirely (Sat/Sun are discarded before any HR maths). Extend to a full 7-column Mon–Sun week so Israel and Gulf working weeks are represented:

- day labels become Mon…Sun;
- Sunday and Saturday events map to their own columns instead of being skipped;
- the "heaviest day" summary is computed across all seven days.

Columns with no data still render as the neutral "·" cell, so users without weekend events see no change in meaning.

## 4. Audit: how Stress Load derives HR-vs-event

Confirmed from the engine source (`cause-effect-engine`, ENGINE_VERSION 3) — Stress Load is heart rate only, no HRV:

```text
resting baseline = mean(wearable_data.resting_heart_rate) over the 30-day window
                   (requires >= 3 days, else the whole matrix is null)

for each calendar event with start_time and end_time:
    samples = wearable_data.hr_samples for the event's local calendar date
    if no samples that day -> event skipped (no day-max proxy, honest gap)
    peak = max(sample.v) where event.start <= sample.t <= event.end
    if peak <= 0 -> skipped
    delta = peak - resting baseline          <- the bpm number in each cell

cell value = round(mean(all deltas for that day-of-week x event category))
n          = number of events contributing
confidence = strong / emerging by occurrence count thresholds
```

Columns are the top 7 event types by number of distinct days, classified by the shared A–H `classifyEvent` resolver (attendee-count fallback). HRV is used only by the Burnout tab; it never touches the Stress Load matrix.

Two honesty caveats worth naming: the value is a **correlation** (event-window peak HR elevation vs personal resting baseline), not proven causation — nothing controls for exercise, caffeine, or stacked meetings inside the same window; and the baseline is a window mean rather than a trailing pre-event baseline. As part of this task I will run a read-only query on your account dumping, per event: date, day of week, category, event window, peak HR in window, resting baseline, delta and sample count — so you can reconcile the numbers on screen against the raw rows before we call it verified.

## 5. Correction to the previous run: calendar-month window, not rolling 30 days

The trend strip and its share export currently load a rolling 30-day window ending today, which pulls in late-July days alongside August. Change both to the **current calendar month only**:

- The window runs from the 1st of the current month (1 August 2026) to the end of that month — no previous-month days at all.
- The share export renders a single Monday-aligned block for that month, so the 1st lands on its true weekday (Saturday for August 2026).
- Days after today are shown as dotted/outline placeholder pills (the empty-day treatment) for the remainder of the month, on both the strip and the export.
- Strip header shows the month name; the auto-scroll pass still re-runs after a share capture so the strip returns to the current week.
- Applies identically to all four tabs (Clarity, Emotion, Pressure, Regulation) — presentation and windowing only, no scoring changes.

## Technical notes


- `src/components/insights/PerformanceCausalityCard.tsx` — add caption above the Stress Load grid; in `DrainHeatmapGrid`, swap the row-label `truncate`/`max-w-[7rem]` for `whitespace-nowrap` and let the table be content-width inside the existing `overflow-x-auto` wrapper.
- `supabase/functions/cause-effect-engine/index.ts` — `DAY_LABELS` becomes 7 entries; `dayIndex` maps Sunday (0) to index 6 instead of returning -1, Saturday to index 5. Bump `ENGINE_VERSION` so each user recomputes once on next card load. Redeploy the function.
- Verification: read-only SQL over `calendar_events` joined to `wearable_data.hr_samples` for your user, reproducing the cell maths day by day.
