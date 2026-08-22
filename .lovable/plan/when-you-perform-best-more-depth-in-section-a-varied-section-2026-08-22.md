# When You Perform Best — more depth in Section A, varied Section B

## What's wrong today (verified in code)

1. **Section A usually shows one line.** The edge function mines each dimension, sorts by confidence, then keeps only the top 3 findings *per dimension including negative ones* (`performance-rhythm-insights`, dedupe loop). A low-day plus a negative streak can consume two of the three slots, so after the card's positive-only filter often a single line survives. The app-side guard then drops more: any peak with a positive rate under 50%, and peak-day/peak-window below a 20pp gap.
2. **Section B is identical on every tab.** It is built from `buildSection(findings, 'wearable', 3)` plus the global performance-lift lines, with no dependence on the active tab.

## What changes

### Section A — more real patterns per tab

- Raise the per-dimension pool in the edge function so positive findings are not crowded out by negatives: keep up to 6 findings per dimension, and select them so at least 3 positive-kind findings (`cell-peak`, `peak-day`, `peak-window`, `consecutive-pos`) survive when they exist. Negative findings still flow to the Drains surface unchanged.
- Relax the app-side observation guard slightly so genuine trends surface as *emerging* instead of being dropped:
  - peak-day / peak-window / cell-peak: emerging at n >= 3 with a 15pp gap (was 20pp).
  - Allow a peak with a positive rate below 50% only when its gap is >= 20pp, and always render it in emerging (hedged) wording.
  - Strong tiers are unchanged.
- Cap stays 3 per tab, dedupe still by pattern shape, so Clarity can show e.g. its evening window, its peak day, and its 3-in-a-row streak together.

### Section B — global, but different per tab

Section B stays non-tab-scoped (all wearable + calendar findings remain eligible on every tab), but ranking becomes tab-aware so each tab surfaces a different slice:

```text
Clarity     → sleep_score, sleep_duration, hrv
Emotion     → hrv, rhr, sleep_efficiency
Pressure    → rhr, hr, hrv
Regulation  → hrv, rhr, sleep_score
```

A small affinity bonus is added to the card-only ranking weight for the active tab's dimensions. Nothing is excluded — a tab still falls back to whatever else is available, so the section never empties just because its preferred dimensions are missing. Same for the performance-lift lines: sleep-to-peak leads on Clarity, RHR recovery on Pressure, recovery streak on Regulation.

### Other spec gaps closed at the same time

- `hr_event_lift` (positive) finally renders — currently the payload is typed and fetched but never turned into a sentence, despite being the second-highest-weighted Pipeline B signal.
- Pipeline B lines get the spec's observation guard (n >= 5 and >= 15% delta for strong, n >= 3 and >= 10% for emerging) and ranked ordering (0.92 / 0.82 / 0.80 / 0.75 / 0.72) instead of the current fixed order.
- The ungated `Sharpest window:` and calendar-insight lines are routed through the same guard so every Section B line is traceable.

## Technical notes

- `supabase/functions/performance-rhythm-insights/index.ts`: per-dimension selection only — widen the cap and reserve slots for positive kinds. No change to scoring, weights, bands, or data sources; `stats` payload unchanged.
- `src/lib/insights/patternSentences.ts`: guard thresholds, tab-affinity weights, Pipeline B finding type + templates + tiering.
- `src/components/insights/PerformanceRhythmCard.tsx`: pass `activeTrend` into the Section B builder; replace `buildBaselineLiftLines` with the ranked, guarded builder.
- Tests: extend `src/lib/insights/__tests__/patternSentences.test.ts` for the relaxed guard, multi-line Section A, tab-varied Section B ordering, and Pipeline B templates/caps.

## Constraints

No changes to MRS, gating, check-in scoring, or data sources. Section A/B labels and current layout stay as-is. Caps remain 3 per section (6 per tab).
