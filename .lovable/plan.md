
## Goal

The current Today hero (executive-home / check-in / plan) uses 3 images with a heavy dark wash that crushes detail — the morning/afternoon/evening visuals end up looking identical and the engraved style disappears. The Front page (`Mind Module Executive Edition` cover) keeps full mid-tone clarity even though it's dark — that's the bar.

Brief stays **Active Calm + peak mental performance**. Replace the 3 hero JPGs with new B&W woodcut-engraved landscapes in the Front-page style (radiating sun-burst lines, dense hatching, dramatic clouds, no humans), each visually distinct by time-of-day, and tune the TodayHero overlay so the engraving actually reads.

## 1. Generate 3 new hero images (premium, 1920×1024, engraved B&W)

Save into `public/all-visuals/images/` (overwrite existing filenames so no code path changes):

- **`hero-morning.jpg` — "Sun over the peak"**
  Big radiant sun rising directly behind a sharp mountain summit, classic 19th-century woodcut sun-rays fanning across the sky, layered ridge lines receding into hatched mist below. Energy: ascent, clarity, the start of the climb. Matches the Front-page cover sun/cloud language.

- **`hero-afternoon.jpg` — "Edge of the cliff"**
  High-vantage cliff edge in the foreground (engraved rock striations), vast hatched valley + distant mountain range stretching to a bright midday horizon, scattered cumulus rendered as dense parallel-line clouds. Energy: standing in the arena, executing under pressure.

- **`hero-evening.jpg` — "Stillwater under moonlit ridge"**
  Calm alpine lake reflecting a low moon, silhouette ridge line behind, fine cross-hatched water ripples, sparse stars as stippled dots. Energy: recovery, restoration, preparing for tomorrow.

All three: pure black-and-white engraving, no color, no humans, no text, heavy linework so detail survives the page overlay. Generated with `imagegen--generate_image` model `premium` for fidelity, 1920×1024.

Sanity-check the renders by viewing each file before wiring; regenerate any that drift into illustration/photo territory or include figures.

## 2. Lighten the TodayHero overlay (`src/components/today/TodayHero.tsx`)

Current issue: `grayscale(1) contrast(1.15) brightness(0.85)` + a top-to-bottom dark gradient (up to 0.75 alpha) collapses the engraving into a flat dark wash.

Changes:
- Image filter → `contrast(1.25) brightness(1.0)` (drop grayscale — the new assets are already B&W; keep the contrast bump to deepen the lines).
- `opacity` → `1`.
- Replace `TOD_OVERLAY` with much lighter, time-of-day **tints** (max ~0.22 alpha at the bottom, transparent at the top) so the visual stays legible like the Front-page cover:
  - morning: warm amber tint `rgba(180,120,60, 0–0.18)`
  - afternoon: neutral cool `rgba(60,80,100, 0–0.18)`
  - evening: deep indigo `rgba(20,25,50, 0–0.22)`
- Keep the existing bottom taupe fade into `--canvas-hi` for the seamless card blend (unchanged).
- Keep height (`h-[280px] md:h-[340px]`).

## 3. Greeting legibility (`src/components/today/TodayGreeting.tsx`)

With the lighter overlay the top of the hero is brighter, so the white greeting can wash out. Switch to `text-[#1a1712]` (ink) with `drop-shadow-[0_1px_6px_rgba(255,255,255,0.55)]` for a soft halo — readable on all three new scenes. Pencil icon → `text-[#1a1712]/60`.

## Out of scope

- No changes to routing, scoring, brief, plan, or any data hooks.
- Front page (`/`) untouched.
- Other cards / engraved art bands elsewhere untouched.

## Verification

1. Open `/executive-home`, `/check-in`, `/plan` at mobile width.
2. Each TOD shows a clearly different scene (sun-peak vs cliff vs moon-lake), engraved hatching visible, no muddy dark wash.
3. Greeting "Standing by, Shuk" reads cleanly over all three.
4. Bottom of hero still dissolves into the taupe canvas — cards float, no hard seam.
5. No console errors.
