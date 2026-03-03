

## Recalibrate Fixes — Implementation Plan

### 1. Remove Wu Wei from Pause Somatic Protocol
**File**: `src/pages/recalibrate/PauseOutcomePage.tsx` (lines 33-52)
- Remove the `wuWeiFlow` variable fetch (line 36)
- Remove it from `somaticItems` array (lines 49-52)
- Wu Wei stays under Flow Mastery (presence) where its `category: "presence"` naturally places it

### 2. Fix Kapalabhati Duration Mismatch
**File**: `src/data/practicesAndSoundscapes.ts` (line 503)
- Change `duration: 6` → `duration: 6.5` (step sums: 1+1+1.5+2+0.5+0.5 = 6.5)
- Bhramari is actually correct at 12 (1.5+1.5+2+5+1.5+0.5 = 12)

### 3. Update Warrior Drums & Basque Txalaparta Visuals
- Copy user-uploaded `warrior-drums-hero.jpg` and `basque-txalaparta-hero.jpg` to `src/assets/`
- **File**: `src/data/practicesAndSoundscapes.ts`
  - Add imports for the new hero images
  - Update `warrior-drums` thumbnail (line 197): `renewalColorful` → `warriorDrumsHero`
  - Update `basque-txalaparta` thumbnail (line 236): `renewalColorful` → `basqueTxalapartaHero`

### 4. Generate & Update Monastic Resonance Visual
- Use AI image generation (Nano banana) to create a monastic/monastery themed visual with warm golden tones matching the presence page aesthetic
- Save to `src/assets/monastic-resonance-hero.jpg`
- **File**: `src/data/practicesAndSoundscapes.ts`
  - Add import for new hero image
  - Update `deep-focus-monastic-resonance` thumbnail (line 399): `flowBlue` → `monasticResonanceHero`

### Files Modified
| File | Changes |
|------|---------|
| `src/pages/recalibrate/PauseOutcomePage.tsx` | Remove wu-wei-flow from somatic items |
| `src/data/practicesAndSoundscapes.ts` | Fix kapalabhati duration, update 3 thumbnail imports |
| `src/assets/` | Add 3 new hero images |

