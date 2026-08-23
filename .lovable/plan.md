# Burnout Risk card: neutral no-cost pills, cleaner labels

UI only in `src/components/insights/PerformanceCausalityCard.tsx`. No engine, no schema changes.

## What's actually happening with the colours

The threshold logic is already correct: any positive value and anything from −3ms to 0 return the palest ramp stop. The problem is that "palest" is still a coral tint (`#FAECE7`) rendered as a filled pill, so −1ms and +5ms read as "coloured / flagged" even though they carry no cost. The older screenshot (14:19) predates the current build, so the +5ms mid-coral pill there is a stale render.

## Change 1 — No-cost cells become visually neutral

- Sub-threshold cells (any positive value, or any value where `|delta| < 4`) render with the same neutral treatment as empty cells: `bg-white/80 dark:bg-white/10` with muted text — no coral fill at all.
- The coral ramp starts only at −4ms and scales by magnitude up to the view's own max (this week's max in Day view, the 30-day max in Monthly view).
- Applied identically in Day Wise and Monthly cells.

Result: +5ms, +13ms, −1ms, −2ms, −3ms all neutral; −4ms barely coral; −7ms mid; −12ms dark.

## Change 2 — Remove the "WEEKLY HRV TREND" sub-heading

Delete the inner label under "WEEKLY BURNOUT TREND"; the section tooltip already states the metric.

## Change 3 — Legend wording

- Weekly Burnout Trend legend: "Low HRV risk" → "High HRV risk".
- Day Type Impact on Burnout legend: "No HRV risk" → "High HRV risk".
- Both legends drop the palest swatch from the strip so the scale visually starts where colour starts.

## Verification

Typecheck plus the existing insights tests. Note: the live app at the published URL will only show this after a republish.
