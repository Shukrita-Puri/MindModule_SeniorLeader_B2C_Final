

## Title Rename for 4 Reset Studio Practices

### Changes Summary

| # | Current Title | New Title | ID |
|---|---|---|---|
| 1 | Deep Rest & Grounding with Harmonic Calm | Nervous System Reset Through Tibetan Bowls | `harmonic-calm` |
| 2 | Energy Through Reframe | Energy Through The Shift | `energy-through-reframe` |
| 3 | Resilience Through Brave Action | Courage Through The Arena | `courage-arena` |
| 4 | Ruthless Focus Through Simplicity | Clarity Through Elimination | `jobs-simplicity` |

### Files to Edit (title string replacements only)

**1. `src/data/practicesAndSoundscapes.ts`** — canonical content catalog
- Line 261: `harmonic-calm` title
- Line 1433: `energy-through-reframe` title
- Line 1549: `courage-arena` title
- Line 1265: `jobs-simplicity` title

**2. `src/pages/MicroPracticePlayerCards.tsx`** — card overview titles
- Line 148: `ENERGY_REFRAME_CARDS` overview title
- Line 351: `COURAGE_ARENA_CARDS` overview title
- Line 944: `JOBS_SIMPLICITY_CARDS` overview title

**3. `src/pages/recalibrate/PowerUpOutcomePage.tsx`** — hardcoded title overrides
- Line 66: `energy-through-reframe` → "Energy Through The Shift"
- Line 78: `courage-arena` → "Courage Through The Arena"

**4. Database update** — `sanctuary_content` table (3 rows; `energy-through-reframe` not in DB)
- UPDATE `harmonic-calm` title
- UPDATE `courage-arena` title
- UPDATE `jobs-simplicity` title

### What does NOT change
- No tag, category, id, logic, or structural changes
- No changes to recommendation engine, content scoring, or routing
- Works identically for both dev_mode and auth users (titles come from the same source files and DB rows)

