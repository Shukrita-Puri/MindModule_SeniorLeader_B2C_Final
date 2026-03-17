

# Recalibrate Audio Practices — Full Audit & Fix Plan

## Audit Summary

### A. Missing Audio Files — `public/guided-practices/` directory does NOT exist

The directory `public/guided-practices/` is completely missing. Two content items reference files in it:

| Content ID | audioSrc | Status |
|---|---|---|
| `spartan-battle-breath` | `/guided-practices/spartan-battle-breath.mp3` | **MISSING (was working before)** |
| `pranayama-clarity` | `/guided-practices/pranayama-clarity.mp3` | Known empty — keep as-is |

All other audio-based content references `/soundscapes/*.mp3` which all exist in `public/soundscapes/`.

**Root cause**: The `public/guided-practices/` directory was likely deleted or lost during a prior change. The `spartan-battle-breath.mp3` file needs to be restored.

**Fix**: Create the `public/guided-practices/` directory. Since we cannot restore the original file (it's a binary asset), we need to either: (a) move the audio reference to point to a soundscapes path if the file exists there, or (b) flag this to the user as a missing asset that needs re-uploading. For `pranayama-clarity` — already confirmed as intentionally empty, no action.

### B. Soundbath audioSrc vs actual files — Cross-reference

Files in `public/soundscapes/`:
```
basque-txalaparta.mp3, bhramari-pranayama.mp3, box-breathing.mp3,
cathedral-choir-flow.mp3, didgeridoo-bowls.mp3, earth-resonance.mp3,
energy-forge.mp3, forest-bathing.mp3, harmonic-calm.mp3,
himalayan-monastery.wav, ina-night-fields.mp3, kapalabhati-pranayama.mp3,
monastic-resonance.mp3, tibetan-bowls.mp3, trataka-single-focus.mp3,
vagus-wind-down.mp3, warrior-drums.mp3
```

All `audioSrc` values pointing to `/soundscapes/` have matching files. No missing soundscape audio.

### C. Forward/Rewind Buttons — Working correctly in code

**SoundscapePlayer**: `handleSkip(seconds)` at line 236 correctly uses `Math.max(0, Math.min(...))` to clamp. Buttons at lines 746 and 769 call `handleSkip(-15)` and `handleSkip(15)`. The forward button has a `disabled` condition checking `currentTime >= (actualDuration || displayDuration) - 1`. This logic is sound.

**GuidedPracticePlayer**: Has TWO audio control blocks (audio view at lines 1264-1295 and legacy step-based view at lines 1718-1747). Both use proper skip logic. No code bugs found.

**However**, there is a potential issue: the forward button's `disabled` condition in GuidedPracticePlayer (line 1291) checks `currentTime >= duration`. If `duration` is `0` (metadata hasn't loaded yet, or audio file is missing), this evaluates to `0 >= 0 = true`, meaning **the forward button is permanently disabled when audio fails to load**. This would appear as "faulting" forward/rewind buttons for any practice with a missing audio file (like `spartan-battle-breath`).

### D. `isAudioPractice` whitelist is incomplete (BUG)

Line 758-763 of GuidedPracticePlayer:
```typescript
const isAudioPractice = contentData?.audioSrc && (
  id === 'box-breathing' || 
  id === 'energy-forge' ||
  id === 'bhramari-pranayama' ||
  id === 'trataka-flame-gaze'
);
```

This is a **hardcoded whitelist**. `spartan-battle-breath` has `audioSrc` set but is NOT in this list, so it will never get the audio player view — it falls through to the step-based view with the secondary audio controls. This isn't necessarily a bug (it has practiceSteps), but if audio was intended as primary, it's excluded.

### E. `pranayama-clarity` classified as `soundbath` but has no audio

`pranayama-clarity` has `contentType: "soundbath"` but its audio file is empty. When navigated to via `/soundscapes/pranayama-clarity`, the SoundscapePlayer will try to load `/guided-practices/pranayama-clarity.mp3` (from its `audioSrc`), which doesn't exist. The fallback logic at line 897 would try to build a path as `/soundscapes/pranayama-clarity.wav` which also doesn't exist. This will cause an audio error. Per your instruction, this can remain empty, but the content type being `soundbath` means it routes to SoundscapePlayer which requires audio. This is a data mismatch.

---

## Fix Plan

### Fix 1: Restore `spartan-battle-breath` audio reference
Since the original audio file cannot be programmatically restored, the cleanest fix is to temporarily remove the `audioSrc` from `spartan-battle-breath` until the file is re-uploaded. This prevents the audio error toast and the disabled forward/rewind buttons. Add a code comment noting the file needs re-uploading.

### Fix 2: Fix `pranayama-clarity` content type mismatch
Since it's intentionally empty of audio, either:
- Change its `contentType` from `"soundbath"` to `"guided-practice"` so it routes to the step-based player (it already has `practiceSteps` data... actually checking — it does NOT have `practiceSteps`). 
- Or remove its `audioSrc` so the SoundscapePlayer doesn't try to load a nonexistent file and falls back gracefully.

Best option: Remove the `audioSrc` from `pranayama-clarity` since the file is intentionally empty. The SoundscapePlayer's fallback will still try to construct a path, but this prevents the primary load path from erroring.

### Fix 3: Fix forward/rewind disabled state when audio fails
In both GuidedPracticePlayer and SoundscapePlayer, update the forward button's `disabled` condition to also check `duration > 0` so buttons aren't incorrectly disabled when metadata hasn't loaded.

### Files to change:
1. **`src/data/practicesAndSoundscapes.ts`** — Remove `audioSrc` from `spartan-battle-breath` (line 514) and `pranayama-clarity` (line 621), add comments
2. **`src/pages/GuidedPracticePlayer.tsx`** — Fix forward button disabled condition (line 1291)

### What the user needs to do:
- Re-upload `spartan-battle-breath.mp3` to `public/guided-practices/` to restore that practice's audio

