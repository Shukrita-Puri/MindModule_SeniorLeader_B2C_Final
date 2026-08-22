# Consistent segmented toggle across Insights cards

Adopt the 1M / 6M / 1Y switcher style from the Performance Trajectory card as the single toggle pattern for all Insights cards, sized for mobile first.

## What changes

1. **New shared control** — a segmented toggle: one pill-shaped track (soft muted background), the active item as a white raised pill, inactive items as quiet grey labels. Same visual language as 1M / 6M / 1Y.

2. **When You Perform Best** — Clarity / Emotion / Pressure / Regulation become one full-width segmented track instead of four separate dark/grey pills that wrap onto two rows. Four equal segments spanning the screen width, so nothing wraps on an iPhone.

3. **What Drains Your Performance** — Stress Load / Burnout Risk / Recovery Time become the same full-width segmented track (three equal segments) instead of the current pills.

4. **Trajectory card** — keeps its current right-aligned compact 1M / 6M / 1Y, now rendered by the same shared control so all three cards stay visually identical going forward.

## Mobile sizing

- Track: full width of the card content, `rounded-full`, ~4px inner padding.
- Segments: equal width (`flex-1`), min touch height 32–36px.
- Labels: 11–12px, medium weight, no uppercase tracking for word labels (kept uppercase only for 1M/6M/1Y), single line with tightened tracking so "Burnout Risk" and "Regulation" fit without truncation at 375px width.
- Active segment: `bg-background` + subtle shadow; inactive: muted foreground.

## Technical notes

- New `src/components/insights/SegmentedToggle.tsx`: props `options: {value,label}[]`, `value`, `onChange`, `size?: 'compact' | 'full'`, `uppercase?: boolean`. Purely presentational.
- `PerformanceRhythmCard.tsx` (~line 1197): replace the wrapping pill row with `<SegmentedToggle size="full" />` bound to `activeTrend`.
- `PerformanceCausalityCard.tsx`: replace `TabPill` usages (~line 830) with the shared control bound to `tab`; delete the now-unused `TabPill`.
- `InnerReadinessDial.tsx` (~line 258): swap the inline range buttons for `<SegmentedToggle size="compact" uppercase />` — same rendered appearance.
- Tokens only (`bg-muted`, `bg-background`, `text-muted-foreground`); no hardcoded colours. No data, gating, or backend logic touched.

## Build fixes (blocking, included in this change)

- `src/utils/nativeBackgroundSync.ts` line 33: the `updateAuthToken` plugin interface is missing `refreshToken`, `domain`, `clientId`, which the caller at line 64 passes. Widen the interface to include those optional fields.
- `src/hooks/useWearableSync.ts` line 143: inside a branch already narrowed to `connectionState === 'connected'`, the code re-compares against `'connected_but_waiting_for_data'` — an impossible comparison. Reduce that condition to `result.dbPersisted`, preserving current runtime behaviour.

## Scope guarantee

Presentation-only. No changes to data fetching, gating rules, thresholds, copy templates, backend, or edge functions. The same tab/range state variables drive the same content — only the control's markup and styling change. The two build fixes above are type-level only and preserve existing runtime behaviour.
