

## Plan: unify check-in visual language with the refined slider engraving style

The `/check-in-detail` sliders already nail the "engraved pencil" look — clean diagonal cross-hatch texture on a smooth gradient rail with a neat white-disc thumb (visible in your screenshot). The `/daily-check-in` state buttons are using a heavier, scribbled variant of the same engraving that reads as noisy rather than refined. This plan brings the buttons in line with the slider's restrained style and confirms the slider thumb design stays exactly as it is in your reference.

### What changes

#### 1) `/daily-check-in` — 5 state buttons get the slider's refined engraving

Replace the current heavy zig-zag + wavy outline treatment on each colored button with the **same clean diagonal cross-hatch pattern used on the slider track** — fine, regular pencil hatching at low opacity, no displacement-noise filter, no wavy hand-drawn outline.

Concretely on each button:
- Base color: unchanged (`#d8553f` → `#3d6fa8`).
- Texture: clean diagonal cross-hatch (45° + -45° fine lines, ~0.6px stroke, ~3-4px spacing) at ~22% opacity, `mix-blend-mode: multiply`. Same family of marks as the slider rail.
- Selected state: same hatch, slightly denser (~30% opacity) — no change in shape, ring, or scale.
- Border: keep the existing 1px inset ring (`ring-black/[0.12]`). Drop the SVG wavy outline — the ring already gives the drawn-edge feel without making the rectangle look uneven.
- Icon + label: unchanged, still white, still `relative z-10`.

Result: buttons read as the *same material* as the slider rails — restrained engraved color surfaces, not scribbled woodcut panels.

#### 2) `/check-in-detail` slider — confirm thumb design matches your reference

Your second screenshot shows the slider thumb as a **white disc with diagonal hatch fill and a dark ring** — that is exactly the current `LuxuryThumb` render. So:
- Keep the thumb as-is (22×22 white disc, dark ring, central hatch dot, soft drop shadow).
- Keep the full coral→cobalt fixed-rail gradient (always visible).
- Keep the 5 tick notches.
- Keep the cross-hatch texture on the track (this is the reference style we're now propagating to the buttons).

No slider changes needed — just verifying it matches.

#### 3) "Continue to Today's Performance" CTA — untouched

Stays exactly as it is (saffron/orange, rounded, full-width). No engraving, no color change, no shape change.

### How this is implemented

A single, focused change to the engraving overlay used by the buttons — without touching the slider's overlay or the public `EngravedFill` API.

| File | Change |
|---|---|
| `src/components/ui/engraved-fill.tsx` | Add a `variant` prop with two values: `"refined"` (clean diagonal cross-hatch — what the slider already uses internally) and `"sketched"` (current zig-zag + turbulence). Default stays `"sketched"` so nothing else regresses. |
| `src/pages/DailyCheckIn.tsx` | Switch the button overlay to `variant="refined"`, drop `drawnOutline`, lower opacity to ~0.22 / ~0.30 (selected). Keep the existing 1px inset ring for the drawn-edge feel. No layout, color, logic, or state changes. |
| `src/components/ui/slider.tsx` | No change — slider already renders the refined hatch internally. Verifying only. |

### What does NOT change

- DB, edge functions, RLS, caching, downstream consumers — none.
- Page layouts, headings, copy, sticky CTA placement, routing, save handlers.
- Slider thumb, gradient rail, ticks, or interaction.
- "Confirm" and "Continue to Today's Performance" CTA designs.
- The 5 outcome hex colors.
- Any other consumer of `EngravedFill` (default variant preserved).

### Verification

1. `/daily-check-in`: each of the 5 colored buttons shows a **clean, restrained diagonal cross-hatch** (matching the slider rail), not a scribbled/noisy texture. Buttons are perfectly even rectangles. Tapping selects → Confirm enables → routes to `/check-in-detail`.
2. `/check-in-detail`: sliders unchanged — full spectrum rail visible, white-disc hatched thumb moves along it, tick notches present.
3. "Continue to Today's Performance" CTA visually identical to current.
4. WCAG AA: white icon + label on each color still pass at the lower hatch opacity.
5. No regression on any other page using `EngravedFill` — default variant unchanged.

### Out of scope

- Changing button colors, shapes, or sizes.
- Changing the slider thumb, rail, or ticks.
- Touching the CTA buttons.
- DB or downstream logic.

