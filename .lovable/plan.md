## Goal
Make the top-half hero on `/onboarding/app-intro` (slides 1 & 2) read as its own distinct panel — edge-to-edge background, no beige from the bottom half bleeding in around the phone mockup — while keeping the full phone mockup visible.

## Root cause
In `src/pages/onboarding/stages/StageUSPIntro.tsx`, the hero container currently:
- Uses `object-contain` on the image, so the paper/engraved background of the JPG only covers the phone's aspect ratio. The surrounding area shows the page's beige canvas.
- Has no explicit hero background color of its own, so the bottom-half beige shows through on the sides.

## Changes (single file: `StageUSPIntro.tsx`)

1. **Give the hero its own background band.** Wrap the hero area with an explicit off-white/paper background token (matching the engraving's paper tone) so the top half is visually its own panel edge-to-edge, independent of the beige card below.
2. **Stop the beige bleed on slides 1 & 2.** Keep `object-contain` so the phone mockup stays fully visible and uncropped, but center the mockup on the new paper-tone background. The paper band now fills the full width; the mockup sits on top of it.
3. **Increase mockup presence.** Bump the hero height slightly (from `48vh` to ~`52vh`) and/or scale the image within the container so the phone reads larger, while still fully visible top-to-bottom. Bottom text block remains ~48vh — no squeezing.
4. **Slides 3+ unchanged.** Landscape sunrise slides keep their current `object-cover` behavior; the new hero background sits behind them harmlessly.

## Out of scope
- No image regeneration (the engraved JPGs already have paper backgrounds that will blend seamlessly with the new hero band).
- No changes to copy, CTAs, pagination dots, or bottom card styling.

## Verification
- Mobile screenshot at 390×844 for slide 1 and slide 2: hero fills full width with a single paper tone, phone mockup fully visible, clean horizontal seam between hero and beige bottom card.
- `tsgo` clean.
