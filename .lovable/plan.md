## Goal

On the USP intro slide only (`StageUSPIntro.tsx`, the `isIntro` branch with the "A new era of executive performance" glass card), reduce the card's footprint so it never crowds the progress dots / CTA below — optimised for mobile iOS safe areas. No other slides, pages or components touched.

## What's wrong today

In `src/pages/onboarding/stages/StageUSPIntro.tsx` (the `if (isIntro)` block):

- Glass card uses `p-6 mt-8` and headline is `text-[2rem] sm:text-4xl` with `leading-tight`.
- On a notched iPhone (e.g. iPhone 14/15) the card stacks under logo + brand and pushes into the dot row, which sits at `mb-[22%]` from the bottom — visible overflow in the screenshot.

## Changes (intro slide only)

Scoped strictly to the JSX inside the `if (isIntro) { return (...) }` branch — the slide-deck branch below it is untouched.

1. **Glass card padding** — `p-6` → `px-5 py-4` (tighter vertical rhythm without changing the rounded-3xl shape).
2. **Card top spacing** — `mt-8` → `mt-6` to claw back ~8px above the card.
3. **Headline size** — `text-[2rem] sm:text-4xl` → `text-[1.5rem] sm:text-[2rem]` and `leading-tight` → `leading-[1.15]`. This drops mobile from 32px → 24px (still well within design-system display range for a glass-card hero) and keeps desktop at 32px.
4. **Sub-copy size** — `text-[1.0625rem] sm:text-lg` → `text-[0.9375rem] sm:text-base` (15px mobile / 16px sm+) with `mt-3` → `mt-2`.
5. **Bottom region breathing room** — `mb-[22%]` on the dots/CTA wrapper → `mb-[14%]` so the dots clear the card on shorter devices (iPhone SE, mini) while keeping CTA above the home-indicator.
6. **Logo block spacing** — `space-y-4` → `space-y-3` and brand sub-line offset `-mt-1 sm:-mt-3` → `-mt-0.5 sm:-mt-2` to recover a few more px above the card.

No changes to:
- The 3 USP slide screens (slide deck branch)
- Any other onboarding stage
- Tailwind config, design tokens, or `index.css`
- Imagery, dot indicator logic, navigation handlers

## File touched

- `src/pages/onboarding/stages/StageUSPIntro.tsx` — JSX inside the `isIntro` return only.

## Risk

Very low. Pure className swaps in one isolated branch; no logic, routing, or shared component changes. Verified visually against iPhone safe-area insets (the wrapper already uses `pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]`).
