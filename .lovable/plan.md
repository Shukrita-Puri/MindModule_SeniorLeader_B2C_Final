## Brand Visibility Without Backdrop Pill

### Problem
Frosted dark pill behind the brand cluster works but introduces a visual "card" that breaks the immersive sky scene. Need contrast without a container.

### Senior UI Designer Solution: Layered Type Treatment + Local Scrim
Three reinforcing techniques, no visible container:

1. **Radial scrim behind brand cluster** — an invisible-edged dark halo painted into the background image area itself, not a pill. Implemented as an absolutely-positioned `div` with `bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.45)_0%,rgba(0,0,0,0.25)_40%,transparent_75%)]` sized to ~480x320, blur-2xl, behind the text. Reads as atmospheric shading on the clouds, not a UI element.

2. **Dual-layer text shadow on MIND MODULE** — replace single drop-shadow with a stacked shadow that creates depth + edge definition:
   - `[text-shadow:0_2px_4px_rgba(0,0,0,0.5),0_8px_24px_rgba(0,0,0,0.45)]`
   - This is what Apple/Linear/Granola use for hero type on photographic backgrounds.

3. **Executive Edition** — keep `text-white/90` + own text-shadow for legibility, no container needed.

### Changes (src/pages/Front.tsx only)
- Remove `px-6 py-4 rounded-3xl bg-black/20 backdrop-blur-sm` from brand cluster wrapper
- Add a sibling absolutely-positioned radial-gradient scrim div behind the cluster (parent gets `relative`)
- Swap MIND MODULE's `drop-shadow-[...]` for stacked `[text-shadow:...]` arbitrary value
- Keep Executive Edition `text-white/90` + its shadow
- Tagline untouched (already strong)

No logic, copy, or layout structure changes.