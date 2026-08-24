# Load Shape SSOT — "how the day was loaded" alongside A–H

Today every surface answers "which *kind* of event drained me" (A–H category). None answer "which *shape* of day drained me" — back-to-back days, mode-switching days, weight-vs-volume days, travel-adjacent days. That is why "Mixed" is a dead end on Stress Load and on "When You Perform Best": one bucket, no sub-shape.

This adds one shared Load Shape layer and lets the four existing surfaces (Insights cards, Brief, Plan, Smart Nudges) read from it. **Strictly additive and isolated: no existing rule, formula, threshold, matrix, classifier or mirror is modified, moved or renamed.** Two shapes only for launch.

## Isolation contract (pre-launch safety)

- Nothing existing is refactored. No code is moved out of `cause-effect-engine`, no rule is moved out of `ceo-behaviour/stubs.ts`, no existing signal is deleted or repointed.
- Existing outputs stay byte-identical when `load_shape` is absent or null: every reader takes a `if (!shape) → behave exactly as today` early exit.
- `contextSwitchingCost`, `backToBackLoadOverride`, `decisionDensity`, `dayTypeHrvMatrix`, `stressMatrix`, `burnoutMatrix`, MRS scoring, plan slot/eligibility logic and nudge scheduling keep their current inputs and behaviour untouched.
- The Load Shape layer is read-only with respect to the rest of the system: it consumes `resolveEvent()` output and `computeCognitiveFragmentation()`, and produces one jsonb blob. It never writes back into any existing field.
- Kill switch: if `load_shape` is not written, or the new copy blocks are disabled, the app is functionally identical to today. That makes the whole change revertible by removing one write and one render block.


## Pre-flight checks (results already confirmed)

**Check 1 — Event Category type: an equivalent exists, so do not duplicate.**
`supabase/functions/_shared/events/event-categories.ts` already exports `EventCategoryId = "A"|…|"H"`, and the name `EventCategory` is **already taken there** by an interface holding category metadata. So in the new `types.ts`:
- import and re-export `EventCategoryId` as the canonical id union, and alias `export type EventCategory = EventCategoryId` only if the uploaded file's downstream names need it;
- keep `EventSubcategory` defined in the new file (no existing union of the 28 subcategory strings exists — `event-subtypes.ts` exposes `EventType`/`DemandDim`/`EventGroup`, not a subcategory union), and add a test asserting every value in it is reachable from the subtype table so the two can't drift;
- resolution itself stays with `resolveEvent()` / `enrichEvent()` — Load Shape never classifies events itself.

There is also an existing **frontend mirror**, `src/lib/events/categories.ts` (`EventCategoryId` + `EVENT_CATEGORY_NAMES`), kept honest by `src/lib/events/__tests__/categories.test.ts`, which parses the backend file and fails on drift. So `src/lib/loadShape.ts` follows that exact pattern rather than inventing a new one: it imports `EventCategoryId` from `@/lib/events/categories` (never re-declares A–H), mirrors only shape ids + display labels, and gets its own drift test that reads `_shared/load-shape/types.ts` and asserts the shape id/label sets match. Components must not hardcode a shape label, same rule as pillar names today.

**Check 2 — Demand Mode: copy the labels, leave the engine alone.**
`cause-effect-engine` (v22) has a private `modeOf()` map inside `classifyDominantDayType` using governance / performance / relational / cognitive / logistical. Given the isolation contract, that private map is **not** extracted or edited now. Instead `_shared/load-shape/modes.ts` defines `CATEGORY_TO_MODE` as the forward-looking owner, using the same five labels plus the new `visibility`, `social`, `rhythmic`, and a test asserts the two agree on the five shared labels so they cannot silently diverge. De-duplicating them (engine imports `modes.ts`) is a post-launch follow-up, noted in the file header.

## Module layout

```text
supabase/functions/_shared/load-shape/
  types.ts     <- uploaded canonical file, placed verbatim except the two check-1/2 imports
  modes.ts     <- CATEGORY_TO_MODE (new file; engine's private map left untouched)
  classify.ts  <- classifyLoadShape(input): the ONLY producer of a LoadShape
  labels.ts    <- re-export of SHAPE_DISPLAY_CONFIG helpers for copy/tooltips
src/lib/loadShape.ts  <- FE mirror of shape ids + labels only (no formulas, no thresholds)
```

`LoadShape`, `ShapeId`, `DemandMode`, `EventSubcategory`, the per-surface `*ShapeInput` slices, `hasLoadShape()` and `getLoadShapeOrDefault()` all come from the uploaded `types.ts`.

## Ship this sprint: `back_to_back` and `switching` only

Only the two shapes flagged `launchReady: true` get copy, insight sentences and nudge severity. The other five have types and classifier logic, produce diagnostics, and render nothing.

| Shape | Fires when | Launch copy |
|---|---|---|
| `back_to_back` | `backToBackHours >= 4` AND `shortGapRatio > 0.6` (commonly stacked `E.routine_sync`) | "Your back-to-back days correlate with lower next-day readiness scores." |
| `switching` | `modeSwitchCount >= 3`, OR `modeSwitchCount >= 2` AND `modeSequence` includes `relational` | "Mode-switching days are costing you more than any single meeting type." |

`backToBackHours` and `shortGapRatio` come from the existing `computeCognitiveFragmentation()` — not recomputed.

## Wiring — one producer, four readers

Only `build-daily-context` calls `classifyLoadShape()` and writes the result. Every consumer calls `getLoadShapeOrDefault(snapshot.load_shape)`, which is null-safe, so no surface can crash on a missing value.

| Surface | Reads | Type slice |
|---|---|---|
| `cause-effect-engine` → **v23** | `daily_context_snapshot.load_shape` | `CauseEffectShapeInput` |
| `brief-context.ts` (Brief) | same | `BriefShapeInput` |
| Mastery plan scorer | same | `PlanShapeInput` |
| Smart nudges evaluator | same | `NudgeShapeInput` |

Per-surface effects:
- **Insights** — v23 adds `loadShapeMatrix` (shape × next-day HRV delta) alongside the existing `dayTypeHrvMatrix`, and stamps each day's `shapeId` into diagnostics. Stress Load and Day Type rows gain a shape qualifier (`Mixed · mode-switching`, with `n`). "When You Perform Best" / "What Drains You" may cite a shape sentence when its `n >= 3` and its delta beats the category delta. Existing cells, colours, bands and gates unchanged; no formulas in the UI.
- **Brief** — `signals.loadShape` added (optional). One shape sentence inside the existing Day Shape bucket for the two launch shapes; brief prompt version bumped so caches invalidate. `contextSwitchingCost` moves out of `ceo-behaviour/stubs.ts` into `ceo-behaviour/load-shape.ts` and reads `modeSwitchCount` instead of counting raw A–H categories; `backToBackLoadOverride` reads the same object. Rule names, scopes and copy contracts unchanged so the registry contract test stays green.
- **Plan** — `shapeId` is a tie-breaker only: `switching` favours transition/reset practices, `back_to_back` favours short recovery. Slot model, eligibility and regeneration stability untouched.
- **Nudges** — the evaluator reads back-to-back hours from the snapshot instead of recomputing; `meetingPrepCliff` severity stacks when the shape is `switching`.

## Persistence

One additive nullable column: `daily_context_snapshot.load_shape jsonb`. No new tables, no RLS change beyond the existing snapshot policies.

## Tests / guards

- Import guard (vitest + the existing Deno cross-layer guard): `LoadShape`, `ShapeId`, `DemandMode`, `EventSubcategory` may only be imported from `_shared/load-shape/types.ts`, and `CATEGORY_TO_MODE` only from `modes.ts` — mirroring the existing single-A–H-entry-point guard.
- Unit tests for `classifyLoadShape` precedence, both launch-shape thresholds (including the relational shortcut), and null/garbage-event safety.
- Contract test: FE mirror and backend agree on shape ids + labels; `EventSubcategory` values all exist in the subtype table.
- `getLoadShapeOrDefault(null)` returns the `light` default without throwing.
- Existing behaviour-rule registry, brief-copy and A–H guards stay green unchanged.

## Out of scope

- No free-text topic classifier on titles (Eng vs Legal vs Sales). Demand mode derives from A–H, which is already learned and user-correctable; a second keyword taxonomy would drift.
- No copy for the five non-launch shapes, no new Insights card or tab, no schema beyond the one nullable column.
