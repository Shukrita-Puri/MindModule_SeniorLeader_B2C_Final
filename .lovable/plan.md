# Burnout Risk card: consistent pill colouring, cleaner labels

UI only in `src/components/insights/PerformanceCausalityCard.tsx`. No engine, no schema changes.

## Why the pills look wrong today (verified in the code)

Three separate mechanisms, not one bug:

1. **Grey pills (−6ms, 0ms in Monthly).** Monthly cells with fewer than 3 occurrences are rendered in a `thin` state — a flat grey chip — before colour is ever considered. So a real −6ms with n=2 looks identical to a no-signal cell.
2. **Palest coral reads as "no colour".** The lowest ramp stop `#FAECE7` on the beige card is nearly indistinguishable from grey, so −1ms/+5ms look tinted-but-odd rather than clearly neutral.
3. **−7ms looks too dark.** The Day view ramp is scaled to that week's own worst value (−12ms), so −7ms lands at ramp stop 4 of 7. It is relative shading, not an absolute severity scale.

## Change 1 — One absolute severity scale

Replace the relative (max-of-window) scaling with fixed bands, so the same number always gets the same colour in both Day and Monthly views:

```text
positive, or  0 to −3ms   → neutral (no colour)
−4 to −6ms                → ramp stop 1
−7 to −9ms                → ramp stop 2
−10 to −13ms              → ramp stop 3
−14 to −18ms              → ramp stop 4
−19 to −24ms              → ramp stop 5
−25ms and beyond          → ramp stop 6 (darkest)
```

No-cost cells render with the neutral empty-cell treatment (`bg-white/80 dark:bg-white/10`, muted text) — no coral tint at all, so +5ms and −1ms are unmistakably "no cost".

## Change 2 — Low-confidence cells keep their colour

Monthly cells with n < 3 stop being flat grey. They get the same band colour as any other cell, at reduced opacity, with the existing tooltip already stating the occurrence count. Grey is then reserved only for genuinely absent data.

## Change 3 — Remove the "WEEKLY HRV TREND" sub-heading

Delete the inner label under "WEEKLY BURNOUT TREND"; the section tooltip already states the metric.

## Change 4 — Legend wording

- Weekly Burnout Trend legend: "Low HRV risk" → "High HRV risk".
- Day Type Impact on Burnout legend: "No HRV risk" → "High HRV risk".

## Verification

Typecheck plus the existing insights tests. The live app only reflects this after a republish.
