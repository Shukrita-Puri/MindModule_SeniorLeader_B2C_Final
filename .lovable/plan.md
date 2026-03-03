
Goal: Make every audio-based Recalibrate practice show one consistent duration across all 3 surfaces:
1) main page tile, 2) player actual timeline, 3) soundscape/guided practice page label.

What I found (root causes)
- Main tiles on /recalibrate/pause, /presence, /power-up use static `item.duration` from `practicesAndSoundscapes.ts` (often stale).
- Soundscape page label rounds up using `Math.ceil(actualSeconds/60)` in `SoundscapePlayer.tsx`, which turns 6:21 into “7 min”.
- Guided audio page label rounds up using `Math.ceil(duration/60)` in `GuidedPracticePlayer.tsx`, which turns 3:40 into “4 min”.
- So the 3 surfaces currently use different sources + different rounding rules.
- Also: for guided practices, non-audio timing logic mixes minute-based step durations with second-based formatting; this should be normalized while we’re in this area.

Implementation plan
1) Create one duration source for all audio UI
- Add a reusable hook/utility to load real audio metadata (`audio.duration`) by `audioSrc` and cache it.
- Return exact seconds for each audio practice.
- Use this source everywhere audio time is displayed.

2) Standardize display format (no rounding drift)
- Introduce one formatter for audio duration display (e.g., `m:ss`).
- Replace all `Math.ceil(.../60)` duration labels with exact formatted time from seconds.
- Keep timeline right-side value and header/session value synchronized from the same seconds value.

3) Update Recalibrate outcome tiles to use real audio duration
- Files:
  - `src/pages/recalibrate/PauseOutcomePage.tsx`
  - `src/pages/recalibrate/PresenceOutcomePage.tsx`
  - `src/pages/recalibrate/PowerUpOutcomePage.tsx`
- For items with `audioSrc`, show metadata-based exact duration (not stale `item.duration`).
- For non-audio items, keep existing duration behavior.

4) Update detail players to same duration source/format
- `src/pages/SoundscapePlayer.tsx`
  - Replace “X min session” rounded display with exact formatted duration from `displayDuration`.
- `src/pages/GuidedPracticePlayer.tsx`
  - Audio view: replace rounded “X min session” with exact formatted duration from actual audio metadata.
  - Normalize guided step timing internals so second-based UI always receives seconds (prevents future timing inconsistencies).

5) Full audio audit pass and fallback data alignment
- Audit all Recalibrate audio IDs:
  - Pause: `harmonic-calm`, `deep-calm-forest-bathing`, `vagus-wind-down`
  - Presence: `deep-focus-monastic-resonance`, `sustained-focus-choir-harmonic`, `ina-night-fields`, `bhramari-pranayama`, `trataka-flame-gaze`
  - Power-up: `energised-focus-didgeridoo-bowls`, `warrior-drums`, `basque-txalaparta`, `kapalabhati-pranayama`, `box-breathing`, `energy-forge`
- Update fallback `duration` values in `src/data/practicesAndSoundscapes.ts` to match real audio lengths (so any non-player usage stays accurate too).
- Keep `pranayama-clarity` untouched until your file is uploaded (as requested).

Technical details
- Key files to modify:
  - `src/pages/recalibrate/PauseOutcomePage.tsx`
  - `src/pages/recalibrate/PresenceOutcomePage.tsx`
  - `src/pages/recalibrate/PowerUpOutcomePage.tsx`
  - `src/pages/SoundscapePlayer.tsx`
  - `src/pages/GuidedPracticePlayer.tsx`
  - `src/data/practicesAndSoundscapes.ts`
  - (new) shared duration hook/formatter utility file for metadata + formatting
- No backend/database changes needed.

Verification checklist (must pass for every audio practice)
- Main tile duration == player progress total duration == page header/session duration.
- No rounded-up minute labels for audio content.
- Kapalabhati/Bhramari/Vagus reflect actual file length exactly in all 3 surfaces.
- Re-check all three outcome pages plus each corresponding `/soundscapes/:id` or `/guided-practices/:id`.
