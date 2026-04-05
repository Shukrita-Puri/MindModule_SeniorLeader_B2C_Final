

# Redesign Hero Visuals — Diverse Nature Scenes, Lighter Palette, Active Calm

## Problem Summary
1. **All 15 base images are the same scene** — rolling hills with sun/horizon. No variety.
2. **Too dark** — sky gradients and vignettes make everything nearly black, especially evening.
3. **Sun shown at night** — evening images inaccurately depict the sun.
4. **Not empowering** — dark, heavy imagery doesn't convey strength, inspiration, or the "active calm" executive energy the app requires.
5. **Video appears at sky level** — the composition is cropped so only sky is visible on the homepage, hiding the landscape.

## Design Direction

Each of the 15 states gets a **unique nature scene** — not just "hills + sun" repeated. The scenes should feel like standing at the edge of something extraordinary: elevated, powerful, calm. Inspired by the original depleted-evening's use of color and engraved texture, but lighter and more varied.

### Scene Assignments (unique per state)

| State | Scene | Why |
|-------|-------|-----|
| depleted-morning | Misty coastal cliffs, fog rolling over dark water | Challenge ahead, solid ground |
| managing-morning | River valley at dawn, light touching the water | Steady flow, day beginning |
| strong-morning | Mountain ridge with wildflowers, sun breaking through | Elevated, ready |
| peak-morning | Vast alpine panorama, eagles in flight, golden light | Everything visible, commanding |
| veryhigh-morning | Open ocean horizon from high headland, infinite sky | No resistance, pure forward |
| depleted-afternoon | Dense forest with a single clearing of light | Heavy canopy, but light exists |
| managing-afternoon | Rolling wheat fields under mixed sky | Getting through, steady |
| strong-afternoon | Lake reflecting mountains, crisp clear water | Clarity, command |
| peak-afternoon | Desert mesa / canyon viewed from summit, vast expanse | Full capacity, full view |
| veryhigh-afternoon | Volcanic island coast, open Pacific horizon | Nothing can obscure this |
| depleted-evening | Rain on a stone terrace, city lights in far distance | Rest is earned (night, no sun) |
| managing-evening | Autumn forest path, last amber light through trees | Day handled, winding down |
| strong-evening | Harbour with moored boats, calm water, twilight sky | Day delivered, satisfaction |
| peak-evening | Mountain lake under starlight, reflection of stars | Exceptional day, dignity |
| veryhigh-evening | Open starfield from high plateau, warm horizon glow | Well done, cosmic calm |

### Lighter Palette Standard
- **Morning**: Sky gradients start at 35-55% lightness (not 14-26%)
- **Afternoon**: Sky gradients at 40-60% lightness
- **Evening**: Sky gradients at 18-30% lightness (was 10-14%) — dark but not black
- Vignette opacity reduced from 50% to 25%
- Bottom fade lightened by 15-20% across the board

### Composition Fix
- Base images use **lower horizon line** (landscape fills bottom 50-60% of frame)
- This ensures when displayed on the homepage, the landscape is visible — not just sky

## Implementation Steps

### 1. Rewrite image generation prompts
Update `remotion/scripts/generate-images.mjs` with 15 unique nature scene prompts. Each prompt includes:
- The engraved/woodcut art style (unchanged)
- The specific unique scene described above
- A lighter color palette directive ("use warm, visible tones — not dark")
- Composition: "horizon line in upper third, landscape fills 50-60% of frame"
- No sun in evening images

### 2. Regenerate all 15 base images
Run the updated script with `FORCE=1` to overwrite existing images.

### 3. Lighten the visual config
Update `remotion/src/config/visualConfig.ts`:
- Raise all `skyGradient` HSL lightness values by 15-25%
- Lighten `vignetteColor` and `bottomFadeColor` correspondingly
- Reduce vignette overlay opacity in `HeroVisual.tsx`

### 4. Re-render all 21 videos
Run the batch render script to produce new MP4s with the lighter palette and diverse scenes.

### 5. Verify on homepage
Confirm the videos appear with visible landscape, lighter treatment, and diverse nature scenes.

### Files Modified
- `remotion/scripts/generate-images.mjs` — 15 new unique prompts
- `remotion/src/config/visualConfig.ts` — lighter gradients across all 15 configs
- `remotion/src/HeroVisual.tsx` — reduce vignette overlay opacity
- `remotion/public/images/*.png` — 15 regenerated base illustrations
- `public/all-visuals/videos/*.mp4` — 21 re-rendered videos

