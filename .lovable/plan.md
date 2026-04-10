

# Reset Studio Visual Regeneration Plan

## Overview

Generate 40+ new AI illustrations for all Reset Studio practice card thumbnails using an engraved illustration style with palette-specific color direction per mastery bucket. Archive all existing images. Update all code references.

## Image Generation Approach

Use the AI gateway script (`lovable_ai.py`) with `google/gemini-3-pro-image-preview` to generate each image. Each image gets a detailed prompt combining:
- Base style (engraved illustration, fine line work, crosshatching, stippling, 19th-century scientific illustration meets New Yorker editorial)
- Practice-specific scene description (from user spec)
- Palette-specific color direction (steel blue / deep teal / warm charcoal-ochre)

Images saved to `src/assets/recalibrate/` in new subdirectories to keep archive separate.

## Architecture

### Step 1: Archive existing images
- Rename existing directories:
  - `src/assets/recalibrate/pause/` → `src/assets/recalibrate/pause-archive/`
  - `src/assets/recalibrate/presence/` → `src/assets/recalibrate/presence-archive/`
  - `src/assets/recalibrate/power-up/` → `src/assets/recalibrate/power-up-archive/`
- Create fresh `pause/`, `presence/`, `power-up/` directories

### Step 2: Generate images (batch script)

Write a generation script that produces one PNG per practice with the exact prompt from the user's spec. ~40 images total across 3 buckets.

**PAUSE MASTERY (steel blue palette) — 14 images:**
- `grounding-touch.png` — Bare feet on stone at dawn
- `release-exhale.png` — Breath visible in cold air, scientific illustration
- `vagus-wind-down.png` — Still water at dusk, figure at water's edge
- `harmonic-calm.png` — Tibetan bowl from above, concentric rings
- `deep-calm-forest-bathing.png` — Ancient forest canopy from below
- `pranayama-clarity.png` — Lungs expanding, anatomical engraving
- `fudoshin-immovable-mind.png` — Tree in storm, roots in cross-section
- `eye-of-storm.png` — Hurricane eye from satellite, engraved
- `stillness-gap.png` — Space between two waves
- `detachment-observer.png` — Figure on high vantage watching city
- `softness-release.png` — Hand releasing bird at moment of release
- `box-breathing.png` — Geometric square, four phases of breath
- `somatic-touch-grounding.png` (reuse grounding-touch)
- `soundscape-pause-visual.png` (general pause category image)

**FLOW MASTERY (deep teal palette) — 16 images:**
- `bhramari-pranayama.png` — Sound waves, concentric lines
- `trataka-flame-gaze.png` — Single flame in detail
- `kapalabhati-pranayama.png` — Mountain summit at first light
- `energy-forge.png` — Forge fire in teal
- `deep-focus-monastic-resonance.png` — Bell cross-section
- `sustained-focus-choir-harmonic.png` — Sheet music as engraving
- `wu-wei-flow.png` — Water through rock, overhead
- `mushin-no-mind.png` — Racing circuit from above, apex line
- `jobs-simplicity.png` — Single line on vast surface
- `ikigai-purpose.png` — Dawn light in workshop
- `single-thread-focus.png` — Spider's web, one thread traced
- `first-move-momentum.png` — Stone into still water, first ripple
- `rhythm-pulse.png` — ECG trace as landscape
- `mastery-constraint.png` — Bonsai tree cross-section
- `stoic-reflection.png` — Desk at night, lamp, journal
- `soundscape-flow-visual.png` (general flow category image)

**POWER MASTERY (warm charcoal/ochre palette) — 14 images:**
- `warrior-drums.png` — Taiko drum face from above
- `energised-focus-didgeridoo-bowls.png` — Aboriginal elder at dawn
- `energy-forge-power.png` — Volcanic landscape at dawn
- `ina-night-fields.png` — Nagano countryside at night from high point
- `buddhist-phoenix.png` — Phoenix as Japanese woodblock/engraving
- `energy-reframe.png` — Figure at summit looking back
- `courage-future-self.png` — Path splitting at headland
- `confidence-through-evidence.png` — Wall covered in engraved marks
- `energy-through-completion.png` — Map with all routes completed
- `courage-arena.png` — View from tunnel toward arena
- `basque-txalaparta.png` — (Basque wooden percussion instrument)
- `soundscape-renewal-visual.png` (general power category image)
- `architectural-power-up.png` (main page card image)
- `architectural-pause.png` / `architectural-presence.png` (main page cards — regenerated to match new style)

### Step 3: Update code references

**Files to edit (imports and filenames only — no logic changes):**

1. **`src/data/practicesAndSoundscapes.ts`** — Update all `import` statements at top to point to new PNG files. Update `thumbnail` field references where variable names change.

2. **`src/pages/MicroPracticePlayerCards.tsx`** — Update `import` statements and `getBackgroundForPractice()` switch to use new images.

3. **`src/data/microExerciseThumbnails.ts`** — Update category fallback thumbnails to new images.

4. **`src/pages/RecalibrateMode.tsx`** — Update 3 main page card images (architecturalPause, architecturalPresence, architecturalPowerUp).

5. **`src/pages/recalibrate/PauseOutcomePage.tsx`**, **`PresenceOutcomePage.tsx`**, **`PowerUpOutcomePage.tsx`** — No code changes needed (they read `item.thumbnail` from the data catalog, which gets updated in step 1).

6. **`src/pages/MicroPracticePlayer.tsx`**, **`SoundscapePlayer.tsx`**, **`GuidedPracticePlayer.tsx`** — No code changes needed (they read `practice.thumbnail` or `content.thumbnail` from the data catalog).

### Step 4: Verify

- All practice cards show new engraved illustrations
- Palette consistency: Pause=steel blue, Flow=deep teal, Power=warm charcoal/ochre
- No broken image references
- No content, routing, logic, or DB changes
- Works identically for dev_mode and auth users (images are static assets)

## What does NOT change

- Practice titles, content, steps, tags
- Card layout and structure
- Routing or navigation
- Database records
- Category/bucket assignments
- Favourite status
- Any recommendation or scoring logic

## Technical notes

- Image generation will be done via `code--exec` using the AI gateway script with `google/gemini-3-pro-image-preview` model
- Each image generated at appropriate resolution for mobile card thumbnails (~800x600 or similar)
- Images saved as PNG directly into the asset directories
- Due to the volume (~40 images), generation will be batched with delays to avoid rate limits
- The 3 main page hero cards (`architectural-*`) will also be regenerated in the new style to maintain visual consistency

