

## Recalibrate Feature — Comprehensive Fix Plan

This plan covers: post-practice flow overhaul, pre-practice instructions, content/copy updates, duration fixes, skip-feedback-if-already-given, and a DB/tracking audit.

---

### DB & Tracking Audit Results

**Current state is solid.** All practice completions are tracked server-side via two tables:

| Table | Purpose | Tracked from |
|-------|---------|-------------|
| `practice_sessions` | Session records (content_id, category, duration, effectiveness_rating) | SoundscapePlayer, GuidedPracticePlayer, MicroPracticePlayerCards |
| `sanctuary_events` | Insights/analytics (event_type, content_type, category, context_data) | `trackSanctuaryEvent()` in all 3 players |
| `content_relevance_feedback` | Star ratings + text feedback | `submitPracticeRating()` via PracticeRatingModal |
| `user_preferences` | Favorite content IDs | `user-favorites` edge function |
| `daily_ritual_completions` | Ritual tracking per day | `practice-data` edge function |

**One issue found:** `SoundscapePlayer.handlePlayPause()` (lines 218-233) writes ritual history to `localStorage` (`dailyRitualHistory`) — this is redundant with the server-side `daily_ritual_completions` table and `updateRitualCompletion()` call. But it's not harmful, just legacy. Will leave as-is.

**No missing tables or tracking gaps.** All content metadata lives in `practicesAndSoundscapes.ts` (client-side data file), not in edge functions. The `sanctuary_content` and `sanctuary_content_metadata` DB tables exist but content is primarily served from the client-side data file for offline capability. This is the established pattern.

---

### Group A: Post-Practice Flow Overhaul

**Problem:** After practice ends, a "Journey Complete" / "Practice Complete" screen shows with broken "Practice Again", "Explore More", and "Skip for Now" buttons.

**Changes:**

**1. Remove completion screens — navigate back after rating/skip**

In `SoundscapePlayer.tsx`:
- Remove the `isComplete` state-based completion screen (lines 625-665)
- In `handleRatingSubmit` and `handleRatingSkip`: when standalone (not in queue, no JIT data), instead of `setIsComplete(true)`, navigate to `getCategoryPath()` (the category page)
- This eliminates the broken "Journey Complete" screen entirely

In `GuidedPracticePlayer.tsx`:
- Remove the completion view at lines 1899-1942
- In `handleRatingSubmit` and `handleRatingSkip` (rating view): when standalone, navigate to `getCategoryPath()` instead of `setView("complete")`

**2. Skip feedback if already given**

In `PracticeRatingModal.tsx`:
- Add a new prop `alreadyRated?: boolean`
- When `alreadyRated` is true, auto-skip (call `onSkip()` immediately)

In all three players, before showing the rating modal:
- Query `content_relevance_feedback` table for existing feedback with matching `content_id` and `user_id`
- If found, skip the modal and proceed directly to post-practice navigation
- This uses the existing `content-feedback` edge function's `GET_FEEDBACK` action (or direct DB in DEV_MODE)

**3. Fix "Explore More" navigation in SoundscapePlayer**

Replace `navigate("/soundscapes")` (broken route) with `navigate(getCategoryPath())` — this correctly routes to `/recalibrate/pause`, `/recalibrate/power-up`, or `/recalibrate/presence`.

**Files:** `src/pages/SoundscapePlayer.tsx`, `src/pages/GuidedPracticePlayer.tsx`, `src/components/PracticeRatingModal.tsx`

---

### Group B: Pre-Practice Instructions Screen (All Audio Practices)

**Problem:** No technique/instructions shown before audio starts.

**Changes in `SoundscapePlayer.tsx`:**
In the `!hasStarted` initial view (lines 697-727), add a collapsible section below the play button showing:
- `soundscape.technique` (if available)
- `soundscape.benefits` (if available)
- For practices with `whatYouNeed` data, show those too

**Changes in `GuidedPracticePlayer.tsx`:**
In the audio `!hasStarted` view (lines 1129-1159), add the same collapsible technique/benefits section using `contentData.technique`, `contentData.benefits`, and `contentData.whatYouNeed`.

The collapsible ensures the pre-start screen doesn't become overwhelming but the information is accessible.

**Files:** `src/pages/SoundscapePlayer.tsx`, `src/pages/GuidedPracticePlayer.tsx`

---

### Group C: Content & Copy Updates

All changes in `src/data/practicesAndSoundscapes.ts`:

**1. Ina Night Fields — Add missing origin story/instructions**

Add to the `ina-night-fields` entry (around line 482):
```
fullStory: "In Japanese mythology, Tsukiyomi is the moon deity...born in the rice-growing valleys of Nagano...The night fields recording captures the living soundscape of rural Japan after dark—frogs, insects, distant water, wind through rice paddies. This is Shinrin-yoku extended into the night...",
technique: "No technique required. This is a passive immersion soundscape. Find a comfortable position, close your eyes, and let the sounds of the Japanese countryside wash over you. The natural rhythms of night—frogs, insects, distant water—will guide your nervous system into rest...",
benefits: ["Deep nervous system rest through natural sound immersion", "Transition from active to restful state", "Connection to natural rhythms", "Reduction of mental chatter through ambient focus"]
```

**2. Didgeridoo — Tweak copy for Renewal context**

Change `storyHook` (line 160) from "laser-sharp focus" to emphasize re-energizing:
```
storyHook: "Ancient didgeridoo + Himalayan bowls: raw energy to re-energize and activate your core vitality."
```

**3. Trataka — Add office-friendly alternatives**

Update `whatYouNeed` (lines 814-822) to include alternatives:
```
"Essential: A single focus point — candle flame (traditional), OR a small dot drawn on paper, a still object on your desk, or a digital flame on screen",
"A candle is ideal but not required — any small, still focal point works. This practice can be done in an office or public space using non-flame alternatives.",
```

Update `equipment` in structuredTags from `['candle', 'matches']` to `['none']`.

Add beginner timing note to technique:
```
"Beginners should start with 15-30 seconds of continuous gazing per round and build up gradually. The guided audio is approximately 4 minutes — follow the cues and close your eyes whenever needed."
```

**4. Bhramari — Add precautions and repetition guidance**

Add precautions to the beginning of `whatYouNeed` array:
```
"⚠️ DO NOT PRACTICE IF: Severe ear infections, active eye conditions (glaucoma, detached retina), epilepsy or seizure disorders, recent ear/nose/throat surgery",
"⚠️ PRACTICE WITH CAUTION: High blood pressure (use gentle humming only), pregnancy (keep practice gentle and short)",
```

Add a note to `technique` about repetitions:
```
"For maximum benefit, practice 3-4 rounds of the full cycle. Traditional teaching (Art of Living, Bihar School of Yoga) recommends at least 3 complete rounds for the nervous system to fully shift."
```

**5. Remove Kapalabhati from power-up somatic practices**

Set `is_active` flag or filter it out. Since the data file doesn't have an `isActive` field, add `hidden: true` to the `kapalabhati-pranayama` entry and update `getAllContent()` and `getContentById()` to filter out hidden entries.

Actually, simpler: just remove the entry entirely from the array since the user said "Remove Kapalbharti". The legacy data in `GuidedPracticePlayer.tsx` (the `practiceData` object) still has it for backwards compat but won't be shown in tiles.

Wait — the `isAudioPractice` check in GuidedPracticePlayer (line 761) explicitly lists `kapalabhati-pranayama`. Need to remove it from there too.

**6. Courage Through The Future Self — Add "any other option" to Step 2**

In `MicroPracticePlayerCards.tsx`, update `COURAGE_FUTURE_SELF_CARDS` Step 2 examples (lines 239-243) to add:
```
'"Any other fear not mentioned here — name yours"',
```

**Files:** `src/data/practicesAndSoundscapes.ts`, `src/pages/MicroPracticePlayerCards.tsx`, `src/pages/GuidedPracticePlayer.tsx`

---

### Group D: Duration Display Fixes

**Problem:** Duration shown on tiles differs from what plays (e.g., Ina Night Fields: 42m in data but audio is ~5m).

**Root cause:** The `duration` field in `practicesAndSoundscapes.ts` is a manual estimate. The actual audio duration is loaded via `onLoadedMetadata` and stored in `actualDuration` / `duration` state.

**Fix in `SoundscapePlayer.tsx`:**
The `displayDuration` (line 107) already prefers `actualDuration` over `soundscape.duration`. The issue is the initial pre-start screen shows `soundscape.origin` text but not the duration mismatch. The duration shown on **tile cards** (in category pages) comes from the data file. 

Update `practicesAndSoundscapes.ts` to fix the Ina Night Fields duration from `42` to `5` (matching the actual audio). Same for any other mismatched entries.

For Deep Focus Bhramari: data says `11` min, audio may differ. Update to actual audio length if known.

**Files:** `src/data/practicesAndSoundscapes.ts`

---

### Group E: Remove Time Comment from Soundscape Player

The user mentioned "avoid the time comment" — this refers to the `{formatTime(displayDuration)} min session` text in the playing state header (SoundscapePlayer line 736, GuidedPracticePlayer line 1168). Remove these time displays from the playing state headers.

**Files:** `src/pages/SoundscapePlayer.tsx`, `src/pages/GuidedPracticePlayer.tsx`

---

### Summary of Files to Modify

| File | Changes |
|------|---------|
| `src/pages/SoundscapePlayer.tsx` | Remove completion screen, fix post-rating nav, add pre-start technique section, remove time comment |
| `src/pages/GuidedPracticePlayer.tsx` | Remove completion screen, fix post-rating nav, add pre-start technique section, remove kapalabhati from audio list, remove time comment |
| `src/pages/MicroPracticePlayerCards.tsx` | Add "any other fear" to Courage Future Self step 2 |
| `src/components/PracticeRatingModal.tsx` | Add `alreadyRated` prop for skip logic |
| `src/data/practicesAndSoundscapes.ts` | Ina Night Fields story/technique/duration, Didgeridoo copy tweak, Trataka alternatives, Bhramari precautions, remove Kapalabhati |

### Implementation Order

1. Content/copy updates (data file) — lowest risk
2. Post-practice flow overhaul (remove completion screens, fix navigation)
3. Skip-feedback-if-already-rated check
4. Pre-practice instructions section
5. Duration and time comment fixes

