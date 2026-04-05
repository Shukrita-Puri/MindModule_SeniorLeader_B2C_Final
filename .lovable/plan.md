
Goal: fix the Evening Depleted hero so only the actual illustrated clouds move horizontally across the frame, with no duplicated suns, no chopped rectangles, and no extra synthetic sky effects.

What I found
- The current bug is not “video playback is broken” — it is the animation method.
- `IllustratedCloudBands.tsx` is moving rectangular crops of the full image (`evening-depleted-v2.png`) inside fixed boxes.
- Because each crop contains more than just clouds, the animation reveals duplicated horizon/sun details and visible cut-box artifacts, exactly like your screenshot.
- `EveningDepleted.tsx` still layers extra stars, mist, shimmer, and birds on top, which is the opposite of your latest direction.
- The video is portrait (`1080x1920`) and then cropped into a short hero on `/executive-home`, so subtle motion becomes even harder to notice unless the cloud movement is very clean and intentional.

Plan
1. Strip the scene back to the artwork only
- Remove the extra motion layers from `remotion/src/EveningDepleted.tsx` for this composition:
  - `TwinklingStars`
  - `HorizonLight`
  - `RisingMist`
  - `BirdFlocks`
- Keep the base image and a single cloud-animation layer only.

2. Replace the current “moving crop boxes” approach
- Rebuild `remotion/src/eveningDepleted/IllustratedCloudBands.tsx` so it does not animate plain rectangular windows of the full artwork.
- Instead, use cloud-shaped masks aligned to the existing cloud formations in the image.
- Each mask will reveal only the cloud silhouette region, not the sun/horizon/land beneath it.

3. Animate only the existing clouds
- Create 3–5 cloud masks matching the major visible cloud bands in the art.
- For each cloud group:
  - move horizontally left-to-right or right-to-left
  - keep vertical movement at zero or near-zero
  - use small independent speeds so it feels natural
- Keep motion stronger than before so it reads inside the cropped hero, but still tasteful.

4. Prevent seams and visual tearing
- Overscan the source image behind each mask so horizontal movement never exposes empty edges.
- Ensure each animated cloud layer is large enough to slide without showing box boundaries.
- Feather mask edges slightly so movement blends into the static painting.

5. Keep the rest of the artwork static
- Sun, hills, horizon lines, and lower landscape remain fixed.
- No pulsing glow, no added mist, no birds, no star twinkle for this version.

6. Re-render and update the app-facing asset
- Re-render the Remotion composition to `depleted-evening.mp4`.
- Keep the existing hero hookup in `src/pages/ExecutiveHome.tsx`, since the main issue is the rendered motion design, not the page wiring.

Technical details
```text
Current problem:
full image
  -> cropped into rectangles
  -> rectangles translated
  -> non-cloud content inside those rectangles also moves
  -> duplicated sun / horizon seams appear

Planned fix:
full image as static background
  + cloud-shaped masked duplicates of same image
  + only masked cloud regions translate horizontally
  + everything else stays locked
```

Files to update
- `remotion/src/EveningDepleted.tsx`
- `remotion/src/eveningDepleted/IllustratedCloudBands.tsx`

Expected result
- The exact clouds already present in the illustration visibly drift sideways.
- No fake overlay clouds.
- No rectangular cutout artifacts.
- No duplicated sun slices.
- The hero reads as a calm animated painting instead of a broken collage.

Verification after implementation
- Check the motion directly in the hero on `/executive-home`, not just in the file viewer.
- Confirm on the mobile-sized hero crop that:
  - clouds visibly move
  - the sun and hills do not move
  - no seams/boxes appear
  - loop feels smooth end-to-end
