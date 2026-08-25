# Reflection input on all written card decks + storage audit

## What's wrong

The inline writing box (the "your response" textarea on each step card) is gated to practices tagged `mindset`. "Clarity Through Elimination" (`jobs-simplicity`) is tagged `tool`, so its card deck shows the step text with no way to capture the user's answer — even though every step is an explicit writing prompt ("Write down everything you think you need to do…").

Same gap applies to the other written/cognitive decks tagged `tool`: `fudoshin-immovable-mind`, `wu-wei-flow`. Genuinely somatic/breath decks (`grounding-touch`, `release-exhale-new`) stay as they are — no writing prompt there.

## Change

1. Replace the `subType === 'mindset' || id === 'stoic-reflection'` check in the card player with a single explicit allowlist of decks that capture writing (`REFLECTION_CAPTURE_IDS`), living next to the other content SSOT files.
   - Seeded with: all current `mindset` decks (unchanged behaviour), plus `jobs-simplicity`, `fudoshin-immovable-mind`, `wu-wei-flow`.
   - Somatic/breath decks explicitly excluded.
2. Everything downstream stays identical: same textarea component, same debounce/blur/card-change/complete save cycle, same `practice_reflections` rows, same localStorage mirror, same "empty never blocks Mark Complete" rule.
3. Add a guard test asserting every id in the allowlist has a card deck, and that the excluded somatic ids are not in it.
4. Update the Inline Mindset Reflection Capture memory so the rule is "allowlisted written decks", not "subType mindset".

## Storage audit (last 6 months) — findings

Writing is stored in `practice_reflections`, one row per step, keyed by user + practice + session (or temp session key) + step number.

- Rows in the last 6 months: **16**, from **2 users**, across **4 practices** — `stoic-reflection` (6), `eye-of-storm` (4), `presence-grounding-new` (3), `softness-release-new` (3).
- All 16 rows were written on a single day, **2026-05-04**. Nothing since.
- That gap is explained by usage, not a broken write path: over the last 45 days the only completed practice recorded is `harmonic-calm` (a soundscape). No written deck has been completed since May, so there was nothing to save.
- Conclusion: the save path works end to end (server rows exist, per-step, with prompts attached), but coverage is thin because the capture box only appears on `mindset` decks — which is exactly what the change above fixes.

## Technical notes

- Edit: `src/pages/MicroPracticePlayerCards.tsx` (line ~1908 gate), new `src/data/reflectionCaptureIds.ts`, new test under `src/data/__tests__/`.
- No schema change, no edge-function change (`save-practice-reflection` / `get-practice-reflections` already accept any `practiceId`).
- `practiceType` sent to the save function stays `"mindset"` to avoid splitting existing rows; the field is descriptive only.
