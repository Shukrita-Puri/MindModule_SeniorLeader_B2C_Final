# Reflection input on all written card decks + storage audit

## What's wrong

The inline writing box (the "your response" textarea on each step card) is gated to practices tagged `mindset`. "Clarity Through Elimination" (`jobs-simplicity`) is tagged `tool`, so its card deck shows the step text with no way to capture the user's answer — even though every step is an explicit writing prompt ("Write down everything you think you need to do…").

## Change

1. `jobs-simplicity` is reclassified as a reframe/mindset practice (not a tool) in the static catalogue, and appears in the Recalibrate mindset group like the other reframes.
2. `wu-wei-flow` moves to the Somatic Protocol group on the Presence page — treated as somatic, so no writing box.
3. `fudoshin-immovable-mind` already sits in the Somatic Protocol group on the Pause page, so it stays as-is: somatic, no writing box.
4. Replace the `subType === 'mindset' || id === 'stoic-reflection'` check in the card player with a single explicit allowlist of decks that capture writing (`REFLECTION_CAPTURE_IDS`), living next to the other content SSOT files.
   - Contains: all current `mindset` decks (unchanged behaviour) plus `jobs-simplicity`.
   - Explicitly excludes the somatic/breath decks: `wu-wei-flow`, `fudoshin-immovable-mind`, `grounding-touch`, `release-exhale-new`, `djokovic-reset`.
5. Everything downstream stays identical: same textarea component, same debounce/blur/card-change/complete save cycle, same `practice_reflections` rows, same localStorage mirror, same "empty never blocks Mark Complete" rule.
6. Backend mirror follows the same structure: `supabase/functions/_shared/content/surfaced-content.ts` gains the same mindset/somatic grouping metadata so server-side plan and JIT selection classify these three the same way the frontend does. No id is added or removed from the allowlist — only the grouping changes.
7. Add a guard test asserting the client and server groupings match, every id in the reflection allowlist has a card deck, and the somatic ids are absent from it.
8. Update the Inline Mindset Reflection Capture memory so the rule is "allowlisted written decks", not "subType mindset".


## Storage audit (last 6 months) — findings

Writing is stored in `practice_reflections`, one row per step, keyed by user + practice + session (or temp session key) + step number.

- Rows in the last 6 months: **16**, from **2 users**, across **4 practices** — `stoic-reflection` (6), `eye-of-storm` (4), `presence-grounding-new` (3), `softness-release-new` (3).
- All 16 rows were written on a single day, **2026-05-04**. Nothing since.
- That gap is explained by usage, not a broken write path: over the last 45 days the only completed practice recorded is `harmonic-calm` (a soundscape). No written deck has been completed since May, so there was nothing to save.
- Conclusion: the save path works end to end (server rows exist, per-step, with prompts attached), but coverage is thin because the capture box only appears on `mindset` decks — which is exactly what the change above fixes.

## Technical notes

- Edits: `src/data/practicesAndSoundscapes.ts` (`jobs-simplicity` subType → mindset), `src/pages/recalibrate/PresenceOutcomePage.tsx` (`wu-wei-flow` into the somatic group), `src/pages/MicroPracticePlayerCards.tsx` (reflection gate), new `src/data/reflectionCaptureIds.ts`, `supabase/functions/_shared/content/surfaced-content.ts` (grouping mirror), new test under `src/data/__tests__/`.
- No schema change, no edge-function redeploy needed beyond the shared content module (`save-practice-reflection` / `get-practice-reflections` already accept any `practiceId`); `generate-mastery-plan` and `generate-jit-carousel` get redeployed since they import the shared module.
- `practiceType` sent to the save function stays `"mindset"` to avoid splitting existing rows; the field is descriptive only.
