

# First Session Guide — Fix All Issues

## Problems Identified

1. **Clip-path cutout crops the feature** — the spotlight punches a hole showing only part of the element
2. **Orange border looks cheap** — hard `border-2 border-saffron/60` feels rigid, not premium
3. **Features not centered** — elements below fold (like Daily Plan) aren't scrolled into view, tooltip falls off-screen and becomes unclickable
4. **Check-in only shows Mental Sharpness** — the carousel shows only one axis; misses Clarity and Confidence
5. **Overlay too dark** — `bg-black/75` hides the app; user should see context while focusing on the highlighted element
6. **Tooltip below fold** — when both feature and tooltip are off-screen, "Next" is unclickable

## Fixes

### 1. Remove clip-path cutout; use soft vignette instead

Replace the clip-path approach with a simple semi-transparent overlay. The highlighted element gets `position: relative; z-index: 61` (raised above the overlay) so it remains fully visible and unclipped. No hole-punching needed.

**Overlay**: `bg-black/40` (down from `/75`) — enough to dim but user can still read labels, see scroll position, recognize the page.

### 2. Remove orange border ring

Delete the `border-2 border-saffron/60` spotlight ring entirely. Instead, apply a subtle `shadow-[0_0_40px_rgba(255,183,77,0.15)]` glow around the element for a soft, premium feel — no hard edges.

### 3. Auto-scroll element into center before highlighting

Add `scrollIntoView({ behavior: 'smooth', block: 'center' })` call on each step transition. Wait 400ms for scroll to settle, then measure `getBoundingClientRect()` and position tooltip. This ensures:
- Daily Plan section scrolls into view
- Compass section scrolls into view
- Every feature appears centered on screen before the tooltip appears

### 4. Fix check-in step — show full carousel, not just one card

The `data-tour="check-in-carousel"` already wraps the full carousel. The issue is the clip-path was cropping it. With the new overlay approach (element raised above overlay via z-index), the full carousel with all 5 states (Overwhelmed, Drained, Steady, Scattered, Focused) will be visible.

Additionally, update the step 1 body copy to mention all dimensions:
> "One tap to tell the system how you're performing right now — your sharpness, clarity, and confidence. This is where every day starts."

### 5. Reduce overlay darkness

Change from `bg-black/75 backdrop-blur-sm` to `bg-black/40` with no blur. The app remains clearly visible beneath — the user sees scroll position, feature names, the full layout — while the overlay gently directs attention to the highlighted element.

### 6. Tooltip always positioned in safe zone

After scrolling the element to center, position the tooltip card in a fixed bottom area (`bottom: 24px, left: 16px, right: 16px`) when highlighting real elements. This guarantees:
- Tooltip + Next button always visible and tappable
- Feature centered in the upper portion of the viewport
- No overlap between tooltip and highlighted element on mobile

For fullscreen steps, tooltip stays centered as before.

## File Changes

### Modify: `src/components/onboarding/FirstSessionGuide.tsx`

- **Overlay**: Replace `bg-black/75 backdrop-blur-sm` with `bg-black/40`, remove `clipPath` logic entirely
- **Element highlighting**: Instead of clip-path cutout, programmatically add a temporary class/style to the target element raising it above the overlay (`position: relative; z-index: 61`) with a soft glow shadow
- **Auto-scroll**: Before measuring, call `el.scrollIntoView({ behavior: 'smooth', block: 'center' })`, then `setTimeout(updateSpotlight, 500)`
- **Remove border ring**: Delete the `border-2 border-saffron/60` div entirely
- **Tooltip positioning**: For non-fullscreen steps, fix tooltip to bottom of viewport (`position: fixed; bottom: 24px; left: 16px; right: 16px`) so it's always tappable
- **Step 1 body copy**: Update to mention clarity and confidence
- Clean up spotlight rect logic (no longer needed for clip-path, only for optional soft glow positioning)

### No other files change

All `data-tour` attributes and page-level rendering remain as-is.

## Best Practice Suggestions for Further Improvement

- **Add a "Back" button** alongside "Next" so users can revisit a step they missed
- **Add step counter text** (e.g., "3 of 10") for clearer progress indication beyond dots
- **Animate transitions** — when scrolling to the next element, briefly fade out the tooltip, scroll, then fade in the new tooltip for a polished demo feel
- **Haptic feedback** on mobile (if Capacitor) when advancing steps
- **Auto-advance timer** option — if user doesn't tap for 8s, gently pulse the Next button

