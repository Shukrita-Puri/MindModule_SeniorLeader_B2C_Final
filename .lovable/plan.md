## Scope

Single file: `src/pages/onboarding/stages/Stage1Welcome.tsx`. Background image, CTA route (`/onboarding/app-intro`), Privacy footer, and overall layout structure remain untouched.

## 1. Match the Front-page brand lockup

The auth/Front page (`src/pages/Front.tsx`, lines 226–249) uses a specific lockup that the screenshot shows. Today `/onboarding` uses a heavier, larger version. Align it:

- Logo: drop from `w-20 h-20 sm:w-24 sm:h-24` → `w-12 h-12 sm:w-14 sm:h-14`.
- Headline `MIND MODULE`: switch sizing to `text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-headline font-bold tracking-wider leading-none`, with the same dual `textShadow` Front uses.
- Subtitle `Executive Edition`: `text-xs tracking-[0.35em] uppercase text-white/90 font-body` with matching textShadow.
- Wrap the cluster in the same atmospheric scrim div (radial-gradient blur) Front uses so the type reads cleanly against the cloud illustration.
- Anchor the cluster high (small top margin) instead of vertically centered, so the silhouette matches the screenshot.

## 2. Final body copy (single, crisp, CEO-tuned)

Evaluation of the supplied copy: it lands the diagnosis well ("scattered, ruminated or burnt out") and the reframe ("Self Mastery, not self improvement"), but it has three small problems for a CEO reader: (1) the exclamation marks soften the authority, (2) "A new era…is here" reads as marketing rather than product, and (3) it doesn't tell the user what is about to happen next — which is the whole job of an onboarding intro.

Recommended final copy (replaces the three-paragraph glass card):

> **Most leaders don't fail from lack of strategy. They fail from showing up scattered, ruminated, or burnt out.**
>
> Mind Module is the executive cognitive performance layer for how you actually show up — under pressure, between decisions, across the week.
>
> The next few minutes are a two-way calibration: you get to know the app, and Mind Module gets to know your leadership context, your pressure points, and how your mind works under load.
>
> This isn't self-improvement. It's Self Mastery.

Rationale:
- Keeps the user's exact opening diagnosis verbatim.
- Replaces "new era…is here" with a one-line product definition that earns the claim.
- Adds the missing onboarding frame — explicitly says this is mutual calibration, sets expectation for what the next screens do, without listing steps.
- Closes on the user's "Self Mastery" reframe as a standalone line for emphasis.
- Drops exclamation marks; CEO voice doesn't shout.

The glass card container (`bg-white/15 backdrop-blur-md border border-white/40 rounded-3xl`) stays. Paragraph type stays at `text-[15px] text-white/90 font-body leading-relaxed` with `space-y-4`. The opening line is rendered slightly stronger (`text-white` rather than `text-white/90`) so the diagnosis lands first.

## 3. Untouched

- Route on CTA stays `/onboarding/app-intro`.
- "Let's begin" label, button styling, Privacy by Design footer, background image, and gradient scrim are unchanged.
- No changes to any other onboarding stage, routing, or edge functions.

## Acceptance

- `/onboarding` brand cluster visually matches `/` (auth) brand cluster on mobile (390×844).
- Body copy reads as the single block above.
- CTA still routes to `/onboarding/app-intro`.
- No regressions elsewhere.
