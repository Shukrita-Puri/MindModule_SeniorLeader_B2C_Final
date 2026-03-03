

## Fix Presence Page Green Filter

### Problem
The current green filter is too heavy because it stacks three effects:
1. `.img-green-overlay` CSS filter (`sepia + hue-rotate + brightness + contrast + mix-blend-mode: multiply`)
2. An extra `<div className="bg-emerald-900/15 mix-blend-multiply" />` overlay
3. Applied on top of images that may already have purple/cool tones from previous design

The `mix-blend-mode: multiply` on the image itself darkens everything significantly, and the emerald overlay compounds it.

### Reference
The uploaded images show natural, airy photography with subtle cool-green color grading — not a heavy tint. The Pause page achieves its warm look with just a simple CSS filter on the `<img>` (no extra overlay div).

### Fix

**1. Rework `.img-green-overlay` in `src/index.css`** (line 180-182)
- Remove `mix-blend-mode: multiply` (this is what makes it dark)
- Use a lighter, more natural green tint: `filter: saturate(0.85) sepia(8%) hue-rotate(70deg) brightness(1.02) contrast(1.02);`
- This gives a subtle green wash without darkening — similar to how the reference images feel natural but broadly green-toned

**2. Remove the extra emerald overlay divs in `PresenceOutcomePage.tsx`**
- Line 212: Remove `<div className="absolute inset-0 bg-emerald-900/15 mix-blend-multiply" />`
- Line 274: Remove same div
- Replace with the same simple gradient pattern used on Pause/Power-Up: `<div className="absolute inset-0 bg-gradient-to-b from-transparent to-card/60" />`

### Files
| File | Change |
|------|--------|
| `src/index.css` | Lighten `.img-green-overlay` filter, remove multiply blend |
| `src/pages/recalibrate/PresenceOutcomePage.tsx` | Remove emerald overlay divs, use standard gradient pattern |

