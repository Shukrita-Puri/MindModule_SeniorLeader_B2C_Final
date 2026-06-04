## Goal

Two surgical UI changes on the Today flow (`/executive-home`, `/check-in`, `/plan`):

1. **Lift the content cards up so they overlap the hero**, making the hero + taupe canvas read as one continuous background behind the card. Hero keeps its current height (`h-[280px] md:h-[340px]`); the card simply floats on top and ends up occupying ~70–75% of the viewport.
2. **Make the greeting ("Standing by, Shuk") reliably visible** across morning (bright clouds/sun), afternoon (cliff/sky) and evening (dark moon-lake) hero visuals.

No changes to data, routing, scoring, brief, or plan logic.

## 1. Overlap cards on the hero

The hero lives in a `relative` wrapper directly above the scrollable content section. Today the content section starts *below* the hero, so the card sits beneath it. We pull the content up with a negative margin equal to roughly 60% of the hero height and raise its z-index so it floats above the hero. The hero's existing bottom taupe-fade already dissolves into `--canvas-hi`, so the seam stays invisible.

### `src/pages/ExecutiveHome.tsx`
- On the content wrapper (currently `<div className="flex-1 w-full pb-[...]">`), add `relative z-20 -mt-[170px] md:-mt-[210px]`.
- Inside `HomeSwipeShell` pages (MRS card lives in `MrsPage`, Brief card, Plan card), the cards already have their own white/taupe surfaces — no per-card change needed.

### `src/pages/PlanPage.tsx`
- On the wrapper that holds the plan content directly below `<TodayHero />`, add the same `relative z-20 -mt-[170px] md:-mt-[210px]`.

### `src/pages/DailyCheckIn.tsx` and `src/pages/CheckInDetail.tsx`
- Same treatment on the content wrapper immediately following `<TodayHero />`.

### Hero itself (`src/components/today/TodayHero.tsx`)
- No height change. Keep `h-[280px] md:h-[340px]`.
- Keep the existing bottom canvas fade (already dissolves into taupe).
- Ensure the hero wrapper stays `relative` with default z (cards above it).

Net effect: top ~110/130px of hero visible (sky + greeting), card body covers the rest of the hero and continues down the page over the taupe canvas — ~70–75% of viewport on a phone.

## 2. Greeting legibility across all three TODs

Currently the greeting is ink (`text-[#1a1712]`) with a white halo — invisible on the dark evening visual.

Switch to a **light-on-dark scheme that survives bright skies too**:

### `src/components/today/TodayGreeting.tsx`
- Text color → `text-white`.
- Shadow → `drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)] drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]` (double drop-shadow = soft halo + crisp edge; reads on both bright clouds and dark moonlight).
- Pencil icon → `text-white/80` with the same shadow.
- Edit-mode input pill stays as-is (white surface, ink text) so it's still readable when typing.

### `src/components/today/TodayHero.tsx` — small top-tint bump for greeting contrast
Add a subtle **top** vignette per TOD so the greeting always sits on a slightly darker band, without dimming the engraving below:
- Replace single `TOD_OVERLAY` gradient with two stacked gradients:
  - Top band (0 → 25% of hero): `linear-gradient(180deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0) 100%)` — universal greeting backstop.
  - Bottom band (existing TOD tint, unchanged).
- This keeps mid-hero detail fully legible while guaranteeing the greeting has contrast on morning/afternoon's bright skies.

## Out of scope

- Hero image regeneration, hero height, hero filter, taupe fade direction.
- Front page (`/`), navigation, brief/plan/score logic, card internals.

## Verification

1. `/executive-home`, `/check-in`, `/plan` at mobile width (390×844):
   - Card visually overlaps the hero; top ~30% of screen shows hero, bottom ~70% shows card on taupe.
   - Hero → taupe transition has no hard seam (card covers the join).
2. "Standing by, Shuk" is clearly readable on all three TOD visuals (cycle by changing system time or temporarily hardcoding `tod`).
3. Sidebar trigger + any header controls still tappable (z-index check).
4. No console errors; no layout shift on first paint.
