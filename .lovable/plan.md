

# Fix First Session Guide — All Issues

## Problems from Screenshots

1. **Navigation box covers the feature** — tooltip at bottom overlaps the highlighted element (e.g., step 4 "Performance Readiness Plan" card is behind the tooltip)
2. **Back→Next breaks highlighting** — going back and forward again stops highlighting elements entirely (stale closure bug in `highlightElement` callback)
3. **Daily check-in only shows Mental Sharpness** — the carousel wrapper is highlighted but only one card is visible; needs to show all states
4. **Phase B doesn't highlight navigation elements** — sidebar trigger (top-left), coach access (top-right), and sidebar nav items are not visually raised above overlay
5. **Step 7 (Mental Performance Suite) should detail each feature** — instead of a single line listing all 4 tools, show individual descriptions for each

## Fixes

### File: `src/components/onboarding/FirstSessionGuide.tsx`

**Fix 1 — Smart tooltip positioning**: After scrolling and highlighting the element, measure its `getBoundingClientRect()`. If the element is in the lower half of the viewport, position the tooltip at the **top** (below safe area). If the element is in the upper half, keep tooltip at **bottom**. This prevents overlap. For small elements like sidebar-trigger and coach-access in the header, always position tooltip below.

**Fix 2 — Fix Back→Next re-highlighting**: The `highlightElement` callback has stale closure issues because it depends on `step` and `isFullscreen` derived from `currentStep` state. The fix: use a ref for `currentStep` so `highlightElement` always reads the latest value. Also ensure `cleanupPrevious` runs synchronously before setting new highlights, and add a retry mechanism that's properly cleaned up.

**Fix 3 — Daily check-in carousel**: For step 0, after finding the `[data-tour="check-in-carousel"]` element, programmatically scroll it horizontally to show all cards are present. Update step body to emphasize all 3 dimensions. The main fix is actually that the carousel container needs to be highlighted — this already works, but the `scrollIntoView` with `block: 'center'` should use `block: 'start'` for this step so the full carousel area is visible above the tooltip.

**Fix 4 — Phase B navigation highlighting**: 
- Step 5 (sidebar trigger): scroll to top of page first, then highlight the `[data-tour="sidebar-trigger"]` button in the header. Position tooltip in center since the element is small.
- Step 6 (sidebar nav): open sidebar first, wait 400ms, then highlight `[data-tour="sidebar-nav"]`. Position tooltip at bottom-right or overlay the content area (not covering sidebar).
- Step 7 (coach access): close sidebar, scroll to top, highlight `[data-tour="coach-access"]` in header.

**Fix 5 — Expand Step 7 to show individual feature descriptions**: Change the step body to a structured layout showing each feature with a one-line description:
- **Performance Readiness Assessment** — Check your mental state daily
- **Reset Studio** — Guided practices to restore energy
- **Mind Performance Coach** — AI coaching built around your patterns  
- **Performance Intelligence** — Track trends and growth over time

### File: `src/pages/DailyCheckIn.tsx`

**Fix 3b — Page navigation on Back**: When step 0 is the check-in page step, the existing `useEffect` for page transitions needs to also handle navigating *back* to `/daily-check-in` when `step.page === 'check-in'`. Currently it only handles navigating to `/executive-home`. Add the reverse check.

## Technical Details

**Tooltip positioning logic** (new):
```text
measure element rect after scroll
if element bottom > viewport height * 0.5:
  tooltip position = top (with safe-area offset)
else:
  tooltip position = bottom
for fullscreen steps: centered as before
```

**Stale closure fix**: Replace the `currentStep`-derived `step`/`isFullscreen` inside `highlightElement` with direct reads from a `currentStepRef`:
```typescript
const currentStepRef = useRef(currentStep);
currentStepRef.current = currentStep;
// Inside highlightElement, read STEPS[currentStepRef.current]
```

**Retry cleanup**: Store the retry timer ID in a ref and clear it on every step change to prevent ghost highlights from previous steps.

