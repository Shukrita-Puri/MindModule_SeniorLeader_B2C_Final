# Stress Load grid: tooltip meaning, frozen category column, and Sunday mis-tagging

## Audit — what the numbers currently mean

Hovering a cell shows two lines:

```text
Daily Rhythm & Baseline · Sun · n=2      <- row category · day column · number of events in the cell
Small-group meetings · +75bpm            <- the pattern bucket that produced the cell's highest value
```

- `n=2` is the count of calendar events that landed in that (category, day) cell **and** had heart-rate samples inside their event window. It is a sample size, not a score.
- Line 1 repeats the row label, which is already visible on the left — redundant.
- Line 2 is **not** an A–H subcategory. The engine buckets events with a legacy pattern-bucket classifier; when a title matches nothing it falls back to attendee count: 0 → "Solo work blocks", 1–3 → "Small-group meetings", 4+ → "Group meetings".

### Why Sunday reads as "Small-group meetings" for this account

The only weekend rows in the 60-day window are:

| Date | Day | Title | Attendees |
|---|---|---|---|
| 15 Aug | Sat | Statue of Liberty and Ellis Island reserve | 2 |
| 9 Aug | Sun | Flight to New York (BA 183) | 1 |
| 9 Aug | Sun | Stay at DoubleTree by Hilton New York | 1 |
| 5 Jul | Sun | Mind Module | 2 |

None matches the pattern-bucket keyword list, so all four fall through to the attendee rule and become "Small-group meetings". The row label ("Daily Rhythm & Baseline") is then taken from the **first** event that ever carried that bucket label, not from the weekend events themselves. So a flight and a hotel block are displayed under a category they have nothing to do with. The A–H resolver already classifies these correctly as G (Travel & Logistics) — the Stress Load path just isn't asking it.

## Changes

1. **Row/category attribution (correctness).** Classify each event with the shared A–H resolver per event and use its category for the cell, instead of mapping a legacy bucket label to whichever category the first matching event happened to have. Keep the attendee fallback only for events the resolver cannot place. Same maths, same window — only which row an event lands in.
2. **Tooltip rewrite.** Drop the repeated category. Show:
   `Sun · 2 events with HR samples` on line 1, and the event subtype plus value on line 2 (e.g. `Flight · +75 bpm`), using the A–H subcategory name rather than the attendee bucket.
3. **Freeze the category column.** Make the left label column sticky within the existing horizontal scroller so the category stays visible while scrolling Mon→Sun. The label column keeps its own truncation/scroll behaviour; grid footprint is unchanged.

## Technical notes

- Frontend: `src/components/insights/PerformanceCausalityCard.tsx` — sticky `position: sticky; left: 0` on the row-header `td`/`th` with a matching background so cells scroll underneath; tooltip string assembly in `DrainHeatmapGrid`.
- Backend: `supabase/functions/cause-effect-engine/index.ts` — replace `classifyEvent(title) ?? classifyByAttendees(...)` label→category mapping in the Stress Load block with per-event `classifyEventCanonical`, and emit the subtype label alongside each cell so the tooltip can name it. Bump `ENGINE_VERSION` 7 → 8 for a one-time recompute; cached payloads keep rendering meanwhile.
- No formula, weight, threshold, gate or `signal_summary` change. Burnout, Recovery and "When You Perform Best" untouched.
- Verify after deploy: the 9 Aug flight/hotel cells appear under Travel & Logistics, the Sat 15 Aug cell under its resolved category, sticky column checked at mobile width, and typecheck/build/tests pass.
