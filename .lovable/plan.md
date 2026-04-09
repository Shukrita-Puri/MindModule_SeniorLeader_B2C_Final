

# Onboarding Visual Consistency, Tour Card Fixes, and Phase Label Color

## Overview

Four changes across five files: (1) add full-bleed background images to `/onboarding` and `/onboarding/app-intro` matching the Front page style, (2) match logo/brand sizing to Front page, (3) fix "YOUR DAILY LOOP" label color from orange/saffron to white/grey, (4) harden tour Step 2 and Step 3 scroll+position logic so the tour card always appears above the spotlighted feature with the feature centered on screen.

---

## Changes

### 1. Stage1Welcome — full-bleed background + brand sizing match

**File**: `src/pages/onboarding/stages/Stage1Welcome.tsx`

Transform from a padded card layout to a full-screen immersive layout matching Front.tsx:
- Import `heroIllustration` (or a similar available image like `usp-sky-golden.jpg` for a warm, calm tone distinct from Front).
- Make the container `fixed inset-0` with the background image, gradient overlay (`bg-gradient-to-t from-black/80 via-black/40 to-transparent`), and white text — identical structure to Front.tsx.
- Logo: `w-20 h-20 sm:w-24 sm:h-24` (matches Front).
- Headline: `text-5xl sm:text-7xl font-headline font-bold text-white tracking-wider` (matches Front).
- Subtitle: `text-[9px] sm:text-xs tracking-[0.35em] text-white/50` (matches Front).
- Move the descriptive text block into the center with `text-white/80` styling.
- Pin CTA and privacy footer to bottom.

### 2. StageUSPIntro intro screen — same treatment

**File**: `src/pages/onboarding/stages/StageUSPIntro.tsx`

The intro screen (currentSlide === -1) currently uses `bg-background` with no image. Update:
- Import a background image (e.g., `usp-sky-golden.jpg` — same as Stage1Welcome for consistency).
- Add full-bleed image + gradient overlay to the intro screen only (USP slides already have their own images).
- Match logo size (`w-20 h-20`), headline (`text-5xl font-headline font-bold text-white tracking-wider`), and subtitle styling to Front.tsx.
- Switch all text to white-on-dark to work over the image.
- Top bar: change from `bg-white/85` to `bg-black/30 backdrop-blur` when on intro screen so it blends with the dark background.

### 3. OnboardingFlow — remove background color for immersive stages

**File**: `src/pages/onboarding/OnboardingFlow.tsx`

Stage1Welcome and StageUSPIntro now render their own full-bleed backgrounds, so the wrapper `bg-background` and padding should not interfere. Since these stages use `fixed inset-0`, no wrapper changes are strictly needed — but ensure the `max-w-2xl mx-auto px-4 py-8` wrapper doesn't clip the fixed-position children. This should already work since `fixed` elements escape the flow.

### 4. Tour card — "YOUR DAILY LOOP" label color fix

**File**: `src/components/onboarding/FirstSessionGuide.tsx`

Change `phaseLabel` color from `text-saffron` to `text-white/60` in three places:
- Line 537: tooltip card phase label
- Line 586: transition card phase label
These ensure the "YOUR DAILY LOOP" text is visible against the clear glass background.

### 5. Tour card — hardened scroll positioning for Steps 2 & 3

**File**: `src/components/onboarding/FirstSessionGuide.tsx`

The core problem: after scrolling to the feature, the tour card sometimes covers it or the feature isn't centered. Fix:

**Step definitions** (lines 39-66):
- Step 2: add `scrollBlock: 'start'` so the Performance Readiness Brief is pushed to the top, leaving room for the tooltip below.
- Step 3: keep `scrollBlock: 'center'`, change `tooltipPosition` to `'above'`.

**computePosition** (lines 170-220): Add a hard constraint — when tooltip is `'above'`, ensure the feature element's top edge is at least `tooltipH + GAP + topSafeArea` from the top of the viewport. If not, programmatically scroll the page to create space. When tooltip is `'below'`, ensure the feature is in the upper half of the screen.

**highlightElement** (lines 226-276): After `scrollIntoView`, add a secondary scroll adjustment:
```
// After initial scroll settles (450ms), check if tooltip fits above/below
// If not, do a precise window.scrollBy to create space
const rect = el.getBoundingClientRect();
const tooltipH = tooltipRef.current?.offsetHeight || 220;
const GAP = 16;
const pref = s.tooltipPosition || 'below';
if (pref === 'above') {
  // Need space above: rect.top should be >= tooltipH + GAP + 60 (top safe)
  const minTop = tooltipH + GAP + 60;
  if (rect.top < minTop) {
    window.scrollBy({ top: rect.top - minTop, behavior: 'smooth' });
  }
}
```

This ensures the tour card is always fully visible and the feature card is centered/visible on the mobile screen.

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/onboarding/stages/Stage1Welcome.tsx` | Full-bleed background image, brand sizing match to Front.tsx |
| `src/pages/onboarding/stages/StageUSPIntro.tsx` | Intro screen: background image, brand sizing match |
| `src/components/onboarding/FirstSessionGuide.tsx` | Phase label color fix (white/grey); hardened scroll + tooltip positioning |

