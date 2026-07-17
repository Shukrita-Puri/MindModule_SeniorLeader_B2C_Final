## Onboarding app-intro layout fix

### Current state
`src/pages/onboarding/stages/StageUSPIntro.tsx` renders the onboarding carousel with:
- A fixed-height hero at `h-[55vh]`.
- The remaining title/body/pagination/CTA squeezed into the leftover `~45vh`, making the text feel cramped on smaller screens.
- The engraved phone-mockup images are positioned with `object-position: center 22%`, but the bottom text area still occupies less than half the viewport.

### Goal
1. Move the hero images higher within the hero container.
2. Give the bottom content block (title, body, pagination, CTA) a full half of the screen instead of the current ~quarter feel.
3. Apply the fix consistently to the first two slides (the phone-mockup Brief / Plan visuals) and keep the layout consistent across all four slides.

### Proposed changes
1. **Reduce hero height** from `55vh` to `48vh` so the bottom block naturally sits at ~50% of the viewport.
2. **Anchor the hero image higher** for the phone-mockup slides by changing `object-position` from `center 22%` to `top center` (or `center 10%` if `top` crops the phone bezel). This raises the Brief / Plan card content into clear view without adding a blur overlay.
3. **Keep the bottom block from being compressed** by leaving the title/body area as `flex-1` and ensuring pagination + footer use their existing `shrink-0` classes.
4. **Preserve the existing carousel behavior** (back-button absorption, slide state, CTA routing) and do not change slide copy or assets.

### Verification
- Load `/onboarding/app-intro` in the mobile preview.
- Confirm on slide 1 that the phone mockup and “Performance Readiness Brief” text are visible in the top half.
- Confirm that “Stay Mentally Ahead”, the body copy, pagination dots, and the Continue button occupy the full bottom half without feeling squeezed.
- Swipe/click to slide 2 and confirm the same proportions for the Plan mockup.

### Files to change
- `src/pages/onboarding/stages/StageUSPIntro.tsx` only.