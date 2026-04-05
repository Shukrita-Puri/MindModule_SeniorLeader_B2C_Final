

# Evening Depleted Hero Video — Woodcut Engraving Style

## Goal
Replace the current "wellness" hero video for the Evening Depleted state with an "active calm" engraving-style animation matching the brand's heritage illustration language (as seen on the landing page and onboarding).

## Output
One seamless-loop MP4 (6–10 seconds), placed at `public/all-visuals/videos/depleted-evening.mp4`.

## Creative Direction

**Style**: Woodcut/stipple engraving — monochrome with selective warm tones. Matches the uploaded reference (sun, clouds, rolling hills rendered in fine line work).

**Scene**: Post-sunset landscape. Dark sky dominates. Sun fully below horizon. A thin amber/gold line traces the far horizon. Dense stippled hills in deep shadow. Faint stars slowly brightening above.

**Colour palette**:
- Sky: `#0A0F1A` (near-black navy) → `#1A1F2E` (deep slate)
- Horizon line: `#C4873B` (muted gold/amber), very thin
- Hills/landscape: `#12161F` with `#2A2F3A` stipple texture
- Stars: `#D4C5A0` (warm cream), subtle

**Motion** (all frame-based via Remotion interpolate):
- Very slow downward camera drift (translateY ~5px over full loop)
- Horizon amber line slowly dims (~opacity 0.6 → 0.3)
- 3–4 stars slowly brighten (opacity 0 → 0.4, staggered)
- Subtle parallax: foreground hills drift slightly faster than background
- No cuts, no sudden movement

**Mood**: "The day cost something. Rest is earned and necessary."

## Technical Approach

1. **Set up Remotion project** in `remotion/` directory with dependencies
2. **Generate the base engraving illustration** using Nano banana pro (google/gemini-3-pro-image-preview) — a dark evening landscape in woodcut/stipple style matching the brand reference
3. **Layer the image** in Remotion with subtle animated overlays:
   - Slow parallax drift on the landscape layers
   - Animated horizon glow (interpolated opacity)
   - Star fade-in (staggered interpolate sequences)
   - Overall slow downward camera drift
4. **Render** as 1080×1920 (portrait, mobile-first) at 30fps, ~8 seconds seamless loop
5. **Copy** output to `public/all-visuals/videos/depleted-evening.mp4`

## Composition Specs
- Resolution: 1080×1920 (portrait for mobile hero)
- FPS: 30
- Duration: 240 frames (8 seconds)
- Codec: H.264
- Loop: seamless (start and end states match via sinusoidal motion)

## Files Created/Modified
- `remotion/` — full Remotion project (source preserved for future videos)
- `public/all-visuals/videos/depleted-evening.mp4` — final output

No changes to `ExecutiveHome.tsx` or any other app logic — the video URL path already exists in the video map.

