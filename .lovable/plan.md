Isolated UI tweaks on the MRS card only. No logic, scoring, Edge Function, or navigation changes.

### Changes

1. **Thicken only the coloured progress arc in `src/components/home/mrs/MrsGauge.tsx`**
   - Progress arc stroke: `strokeWidth={6}` → `strokeWidth={10}`.
   - Leave the track (`strokeWidth={4}`), radius, gradients, glow, orb, typography, and colour logic untouched.
   - The overall circle size stays the same; only the coloured line becomes more visible.

2. **Make the "Take assessment" button chunkier and less elongated in `src/components/home/mrs/MrsPage.tsx`**
   - Increase vertical padding: `py-2.5` → `py-3.5`.
   - Slightly increase horizontal padding: `pl-5 pr-6` → `pl-6 pr-7`.
   - Increase label size: `text-xs` → `text-sm`.
   - Keep the left-edge half-tab shape, saffron gradient, shimmer, click handler, and all existing behaviour.

### Out of scope
- No changes to `useWeeklyMrsDelta`, `useMrsSnapshot`, `useOuterReadiness`, scoring, or any Edge Function.
- No changes to the gauge size, track width, colours, or the Week-over-Week collapsible behaviour.
- No new assets or copy.

### Verification
- Run `vitest` for affected components (`WeeklyDeltaDial.test.tsx` and any MRS-related tests).
- Run `tsgo` typecheck.
- Visually verify the MRS page preview shows a thicker coloured dial arc and a more substantial assessment button.