
## Summary

This is not just an LLM-overload issue. The audit shows there is a separate frontend/UI problem in the Performance Readiness Brief, even when data is present.

The current card is receiving enough wearable/check-in data to show:
- a wearable presence pill (`Body steady`)
- clarity/confidence pills
- calendar pills

But the UI currently hides or weakens the value of that data in three ways:
1. the steady-state wearable pill has no back-side/raw-metric content, so it cannot flip
2. the duplicate summary line under the pills repeats the same text and adds noise
3. the pills are visually too dominant, while the affordance that they are tappable is too subtle

## What I found

### 1) Wearable data is reaching the card
In `DecisionReadinessBrief.tsx`, the chip builder uses:
- `outerBrief.hrvValue`
- `outerBrief.sleepDuration`
- `outerBrief.sleepScore`
- `outerBrief.rhrValue`
- `outerBrief.hrvDeviation`
- `outerBrief.sleepDeviation`
- `outerBrief.rhrDeviation`

And `compute-outer-readiness` returns those fields in the response payload.

So this is not a missing-upstream-wire problem at the UI layer.

### 2) Why the “Body steady” pill does not flip
The pill only flips if `chip.backLabel` exists.
Right now the fallback steady-state chip is created like this:
- `id: 'wearable-steady'`
- `label: 'Body steady'`
- no `backLabel`

So the button is rendered, but it is intentionally non-flippable.

### 3) Why HRV / RHR / sleep-specific pills are often not showing
The current chip logic only shows those pills when thresholds are crossed.
If metrics are normal, it collapses to a single steady-state pill.
That matches the recent update, but it is weaker than the behavior described in the PRB logic doc, which expects more explicit wearable interpretation/back-side visibility.

### 4) Why the card still feels like pills are “not working”
There is almost no affordance that pills flip:
- no icon
- no microcopy near the signal row
- no auto-hint on first render
- “Tap for raw numbers” is far away at the bottom of the card

So even when chip flip works, it is easy to miss.

### 5) Redundant line should be removed
`buildInnerSummary()` creates the repeated line like:
`Body steady · Clarity strong`
This is purely duplicative of the pills and should be removed.

### 6) Pill colors are currently too loud
`chipBgColor()` and `calendarLoadPillStyle()` use saturated/dark gradients:
- red-500/400
- amber-500/400
- emerald-600/500
These visually overpower the phrase/body copy. The user request is reasonable: keep shape/size/gradient treatment, but shift to much lighter/softer tones.

## Implementation plan

### A. Fix wearable steady-state pill so it flips
Update `buildSignalChips()` in `src/components/home/DecisionReadinessBrief.tsx` so `wearable-steady` gets a `backLabel` built from available live metrics.

Examples:
- `HRV: 52ms · Sleep: 7h 18m · RHR: 58bpm`
- if only some values exist, show only those present
- keep the current front labels:
  - `Body steady`
  - `System online`

This preserves the steady-state concept but restores the “tap to reveal the data underneath” behavior.

### B. Restore better wearable signal visibility without changing layout
Refine steady-state handling so normal wearable data still communicates substance:
- keep the single wearable pill when thresholds are normal
- but ensure its back side reveals the actual metric bundle
- if only one metric exists, show that single metric clearly
- if multiple exist, prioritize HRV + sleep + RHR in that order

This avoids adding more pills unless truly needed, while making the existing pill meaningful.

### C. Add a subtle UI affordance that pills are flippable
UI-only refinement, no layout change:
- add a very small helper line above or beside the pills such as:
  - `Tap a pill to reveal the signal`
- or add a tiny rotate/chevron icon inside flippable pills only
- or both, but keep it understated

Recommended approach:
- keep pills visually clean
- add one subtle helper line near “Based on your signals”
- optionally add a tiny icon only on hover/touch-capable flippable pills

### D. Remove the duplicate summary line
Delete the rendered `innerSummary` block under the pills in `DecisionReadinessBrief.tsx`.

Also remove the unused `buildInnerSummary()` helper if no longer needed.

### E. Soften pill colors without changing size/shape/text
Adjust `chipBgColor()` and `calendarLoadPillStyle()` to lighter gradients:
- red → pale rose / soft coral
- amber → light apricot / soft saffron
- green → pale mint / soft emerald
- neutral/taupe → softer taupe tint

Keep:
- same rounded pill shape
- same padding/size
- same gradient style
- same text labels

But reduce visual intensity so they read as secondary support, not primary focal points.

### F. Keep raw data access coherent
Because the steady pill becomes flippable, the bottom “Tap for raw numbers” section remains useful as the full expanded audit view.
No structural change needed there.

## Files to update

### `src/components/home/DecisionReadinessBrief.tsx`
Primary UI work:
- add `backLabel` for `wearable-steady`
- possibly add helper for flippable pills
- remove repeated summary line
- soften chip colors
- optionally add a tiny visual affordance for flippable chips
- ensure flippable chips remain keyboard/touch friendly

### `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md`
Update documentation so it matches current intended behavior:
- steady-state wearable pill is flippable and reveals live metrics
- duplicate summary line removed
- softer pill color treatment
- add note about flip affordance

## Notes on scope

This plan is UI-focused as requested:
- no major layout changes
- no changes to 1/2/3 priorities layout
- no backend/schema changes required for these UI fixes

Separately, the Claude/Lovable overload problem may still exist, but it is not the cause of the steady pill not flipping or the duplicate summary line. Those are frontend issues and should be fixed independently.

## After implementation, verify

1. When wearable is connected and metrics are normal:
- `Body steady` or `System online` appears
- tapping it reveals HRV / sleep / RHR raw values

2. When clarity/confidence exist:
- their pills remain visible and readable with softer styling

3. The repeated line below the pills is gone

4. Users can tell pills are interactive without changing the overall card layout

5. Calendar pills still render, but with lighter visual intensity

## Then return to the original broader work
Once this UI cleanup is in place, the next pass should return to:
- richer context quality
- stronger reasoning quality when LLM succeeds
- resilient deterministic fallback quality
- multi-practice logic in Today’s 3 Performance Priorities
