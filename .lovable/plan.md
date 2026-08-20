# Chart line colour: charcoal across 1M / 6M / 1Y

## Goal
Change the Mental Readiness trend chart line colour to the app's charcoal/black (`--foreground`) for every range (1M, 6M, 1Y), while preserving the existing green gradient fill, open/closed dots, dashed gap connectors, and missing-data baselines.

## Current state
`src/components/home/mrs/MrsSparkline.tsx` renders the trend line and gap connectors with `hsl(var(--tier-strong))` (sage green). The area fill, open-dot markers, and missing-stretch baselines already use separate colours.

## Changes
1. In `src/components/home/mrs/MrsSparkline.tsx`:
   - Set the **solid segment** stroke to `hsl(var(--foreground))` (charcoal).
   - Set the **dotted gap connector** stroke to `hsl(var(--foreground))` with reduced opacity so it stays visually subordinate to solid segments.
   - Leave the area gradient fill, open-dot marker strokes/fills, and missing-data baselines unchanged.

## Verification
- Run `tsgo` to confirm no type errors.
- Run the relevant `vitest` tests for the trend/sparkline components.
- Capture a preview screenshot of the Insights trajectory card in 1M, 6M, and 1Y views to confirm the line is charcoal while dots and shading remain green.
