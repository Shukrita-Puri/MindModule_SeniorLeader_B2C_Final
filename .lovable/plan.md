## Fix Front Page Text Visibility

### Problem
- "Executive Edition" subtitle at `text-white/60` is invisible against the bright sky background
- "MIND MODULE" brand name lacks separation from the cloud background
- Tagline font size is slightly small for its importance

### Solution
1. **Brand cluster (logo + MIND MODULE + Executive Edition):**
   - Wrap in a subtle `bg-black/20 backdrop-blur-sm rounded-3xl px-6 py-4` pill to separate from sky
   - Bump "Executive Edition" from `text-white/60` to `text-white/90` — it should read as brand tier, not faded metadata
   - Keep "MIND MODULE" as text-white with an enhanced `drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]`

2. **Tagline "Designed for Leaders...":**
   - Increase from `text-2xl` to `text-[1.75rem]` (mobile) and `sm:text-3xl` (desktop)
   - Strengthen shadow to `drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)]`

3. **No logic/handler changes** — purely Tailwind class adjustments on `src/pages/Front.tsx`

### Single file changed
- `src/pages/Front.tsx` (brand cluster wrapper + text classes)