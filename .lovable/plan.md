# Trend chart: real data source, gap-aware dotted line, Avg header

## 1. Why the 1W chart barely forms (verified)

The dots and the chart read two different sources:

```text
Weekly dots   -> brief_snapshots (score) + daily_checkins composite
Trend chart   -> mental_fitness_scores (+ sparse check-in fallback)
```

For the account in the screenshots:

- `mental_fitness_scores`: **0 rows in the last 30 days**
- `brief_snapshots` with a numeric score: **14 distinct days in the last 14 days**
  (this week: 13, 14, 15, 16, 17, 19, 20 Aug)

So the chart is drawing from a table that is effectively empty for this user, while the
dots draw from a table that is well populated. That mismatch, not the rendering, is why
the 1W line collapses to a stub.

## 2. One source for dots and charts

The trend series moves onto the exact same daily value the dots already use:

1. brief snapshot score for that date (average when a day has several briefs), else
2. the day's check-in composite, else
3. no value for that day (a real gap — never invented).

Result: if a day earns a coloured dot, it also gets a point on the 1W/1M/6M chart.
1M and 6M aggregate the same daily values into weekly (1M) and monthly (6M) buckets so
the x-axis stays readable, matching the Apple Health pattern.

## 3. Chart rendering — Apple Health style

- Points that have data: **open circle markers** on the line, so it is obvious which
  days/weeks/months were measured.
- Runs between two measured points that span missing periods: **dotted connector**;
  solid line only between consecutive measured periods.
- Fully missing stretches: dotted baseline instead of blank white space.
- Empty state stays as is when there is genuinely nothing in the range.

## 4. Header: Avg instead of "Trend"

The panel header replaces the word "Trend" with an Apple-style average block:

```text
AVERAGE
64            <- mean of the measured points in the selected range
13 - 19 Aug 2026   <- range label
                                      [1W] [1M] [6M]
```

Recommendation: yes, this is worth doing — the average gives the number the chart is
otherwise only implying, and it makes 1M/6M meaningful at a glance. Days without data
are excluded from the mean (never counted as zero). If no point exists in the range the
block shows an em dash and the existing "Building your trend history" caption.

## Technical notes

- `src/hooks/useMrsTrend.ts` — replace the `mental-fitness-scores GET_SCORES` source with
  the brief-snapshot + check-in daily series (same fetch the dial already performs, lifted
  into a shared hook so both the dots and the chart consume one array); return
  `points` with `hasData` flags, `average`, and a range label alongside the existing
  delta/caption fields. No scoring logic changes.
- `src/components/home/mrs/MrsSparkline.tsx` — render open-circle markers, solid segments
  between adjacent measured points, dotted segments across gaps, dotted baseline for empty
  stretches. Used by the home MRS card too, so the new props stay optional and the current
  look is preserved when no gap info is passed.
- `src/components/insights/InnerReadinessDial.tsx` — swap the "Trend" label for the
  AVERAGE + range block, feed the shared series to both the dot row and the chart.
- Bucketing for 1M (weekly) and 6M (monthly) lives in the hook, not the SVG.
- No edge function, no schema, no scoring or tier changes.
