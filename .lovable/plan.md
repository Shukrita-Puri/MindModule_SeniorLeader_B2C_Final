

## Fix Presence Green Filter: Tiles Too Faded + Sub-Pages Missing Filter

### Two Issues

**1. Tiles on `/recalibrate/presence` look faded**
The current `.img-green-overlay` uses `saturate(0.3)` which strips too much color, making images look washed out. The "Eternal Now" hourglass screenshot you shared shows the ideal: natural photography with a broadly green tone, not desaturated.

**Fix**: Adjust the filter to keep more natural color while still shifting green:
```css
.img-green-overlay {
  filter: saturate(0.6) sepia(15%) hue-rotate(85deg) brightness(1.05) contrast(1.05);
}
```
- `saturate(0.6)` instead of `0.3` — retains more natural color richness
- `sepia(15%)` + `hue-rotate(85deg)` — subtle green shift without neon
- Lighter brightness/contrast adjustments

**2. Sub-pages still show original purple/warm colors**
The player pages (MicroPracticePlayer, MicroPracticePlayerCards, GuidedPracticePlayer, SoundscapePlayer) all use the same generic inline style:
```js
style={{ filter: 'brightness(0.85) contrast(1.1) saturate(1.2)' }}
```
This is not category-aware — Presence practices get no green filter at all.

**Fix**: Make the inline filter category-aware. For Presence/Flow practices, apply the green filter values. For others, keep the current warm filter. The category is available via `practice.category` in all player pages.

### Files to Change

| File | Change |
|------|--------|
| `src/index.css` | Adjust `.img-green-overlay` — increase `saturate` from `0.3` to `0.6`, reduce `sepia` from `20%` to `15%` |
| `src/pages/MicroPracticePlayer.tsx` (line 225) | Make inline filter category-aware: use green filter for `presence`/`flow` category |
| `src/pages/MicroPracticePlayerCards.tsx` (line 2037) | Same: category-aware filter on background image |
| `src/pages/GuidedPracticePlayer.tsx` (line 1410) | Same: category-aware filter on hero image |
| `src/pages/SoundscapePlayer.tsx` (line 676) | Same: category-aware filter on background image |

### Category-Aware Filter Logic (applied in all 4 player files)

For Presence/Flow category practices:
```js
style={{ filter: 'saturate(0.6) sepia(15%) hue-rotate(85deg) brightness(0.9) contrast(1.1)' }}
```

For all other categories (Pause, Power-Up):
```js
style={{ filter: 'brightness(0.85) contrast(1.1) saturate(1.2)' }}
```

The category is already available as `practice.category` in all player components. The condition is:
```js
const isPresence = practice.category === 'presence' || practice.category === 'flow';
```

