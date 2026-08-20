# Trajectory card → chart-first, Apple Health style

## Recommendation (UX)

Yes — go chart-first. Once the chart supports 1W, the seven streak circles are a second,
lower-resolution rendering of the same seven values, in the same card. Two views of one
dataset is exactly the "too much content" complaint. Apple Health solves this with one
chart plus a range picker, and that's the right model here.

Keep: range picker, AVERAGE header, open markers, dotted gaps.
Drop from view: streak circles (flag, not delete), the show/hide toggle (chart is the card,
so it should always be visible).

One nuance worth keeping: the streak dots carried tier colour (green/amber/red), which the
chart loses when the line goes neutral. That's an acceptable trade — tier is already
communicated on the executive home cards, and the y-axis position carries the same meaning.

## Changes

1. **Streak circles hidden** behind `SHOW_WEEK_STREAK_DOTS = false` in
   `InnerReadinessDial.tsx` (row, week fetch and dot logic kept intact).
2. **Toggle removed** — the trend panel always renders. `Show/Hide trend` button and the
   session-persisted expand state go away.
3. **1W added** to the range picker: `1W · 1M · 6M · 1Y`, default **1W**. 1W = one point per
   day over the last 7 days, same daily series the dots used.
4. **Bigger chart** — height goes from the compact sparkline size to ~180px, full card
   width, so it reads as the card's primary content rather than a footnote.
5. **Neutral line colour** — line, markers and area fill switch from the tier green to the
   app's charcoal foreground token. Line at full strength, markers open (background fill,
   charcoal stroke), area fill a very light charcoal wash, gap connectors dotted charcoal at
   reduced opacity.
6. **Sub-label** changes from "Mental Readiness Streak · This Week" to
   "Mental Readiness · Trend" since the card is no longer week-scoped.

## Technical notes

- `src/hooks/useMrsTrend.ts` — widen `MrsRangeDays` to `7 | 30 | 180 | 365`; 7 buckets daily
  like the 30 path; range label and average logic unchanged. Delta comparison window for 7
  uses the existing 7-day path.
- `src/components/home/mrs/MrsSparkline.tsx` — add an optional `tone` prop
  (`'tier' | 'neutral'`, default `'tier'`) so the home MRS card keeps its current colour;
  Insights passes `neutral`, which swaps `--tier-strong` for `--foreground`.
- `src/components/insights/InnerReadinessDial.tsx` — flag the dot row, remove the toggle,
  render the panel unconditionally, add 1W to the picker with 1W default, pass
  `height={180}` and `tone="neutral"` to the sparkline.
- No scoring, data-source, edge function or query changes.
