# Global App Background — Recalibrate Gradient

## Goal
Every app page shares the same warm-taupe radial+linear gradient currently used on `/recalibrate`. Cards, hero illustrations, copy, buttons, ordering, and behaviour stay exactly as they are. Only the page background changes.

## The gradient (verbatim from `RecalibrateMode.tsx`)
```
radial-gradient(ellipse 120% 80% at 15% -10%, hsl(0 0% 100%/0.55) 0%, hsl(0 0% 100%/0.16) 30%, transparent 58%),
radial-gradient(ellipse 90% 60% at 110% 110%, hsl(var(--taupe-rich)/0.42) 0%, transparent 60%),
linear-gradient(165deg, hsl(var(--taupe-highlight)/0.55) 0%, hsl(var(--taupe)/0.22) 55%, hsl(var(--taupe-rich)/0.45) 100%)
```

## Approach (single source of truth)

1. **`src/index.css`** — add `.bg-app-surface { background: <gradient>; background-attachment: fixed; }` and apply it to `body` (replacing `bg-background` in the body rule, keeping `text-foreground font-body`, font-size, line-height untouched). The `--background` token and `bg-background` Tailwind class stay unchanged so cards, popovers, sticky `bg-background/40` headers and `bg-background/70` button surfaces are unaffected.

2. **Page-level wrappers** — drop solid `bg-background` from the outermost `min-h-screen` / `h-[100dvh]` container so the body gradient shows through. Files touched:
   - `src/pages/ExecutiveHome.tsx`
   - `src/pages/PlanPage.tsx`
   - `src/pages/DailyCheckIn.tsx` (both wrappers)
   - `src/pages/CheckInDetail.tsx` (outer + inner wrapper only; keep nested `bg-background/70` buttons)
   - `src/pages/Profile.tsx`
   - `src/pages/Refer.tsx`
   - `src/pages/Privacy.tsx`
   - `src/pages/Terms.tsx`
   - `src/pages/PoweredByAI.tsx`
   - `src/pages/ConnectedData.tsx`
   - `src/pages/JoinPage.tsx`
   - `src/pages/Signup.tsx` (both wrappers)
   - `src/pages/AuthCallback.tsx` (both wrappers)
   - `src/pages/Front.tsx`
   - `src/pages/onboarding/OnboardingFlow.tsx` (scroll container)
   - `src/pages/recalibrate/PauseOutcomePage.tsx`
   - `src/pages/recalibrate/PresenceOutcomePage.tsx`
   - `src/pages/recalibrate/PowerUpOutcomePage.tsx`
   - `src/components/ui/route-skeleton.tsx` (Suspense fallback)
   - Loading-state wrappers only in `MicroPracticePlayer.tsx`, `MicroPracticePlayerCards.tsx`, `SoundscapePlayer.tsx`, `GuidedPracticePlayer.tsx` (the actual full-bleed players are not touched)
   - `RecalibrateMode.tsx` — swap the inline `bg-[radial-gradient(...)]` for `bg-app-surface` (or just drop, since body provides it) so we keep one source of truth.

3. **v8 onboarding parchment** (confirmed: replace background only, leave visuals intact):
   - `src/pages/onboarding/stages/v8/ShellV8.tsx` — replace the `#f5f0e8` outer wrapper background and the footer's `bg-[#f5f0e8]` with the new app gradient (use `bg-app-surface` on outer; make footer transparent or `bg-app-surface`). Keep the art band image, the parchment-toned scrim *on top* of the art band (so headline contrast holds), text colours, layout, and CTAs unchanged.
   - Any v8 stage components that re-paint a solid parchment full-bleed (Stage* under `onboarding/stages/v8/`) — drop only the outer parchment wash; keep all inner cards, copy, art, CTAs.
   - Other onboarding stages (`Stage1Welcome` … `Stage8Results`, `StageUSPIntro`) — only their outermost wrapper background gets the gradient via the body; nothing else changes.

## Explicitly NOT touched
- `--background` token and any `bg-background/40`, `bg-background/70`, `bg-background/80` overlays.
- Cards, sidebars, headers, sticky toolbars, modals, buttons, icons.
- Full-bleed visual pages: Soundscape player (active), Guided Practice player (active), Micro Practice player (active), Recalibrate session pages, hero/illustration art bands.
- Any logic, routing, hooks, edge functions, copy, ordering.

## Verification
After build, screenshot Onboarding (v8 + classic), ExecutiveHome, Plan, DailyCheckIn, Insights, Profile, Refer, Recalibrate, an outcome page, Privacy, AuthCallback. Confirm: same gradient visible behind content, no card has lost its surface, no full-bleed visual is altered.
