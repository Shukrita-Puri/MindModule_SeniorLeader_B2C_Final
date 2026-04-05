

# Complete Hero Visual System — 21 Engraved Videos

## Summary
Build all 21 hero videos (15 primary + 6 divergence variants) using the existing Remotion pipeline and AI image generation, with a parametric composition system that reuses motion layers.

## Architecture

The existing `EveningDepleted.tsx` + `NaturalMotionLayers.tsx` prove the pattern works. Instead of 21 separate components, we build **one parametric composition** that accepts `tier`, `timeOfDay`, and `variant` as props, controlling:
- Which base illustration to load
- Color palette for overlays/gradients
- Motion behavior (morning = forward drift, afternoon = fixed, evening = settling)
- Which motion layers to show (birds, clouds, sun rays, stars, mist)

```text
┌─────────────────────────────────────────────┐
│  Parametric Composition (HeroVisual.tsx)    │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ Base Image   │  │ Motion Layers        │  │
│  │ (AI-gen PNG) │  │ - Clouds (all)       │  │
│  │              │  │ - Sun/Rays (morn/aft)│  │
│  │              │  │ - Stars (evening)    │  │
│  │              │  │ - Birds (morn/eve)   │  │
│  │              │  │ - Mist (eve/depleted)│  │
│  │              │  │ - Horizon glow       │  │
│  └─────────────┘  └──────────────────────┘  │
│  ┌──────────────────────────────────────┐   │
│  │ Camera Motion                        │   │
│  │ Morning: slow drift toward horizon   │   │
│  │ Afternoon: static, commanding        │   │
│  │ Evening: slow downward settle        │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Step-by-step

### 1. Generate 15 base illustrations
Use AI image generation (Gemini image model) with the exact prompts from the brief. Each gets a unique PNG saved to `remotion/public/images/`. The base style prompt is constant; tier × time additions vary per image.

Files: `remotion/public/images/{tier}-{time}.png` (e.g. `depleted-morning.png`, `peak-evening.png`)

### 2. Build parametric motion system
Refactor the existing motion layers into a configurable system:

**`remotion/src/motionLayers/`** — shared components:
- `DriftingClouds.tsx` — cloud count, speed, opacity, color configurable per tier
- `SunRays.tsx` — new component for morning/afternoon sun with pulsing rays
- `TwinklingStars.tsx` — existing, used for evening scenes
- `HorizonGlow.tsx` — refactored from `HorizonLight`, color-configurable (amber for evening, gold for morning, silver for afternoon)
- `BirdFlocks.tsx` — existing, used for morning/evening
- `RisingMist.tsx` — existing, heavier for depleted tiers
- `CameraDrift.tsx` — wrapper that applies the time-of-day camera motion to children

**`remotion/src/HeroVisual.tsx`** — single parametric component:
- Props: `{ tier, timeOfDay, variant? }`
- Selects correct base image, gradient palette, motion layers, and camera behavior
- Tier controls: cloud density, sun brightness, landscape shadow depth, overall warmth
- Time controls: which layers appear, camera direction

**`remotion/src/config/visualConfig.ts`** — palette and motion config per tier×time:
- Gradient colors, overlay opacities, motion speeds, layer visibility flags

### 3. Register compositions and render
Update `Root.tsx` to register all 21 compositions (or use `calculateMetadata` for dynamic props).

**Render script** iterates through all 21 combinations, rendering each to `public/all-visuals/videos/{name}.mp4`.

### 4. Generate 6 divergence variants
For "masked high" and "recovery underway" states (×3 time periods):
- Use the same base images but apply a color overlay shift:
  - **Recovery**: warmer tone (amber/sepia overlay ~10% opacity)
  - **Masked high**: cooler tone (blue/steel overlay ~10% opacity)
- File names: `recovery-morning.mp4`, `masked-morning.mp4`, etc.

### 5. Update ExecutiveHome.tsx video map
- Add `very_high` tier (currently missing — mapped to `default`)
- Add divergence variant logic: when wearable/check-in diverge, select the variant video
- This requires checking the energy state for divergence flags

### Video inventory (21 total)

| # | File | Key motion |
|---|------|-----------|
| 1 | depleted-morning.mp4 | Heavy clouds drift R, faint sun pulse |
| 2 | managing-morning.mp4 | Partial clouds drift, moderate sun rays |
| 3 | strong-morning.mp4 | Organized clouds, strong sun rays breaking |
| 4 | peak-morning.mp4 | Clear sky, dramatic sun, bird flocks |
| 5 | veryhigh-morning.mp4 | Open sky, commanding sun, birds |
| 6 | depleted-afternoon.mp4 | Dense overcast drifting, one light shaft |
| 7 | managing-afternoon.mp4 | Mixed cloud/clear, diffuse rays |
| 8 | strong-afternoon.mp4 | Clear blue, single cloud formation drifts |
| 9 | peak-afternoon.mp4 | Max sky, full sun rays across frame |
| 10 | veryhigh-afternoon.mp4 | Cloudless, dominant sun |
| 11 | depleted-evening.mp4 | ✅ Already done — stars, mist, horizon dim |
| 12 | managing-evening.mp4 | Amber horizon, deepening blue, mist |
| 13 | strong-evening.mp4 | Rich sunset glow, clouds lit from below |
| 14 | peak-evening.mp4 | Dramatic indigo/gold, stars appearing |
| 15 | veryhigh-evening.mp4 | Stars visible, warm horizon, open sky |
| 16-18 | recovery-{time}.mp4 | Warmer color treatment overlay |
| 19-21 | masked-{time}.mp4 | Cooler color treatment overlay |

### Files created/modified

**Created:**
- `remotion/src/HeroVisual.tsx` — parametric composition
- `remotion/src/config/visualConfig.ts` — tier×time config
- `remotion/src/motionLayers/SunRays.tsx` — new sun component
- `remotion/src/motionLayers/CameraDrift.tsx` — camera wrapper
- `remotion/src/motionLayers/*.tsx` — refactored shared layers
- `remotion/scripts/render-all.mjs` — batch render script
- `remotion/public/images/*.png` — 15 base illustrations
- `public/all-visuals/videos/*.mp4` — 20 new videos (1 exists)

**Modified:**
- `remotion/src/Root.tsx` — register all compositions
- `src/pages/ExecutiveHome.tsx` — add `very_high` tier + divergence logic

### Rendering approach
Each video renders in ~60-90s. With 21 videos, batch rendering will take multiple execution rounds. We'll render in groups of 3-4 to stay within timeout limits, prioritizing by time-of-day (evening first since user is testing now).

