

# Plan: Replace Layer 2 Logic in `compute-inner-readiness` Edge Function

## What Changes

### 1. Edge Function: `supabase/functions/compute-inner-readiness/index.ts`

**Delete** lines 145-160 (the `LOW_CC_MODIFIERS` and `HIGH_CC_MODIFIERS` lookup tables).

**Replace** the Layer 2 section in `assembleContextStatement` (lines 182-191) with a call to a new `getCCModifier(outcome, clarity, confidence, timeOfDay)` function.

**Add** the new `getCCModifier` function (provided in the user's spec) which evaluates Clarity and Confidence as two independent signals across 12 deterministic patterns, with time-of-day mentioned only in 3 specific cases (Rules 1-3).

Key behavioral change: Layer 2 now triggers for almost all C×C combinations (not just extremes), except `clarity === 3 AND confidence === 3 AND outcome === 'steady'` which returns null.

### 2. Tooltip Update: `src/components/home/TodayStateCard.tsx`

**Update** the `MetricInfoModal` description prop (line 78) to the revised tooltip text that clarifies "clarity about direction, confidence in execution" and mentions C×C divergence as an example.

### No Other Changes
- IRScore formula stays `(clarity + confidence) × 8`
- Weighting modes 1-4 unchanged
- Layer 1 and Layer 3 unchanged
- Database schema unchanged
- No frontend logic changes

