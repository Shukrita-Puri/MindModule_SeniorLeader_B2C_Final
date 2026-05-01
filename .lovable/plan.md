## Goal

Isolated **color-only** change on `/daily-check-in` (state buttons) and `/check-in-detail` (three sliders). Each surface gets its own **single-hue light→dark sequential ramp** mapped to its psychological theme. No logic, scoring, layout, slider mechanics, thumb, engraved hatch, ticks, button geometry, or CTA behavior changes.

## Scope (strict)

Touched files (color values only):
1. `src/components/ui/slider.tsx` — extend `variant` to accept per-theme gradients (`energy` already not used; add `clarity`, `confidence`, `sharpness`). Keep existing `luxury` variant intact as fallback.
2. `src/pages/CheckInDetail.tsx` — pass the matching variant to each of the 3 sliders.
3. `src/pages/DailyCheckIn.tsx` — replace the 5 `accent` hex values in the `outcomes` array with an Indigo/Electric Blue light→dark ramp.

Explicitly NOT touched:
- Slider track height, thumb (`LuxuryThumb`), `EngravedFill`, hatch density/opacity, range shadow, ticks.
- Slider score range (1–5), labels, value handlers, save logic, slider order on the page.
- Button sizes, ring, shadow, scale, icons, ordering, sticky CTA styling.
- Tier traffic-light tokens in `src/index.css` (`--tier-*`).
- Any other page, component, or token.

## Theme → color mapping

Each surface uses a **single-hue** light→dark gradient (5 stops) so the lightest end reads as the lower state and the darkest end as the peak state — matching the existing left-to-right semantic of the slider and the Overloaded→Focused order of the buttons.

### `/daily-check-in` — Mental Energy buttons (Indigo / Electric Blue)

5-stop ramp (Overloaded → Focused, lightest → darkest), legibility-corrected for white text + EngravedFill overlay:

| # | Outcome     | Hex       |
|---|-------------|-----------|
| 1 | Overloaded  | `#8AA0E0` |
| 2 | Drained     | `#6A82D8` |
| 3 | Scattered   | `#4F63C8` |
| 4 | Steady      | `#3949AB` |
| 5 | Focused     | `#283593` |

### `/check-in-detail` — three sliders

Each gradient runs left (depleted) → right (peak) in 5 stops.

**Sharpness — Vivid Yellow → Dark Amber**
```
linear-gradient(90deg,#FFE082 0%,#FFD54F 25%,#FFC107 50%,#FFA000 75%,#B8860B 100%)
```

**Clarity — Pale Cyan → Deep Teal**
```
linear-gradient(90deg,#B2EBF2 0%,#80DEEA 25%,#26C6DA 50%,#0097A7 75%,#006064 100%)
```

**Confidence — Soft Lavender → Deep Royal Purple**
```
linear-gradient(90deg,#B39DDB 0%,#9575CD 25%,#7E57C2 50%,#5E35B1 75%,#311B92 100%)
```

(Slider thumb fill stays off-white per `LuxuryThumb`; pencil hatch stays black; only the underlying track gradient changes.)

## Changes

### `src/components/ui/slider.tsx`
- Replace the single `LUXURY_SPECTRUM` constant with a small map:
  ```ts
  const LUXURY_SPECTRUMS = {
    luxury:     "linear-gradient(90deg,#8FB3D9 0%,#6E9AC8 25%,#4A7FB0 50%,#2B6CB0 75%,#1E4E83 100%)", // unused but kept as default
    sharpness:  "linear-gradient(90deg,#FFE082 0%,#FFD54F 25%,#FFC107 50%,#FFA000 75%,#B8860B 100%)",
    clarity:    "linear-gradient(90deg,#B2EBF2 0%,#80DEEA 25%,#26C6DA 50%,#0097A7 75%,#006064 100%)",
    confidence: "linear-gradient(90deg,#B39DDB 0%,#9575CD 25%,#7E57C2 50%,#5E35B1 75%,#311B92 100%)",
  } as const;
  ```
- Extend the `variant` union in `sliderTrackVariants` / `sliderRangeVariants` / `sliderThumbVariants` to include `sharpness | clarity | confidence`. All three reuse the **same styles as `luxury`** (track height, hatch overlay, transparent range with inset shadow, LuxuryThumb, ticks). Only the `backgroundImage` differs.
- In the `Slider` render: `style={ variant && variant !== "default" ? { backgroundImage: LUXURY_SPECTRUMS[variant] } : undefined }`.
- Show `LuxuryThumb` + `LuxuryTicks` + `EngravedFill` whenever `variant !== "default"`.

No other behavior change — the component API is additive and backward-compatible (`variant="luxury"` keeps working unchanged).

### `src/pages/CheckInDetail.tsx`
Change only the `variant` prop on each of the 3 sliders, in the order they currently appear:
- Sharpness slider → `variant="sharpness"`
- Clarity slider → `variant="clarity"`
- Confidence slider → `variant="confidence"`

Nothing else touched (handlers, labels, layout, CTA, save flow all unchanged).

### `src/pages/DailyCheckIn.tsx`
Replace only the 5 `accent` hex values in the `outcomes` array with the Indigo ramp above (same order: Overloaded, Drained, Scattered, Steady, Focused). Icons, titles, values, ordering, button classes unchanged.

## Verification checklist

- `/daily-check-in`: 5 buttons identical in shape/icon/order; fills are now an Indigo light→dark ramp. White text remains legible against EngravedFill overlay. CTA button untouched.
- `/check-in-detail`: 3 sliders render with identical track height, hatch overlay, ticks, and pencil thumb. Track gradients are now Yellow (Sharpness), Teal/Cyan (Clarity), Purple (Confidence) respectively.
- No other route, readiness/tier color, or component affected.
