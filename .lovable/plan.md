## Problem (verified in code + against your screenshot)

In your screenshot the **Clarity / Sharpness / Confidence Trends** show only the left-hand `Morning · Midday · Evening` labels with a tiny stack of marks — no day headers (Mon 20…Sun 26) and no dots — while the **Energy Trend** above renders correctly. Root causes:

1. **Width-measurement race in `LevelTrendCalendar.tsx`**
   The component pins each day column to `clientWidth / 7` inside a `useEffect` that runs **once** when `days` first becomes non-null. If `el.clientWidth` is `0` or stale at that moment (very common when the Patterns tab just became visible, or when three of these components mount back-to-back inside the same flex container), every column gets `width: 0px` and the strip visually collapses. There is no resize observer, so it never recovers.
   By contrast, **Energy Trend** uses a `ref` callback that re-runs on every render, which masks the same race.

2. **No `key` reset between sibling calendars**
   The three `<LevelTrendCalendar>` instances are siblings inside one render. They each schedule their own width-pinning + scroll on mount; whichever resolves before layout settles permanently freezes that calendar at 0-width.

3. **Wording mismatch with the slider on `/check-in-detail`**
   The Check-In sliders use **trend-specific vocabulary** (verified in `src/pages/CheckInDetail.tsx:40-42`):

   | Level | Sharpness | Clarity | Confidence |
   |------:|-----------|---------|------------|
   | 5 | Peak | Crystal | Unshakable |
   | 4 | Acute | Lucid | Certain |
   | 3 | Stable | Neutral | Poised |
   | 2 | Dull | Obscured | Uncertain |
   | 1 | Depleted | Clouded | Reactive |

   The Patterns calendars currently show one generic legend (`Depleted · Low · Steady · Strong · Peak`) for all three. Per your direction, each calendar must use the **same words as its slider**.

## Fix

### 1. `src/components/insights/LevelTrendCalendar.tsx` — make layout match Energy Trend exactly + add per-trend vocabulary

**Layout / scroll parity (kills the compression bug):**
- Replace the one-shot `useEffect` width pinning with the **same `ref` callback pattern** used by Energy Trend in `PerformanceRhythmCard.tsx` (lines 925–948): the callback fires on every render, recomputes `clientWidth / 7` on mobile, re-applies widths to every `[data-day-col]`, and re-applies the auto-scroll to the current week's Monday. This makes it self-healing against the 0-width race.
- Add a `ResizeObserver` on the scroll container as a belt-and-braces fallback so future viewport changes (orientation flip, sidebar toggle, etc.) re-pin column widths.
- Keep the existing trailing-30-day, Mon→Sun, `inline-flex`, `gap: isMobile ? 0 : 4px`, `26px` desktop column, `flex-shrink: 0` styling — they already match Energy Trend.

**Per-trend vocabulary (replaces the generic `Depleted/Low/Steady/Strong/Peak`):**
- Add a `vocabulary?: { 5: string; 4: string; 3: string; 2: string; 1: string }` prop. When provided, it overrides the generic tier labels for both the legend and the dot tooltip.
- Colours, glow, gradient remain locked to the canonical 5-tier palette (no change) — only the **labels** change per trend so the same blue dot can read "Crystal" for Clarity, "Acute" for Sharpness, "Certain" for Confidence.

### 2. `src/components/insights/PerformanceRhythmCard.tsx` — pass the slider vocabularies in

At lines 1027–1044, pass the exact arrays from `CheckInDetail.tsx`:

```tsx
<LevelTrendCalendar
  field="clarity_level"
  title="Clarity Trend"
  explanation="Each dot is your reported clarity (1–5) at that time of day. Cooler tones mean higher clarity; empty dots mean no check-in for that slot."
  vocabulary={{ 5: 'Crystal', 4: 'Lucid', 3: 'Neutral', 2: 'Obscured', 1: 'Clouded' }}
/>
<LevelTrendCalendar
  field="mental_sharpness_level"
  title="Sharpness Trend"
  explanation="Each dot is your reported mental sharpness (1–5) at that time of day."
  vocabulary={{ 5: 'Peak', 4: 'Acute', 3: 'Stable', 2: 'Dull', 1: 'Depleted' }}
/>
<LevelTrendCalendar
  field="confidence_level"
  title="Confidence Trend"
  explanation="Each dot is your reported confidence (1–5) at that time of day."
  vocabulary={{ 5: 'Unshakable', 4: 'Certain', 3: 'Poised', 2: 'Uncertain', 1: 'Reactive' }}
/>
```

No other changes to `PerformanceRhythmCard` (Energy Trend, ordering, "How You Show Up" tail block all stay).

### 3. No backend / DB changes
All data already comes from `daily_checkins.{clarity_level, mental_sharpness_level, confidence_level}` (1–5). No migrations.

## QA / verification (mobile 719px, the viewport in your screenshot)

- All four calendars render with **identical column widths**, day headers (Mon 20 … Sun 26), and three rows of dots.
- All four are **horizontally scrollable**, auto-scrolled to current week on mount, with the `← scroll for past weeks` hint above each.
- Clarity legend reads `Clouded · Obscured · Neutral · Lucid · Crystal`; Sharpness legend reads `Depleted · Dull · Stable · Acute · Peak`; Confidence legend reads `Reactive · Uncertain · Poised · Certain · Unshakable`. Energy Trend legend unchanged.
- Hovering a dot shows the trend-specific label (e.g. "Crystal (5/5)" on a Clarity Peak day).
- Rotate the device / toggle the sidebar — column widths re-pin, no collapse.

## Files touched
- `src/components/insights/LevelTrendCalendar.tsx` — switch to ref-callback width pinning + ResizeObserver; add `vocabulary` prop; use it for legend and tooltip.
- `src/components/insights/PerformanceRhythmCard.tsx` — pass per-trend `vocabulary` to each `<LevelTrendCalendar>`.

## Memory update (after implementation)
- Update `mem://features/insights/level-trend-calendars.md`: record the per-trend slider vocabulary table (Clarity / Sharpness / Confidence) and the ref-callback + ResizeObserver layout contract that keeps the strip self-healing.

Ready to implement on approval.