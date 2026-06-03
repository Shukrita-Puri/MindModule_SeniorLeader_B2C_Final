# Shared-module migration: Brief / Plan / Nudges (final pass)

This is a substantial backend refactor (~15K LOC across three edge functions) with high regression risk. Below is the concrete plan I'll execute. No production behavior should change — only where the logic lives.

## 1. New shared modules

### `supabase/functions/_shared/brief/prompt-blocks.ts` (NEW)
Owns deterministic Brief prompt section builders, one per section:
- `buildContextBlock(ctx)` — `=== CONTEXT: [WINDOW] ===`
- `buildReadinessBlock(scores, tier)` — `=== READINESS ===`
- `buildWearableBlock(wearable, signals)` — `=== WEARABLE ===`
- `buildCalendarTodayBlock(events, signals)` — `=== CALENDAR TODAY ===`
- `buildTomorrowBlock(tomorrowEvents)` / `buildWeekAheadBlock(week)`
- `buildPatternsBlock(causality)` / `buildOnboardingBlock(profile)`
- `buildKeySignalsBlock(signalMatrix)` — driven entirely by `buildSignalMatrix`
- `buildStrategicContextBlock(behaviour)` / `buildTriangulationBlock(triangulated)`
- `buildSharedModuleContextBlock(windowContext)`
- `assembleBriefUserPrompt(blocks[])` — deterministic ordering + empty-block omission

Each helper returns `string | null`; `null` means "omit". Eliminates the giant inline `userPrompt += ...` chain.

### `supabase/functions/_shared/brief/event-selection.ts` (NEW)
- `selectLeadEventForBrief(events, now, signalMatrix)` — uses shared `enrichEvent`, `leadTimeMin`, and existing high-stakes logic. Replaces the inline event-selection paths still in `compute-outer-readiness`.
- Returns `{ event, enriched, reason, minutesUntil }`.

### `supabase/functions/_shared/events/slot-labels.ts` (NEW)
Lifts `composeStateLabel` out of `generate-mastery-plan/index.ts`:
- `composeSlotStateLabel({ slotIndex, anchorEvent, calendarLoad, wearableDeficit, tomorrowLoad, weekLoad, horizon })`
- Returns `{ timeLabel, anchorPhrase, stateAction, anchorMeta } | null`
- Preserves priority: distinct event > calendar load > wearable deficit > tomorrow/week load; returns `null` when nothing meaningful → caller drops slot.
- `anchorMeta` returns the fuller `enrichEvent` snapshot for slot persistence (see #4).

## 2. `compute-outer-readiness/index.ts` changes
- Build a single `briefSignals = buildSignalMatrix(...)` already-available value into the prompt builder.
- Replace the long inline prompt accumulator with:
  ```ts
  const userPrompt = assembleBriefUserPrompt([
    buildContextBlock(...),
    buildReadinessBlock(...),
    buildWearableBlock(...),
    buildCalendarTodayBlock(...),
    buildTomorrowBlock(...),
    buildWeekAheadBlock(...),
    buildPatternsBlock(...),
    buildOnboardingBlock(...),
    buildKeySignalsBlock(briefSignals),
    buildStrategicContextBlock(...),
    buildTriangulationBlock(...),
    buildSharedModuleContextBlock(briefWindowContext),
  ]);
  ```
- Replace inline lead-event selection with `selectLeadEventForBrief(...)`.
- Park the old prompt builder behind `_legacyAssembleBriefUserPrompt` for one release as a safety reference (already established pattern in this file).
- Respect `mem/reliability/brief-prompt-variable-scoping`: all values passed into builders are declared in the outer scope.

## 3. `generate-mastery-plan/index.ts` changes
- Delete local `composeStateLabel`, replace all 6 call sites (slots 1/2/3, filler, forbidden-rewrite) with `composeSlotStateLabel(...)` from the new shared module.
- Slot persistence now writes the richer `anchorMeta`:
  ```
  anchorEventId, anchorCategoryId, anchorSubtypeId,
  anchorScenarioId, anchorLeadTimeMin,
  anchorDemandProfile,         // NEW (from enrichEvent)
  anchorPhases,                // NEW (pre/during/post windows)
  anchorTitle,                 // NEW (normalized)
  ```
  Bounded snapshot — no event bodies, no descriptions, just enriched metadata so downstream surfaces don't re-classify.

## 4. `smart-nudges/index.ts` changes
- Expand current `buildActionFrameForEvent` usage: every event-anchored nudge now also generates its "why now" via `generateWhyStatement` (shared `_shared/plan/why-llm.ts`) instead of bespoke per-nudge phrases.
- Hand-authored framing strings replaced with `buildActionFrame` / `buildRecommendedActionCopy` outputs where applicable.
- Keep intact (verified before/after):
  - V8 validation pass
  - forbidden-word filter
  - CTA enforcement
  - notification-only suppression
  - fallback copy safety path

## 5. `docs/SHARED_MODULES_DELEGATION_AUDIT.md`
Re-assess and close/narrow:
- **F-01** Brief prompt assembly → resolved (now `assembleBriefUserPrompt`)
- **F-09** Event selection duplication → resolved (`selectLeadEventForBrief`)
- **F-11** `composeStateLabel` island → resolved (moved to `_shared/events/slot-labels.ts`)
- **F-12** Slot persistence loses event meaning → narrowed (now persists enriched metadata)
- **F-14** Nudges "why now" hand-authored → resolved (uses `generateWhyStatement`)
- **F-16** Nudges framing duplication → resolved (uses `buildActionFrame`)
Strip stale "still missing" wording where it no longer applies.

## 6. Sequencing & safety

1. Add new shared modules first (pure functions, no callers yet) → builds clean.
2. Migrate `compute-outer-readiness` to use them; keep `_legacy*` alongside.
3. Migrate `generate-mastery-plan` slot-label calls in one pass; verify all 6 sites.
4. Migrate `smart-nudges` why/framing.
5. Update audit doc last so it reflects shipped state.

## Risks / non-goals
- Behavior preservation is the guarantee, not byte-identical prompt output. Wording inside blocks stays the same; ordering and omission rules are explicitly preserved.
- No scoring changes, no MRS changes, no DB changes, no client changes.
- No new dependencies.

## What I'd like you to confirm before I start
1. OK to introduce three new shared files (`brief/prompt-blocks.ts`, `brief/event-selection.ts`, `events/slot-labels.ts`)?
2. OK to expand slot persistence payload with `anchorDemandProfile`, `anchorPhases`, `anchorTitle` (no DB migration — these go into the existing JSON metadata column)?
3. OK to keep `_legacyAssembleBriefUserPrompt` as a parked reference for one release, matching the pattern already used in this file?
