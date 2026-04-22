

## Plan: Convert check-in colors & sliders to engraved-pencil aesthetic

UI-only update. No DB, logic, routing, or downstream impact. Both `/daily-check-in` and `/check-in-detail` get the same engraved-pencil treatment as the rest of the Active Calm visual system — but **in color**, not B&W, so the spectrum (coral → cobalt) and the slider gradient remain readable.

### What "engraved pencil in color" means here

A subtle SVG hatching/cross-hatch overlay applied on top of each existing colored fill, blended with `mix-blend-mode: multiply` at low opacity. The base hex colors stay exactly as they are (already approved last turn). The hatching adds:
- fine diagonal pencil strokes (~1px, 3-4px spacing)
- a soft inner shadow to suggest paper depth
- a slightly desaturated, "drawn" feel — no flat plastic surfaces

This matches the existing engraved-pencil treatment used in `EngravedLoader`, Reset Studio, and the onboarding hero (B&W woodcut), now extended to color surfaces.

### `/daily-check-in` — the 5 state buttons

Each of the 5 colored buttons (`overwhelmed` coral → `focused` cobalt) becomes:
- Base: existing accent hex (unchanged).
- Overlay: small inline SVG `<pattern>` of diagonal pencil strokes at ~12% opacity, `mix-blend-mode: multiply`.
- Edge: thin 1px inner border in `rgba(0,0,0,0.12)` to suggest a drawn outline.
- Selected state: the existing ring + scale stays; the hatching becomes slightly denser (opacity ~18%) to read as "pressed in."
- Icon + label: stay white, unchanged.

Implemented as a single reusable `<EngravedFill />` helper rendered absolutely inside each button, so the change is one component swap, not five.

### `/check-in-detail` — the 3 luxury sliders (Sharpness / Clarity / Confidence)

Currently the `luxury` slider variant uses a flat grey gradient (`from-[#9ca3af] to-[#374151]`). New treatment:
- **Track** (`bg-secondary`): keep the existing tone, add the same diagonal pencil hatching pattern at ~10% opacity → reads as paper/parchment.
- **Range** (filled portion): keep the warm→cool spectrum gradient (coral `#d8553f` → ochre `#d4b75a` → sage `#7ba87a` → cobalt `#3d6fa8`) so the slider visually echoes the page-1 spectrum and reinforces "more = cooler/clearer." Hatching overlay at ~15% opacity, `mix-blend-mode: multiply`.
- **Thumb**: keep the existing 8×8 circle, add a soft pencil ring (1px `rgba(0,0,0,0.2)` inner stroke) and a faint cross-hatch dot in the center — reads as a hand-drawn marker on the rule.
- Tick labels (Depleted/Peak, Clouded/Crystal, Reactive/Unshakable): unchanged.

Done by extending the existing `luxury` variant in `src/components/ui/slider.tsx` — no new variant, no API change, no consumer updates.

### Files touched

| File | Change |
|---|---|
| `src/components/ui/engraved-fill.tsx` *(new, ~25 lines)* | Reusable absolute-positioned SVG pattern overlay (`<defs><pattern>` of diagonal lines), props: `density`, `opacity`, `className`. |
| `src/pages/DailyCheckIn.tsx` | Render `<EngravedFill />` inside each of the 5 state buttons. No color, layout, logic changes. |
| `src/components/ui/slider.tsx` | Extend `luxury` variant: gradient range becomes coral→cobalt; track + range get inline SVG hatching overlay; thumb gets pencil ring. |

### What does NOT change

- Hex values from the previous palette update (still `#d8553f` … `#3d6fa8`).
- Page layout, typography, button sizes, ring/scale selection, Confirm CTA.
- Slider min/max/step (1–5), labels, value handling.
- DB schema, edge functions, RLS, caching — none.
- Other consumers of the `default` slider variant — untouched (only `luxury` changes).
- The `outcome` enum, brief/plan/insights downstream logic.

### Verification

1. `/daily-check-in` mobile + 1094px: 5 buttons render with subtle pencil hatching over each color; selection still scales + rings; tap → Confirm flow unchanged.
2. `/check-in-detail`: 3 sliders show paper-textured tracks with a colored, hatched fill that grows coral→cobalt as the value rises; thumb reads as a drawn marker; drag/tap interaction identical.
3. WCAG AA: white icon + label still pass on all 5 hatched colors (hatching is multiply-blended at low opacity, contrast preserved within ±2%).
4. No regression on any other slider in the app (`default` variant unaffected).
5. No console/network changes; no new requests.

### Out of scope

- Changing the actual color values (already approved).
- B&W woodcut treatment (those are reserved for hero/onboarding imagery, not interactive controls).
- Animating the hatching (static pattern only; performance-safe on mobile).
- Page-2 layout, headings, or copy.

