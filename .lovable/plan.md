## Goal
Make the phone mockup bigger on slides 1 & 2, remove the beige/paper seam visible on the left and right of the mockup, and do NOT push the bottom text half down.

## Root cause
Currently the hero uses `object-fit: contain` at 52vh. The portrait image (1024×1280, aspect 0.8) is taller than the container's aspect (~0.89 on a 390×~440px hero), so `contain` fits by height and leaves ~19px gaps on each side. The container's `#ece4d6` band is close to but not identical to the image's paper tone (slide 2 corner samples as ~`#dad7d0`, slide 1 as ~`#ebe3d6`), so a faint seam shows.

## Fix (single file: `src/pages/onboarding/stages/StageUSPIntro.tsx`)

1. **Switch slides 1 & 2 to `object-fit: cover` with `object-position: center top`.** The image itself fills the full width edge-to-edge — no side gap, no seam possible. Because the phone mockup sits in the upper portion of the JPG, anchoring to the top keeps the entire mockup visible; the cropped area is empty paper at the bottom of the image, not the phone.
2. **Keep hero height at 52vh (do not grow it).** The bottom half stays exactly where it is. The mockup reads bigger purely because `cover` scales the image up to fill width rather than shrinking to fit height.
3. **Keep the `#ece4d6` container background** as a safety net (covers any 1px sub-pixel rounding on some devices), but with `cover` it should no longer be visible.
4. **Slides 3+ unchanged** — they already use `cover`.

## Verification
- Playwright screenshot at 390×844 for slide 1 and slide 2:
  - No beige/paper seam on left or right of the mockup.
  - Full phone mockup visible top-to-bottom (Brief score / Priorities card readable).
  - Bottom text block ("Stay Mentally Ahead" / "Prepare for what the day demands.") sits at the same vertical position as before.
- `tsgo` clean.

## Out of scope
- No image regeneration, no copy changes, no bottom-card changes.
