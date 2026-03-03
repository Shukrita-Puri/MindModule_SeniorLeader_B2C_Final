

## Fix Presence Green Filter and Clarify Persistence

### Problem 1: Green filter looks neon/muddy
The source images for Presence practices have purple/cool tones baked in from previous design. Applying a light green hue-rotate on top of purple creates neon or muddy results. The reference images show natural, desaturated photography with organic green tones — not a color filter on purple images.

**Fix**: The CSS filter needs to first aggressively desaturate to strip the purple, then apply the green shift. This creates a muted, natural green-gray tone rather than neon.

```css
.img-green-overlay {
  filter: saturate(0.3) sepia(20%) hue-rotate(90deg) brightness(1.08) contrast(1.05);
}
```

- `saturate(0.3)` — strips most of the original purple/color
- `sepia(20%)` — adds warm base tone
- `hue-rotate(90deg)` — shifts the sepia warmth into a subtle green
- `brightness(1.08) contrast(1.05)` — keeps it airy and not dark

This produces a look similar to the reference images: desaturated, broadly green-toned, natural.

### Problem 2: "Server side vs client side"
All visual and content changes (CSS filters, badge labels, duration formatting, image references) are in the source code files (`src/index.css`, `PresenceOutcomePage.tsx`, `practicesAndSoundscapes.ts`, etc.). These are deployed with the app — they are not stored in localStorage or any client-side temporary state. They are permanent and will persist across all users and sessions. No database migration is needed for these UI/visual changes.

### Files
| File | Change |
|------|--------|
| `src/index.css` | Update `.img-green-overlay` filter to desaturate-first approach |

