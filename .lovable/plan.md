

## Plan: Duration Labels, Badge Tags, and Presence Visuals

### Issue 1: Add "min" suffix to all audio duration displays

**Root cause**: `formatAudioDuration()` returns bare `m:ss` (e.g. "2:48") without any unit label. This affects 3 surfaces:

- **Main tiles** (all 3 outcome pages): `formatDuration()` calls `formatAudioDuration()` → shows "2:48" not "2:48 min"
- **SoundscapePlayer**: shows `{formatTime(displayDuration)} session` → e.g. "6:21 session" (no "min")  
- **GuidedPracticePlayer**: shows `{formatTimeAudio(duration)} session` → same issue

**Fix**:
- Update `formatAudioDurationLabel()` in `src/hooks/useAudioDuration.ts` to append " min" → returns "2:48 min"
- Update all 3 outcome pages' `formatDuration()` to use `formatAudioDurationLabel()` instead of `formatAudioDuration()`
- Update `SoundscapePlayer.tsx` line 736: change `{formatTime(displayDuration)} session` → `{formatTime(displayDuration)} min session`
- Update `GuidedPracticePlayer.tsx` line 1168: change `{formatTimeAudio(duration)} session` → `{formatTimeAudio(duration)} min session`
- Also update the completion screen duration displays in both players

**Files**: `src/hooks/useAudioDuration.ts`, `PauseOutcomePage.tsx`, `PresenceOutcomePage.tsx`, `PowerUpOutcomePage.tsx`, `SoundscapePlayer.tsx`, `GuidedPracticePlayer.tsx`

### Issue 2: Trataka and Bhramari badge should say "Guided Practice"

**Root cause**: `getBadgeLabel()` in `PresenceOutcomePage.tsx` line 163 returns `'Practice'` for `guided-practice` contentType. Pause page already handles this correctly.

**Fix**: Change line 163 in `PresenceOutcomePage.tsx` from `return 'Practice'` to `return 'Guided Practice'`

### Issue 3: Presence page visuals — unique images + green filter

**3a. Duplicate visuals**: `ikigai-purpose`, `single-thread-focus`, `eternal-now-presence`, and `mastery-constraint` each have their own hero PNG files (`ikigai-purpose-hero.png`, `single-thread-focus-hero.png`, `eternal-now-presence-hero.png`, `mastery-constraint-hero.png`). If they look the same, we need to generate 3 new unique AI visuals so all 4 are distinct.

**3b. Green filter**: Currently the Presence page uses `bg-white/25` overlay on images. The Pause page uses `img-taupe-overlay` CSS class (sepia filter). For Presence, replace `bg-white/25` with a subtle green-tinted overlay using a new CSS class `img-green-overlay` with a CSS filter like `sepia(15%) hue-rotate(80deg) brightness(95%) contrast(105%)` — this shifts colors toward green subtly, matching the approach used on Pause (sepia filter) and Power-Up pages.

**Files**: 
- `src/index.css` — add `.img-green-overlay` class
- `src/pages/recalibrate/PresenceOutcomePage.tsx` — replace `bg-white/25` overlay divs with the green filter class on the `<img>` tags (same pattern as Pause page)
- Generate 3 new unique AI visuals for the duplicate micro-practices

### Summary of all file changes

| File | Change |
|------|--------|
| `src/hooks/useAudioDuration.ts` | `formatAudioDurationLabel` appends " min" |
| `src/pages/recalibrate/PauseOutcomePage.tsx` | Use `formatAudioDurationLabel` for audio items |
| `src/pages/recalibrate/PresenceOutcomePage.tsx` | Use label with min, fix badge to "Guided Practice", apply green filter |
| `src/pages/recalibrate/PowerUpOutcomePage.tsx` | Use `formatAudioDurationLabel` for audio items |
| `src/pages/SoundscapePlayer.tsx` | Add "min" to session label |
| `src/pages/GuidedPracticePlayer.tsx` | Add "min" to session label |
| `src/index.css` | Add `.img-green-overlay` CSS class |
| `src/assets/` | 3 new unique AI-generated visuals for presence micro-practices |

