# Load Shape SSOT — adding "how the day was loaded" alongside A–H

Today every surface answers "which *kind* of event drained me" (A–H category). None answer "which *shape* of day drained me" — back-to-back days, mode-switching days, weight-vs-volume days, travel-adjacent days. That is why "Mixed" is a dead end on Stress Load and on "When You Perform Best": it is a single bucket with no sub-shape.

This plan adds one shared Load Shape layer and points the four existing surfaces (Insights cards, Brief, Plan, Smart Nudges) at it. Nothing is replaced, no new surfaces, no new tables.

## What exists today (verified)

- A–H resolution is centralised in `resolveEvent()` and is the only allowed resolver.
- `cause-effect-engine` (v22) already has a private day-type classifier with a category→"demand mode" map (governance / performance / relational / cognitive / logistical) and a `Mixed` catch-all with no sub-shape.
- `computeCognitiveFragmentation()` already yields back-to-back hours + short-gap ratio.
- `contextSwitchingCost` is implemented as a behaviour rule (≥3 distinct A–H categories in the next 4h) and lives in `ceo-behaviour/stubs.ts` — the wrong home, and its "topic" notion is category-based, not mode-based.
- `backToBackLoadOverride`, `decisionDensity`, travel rules already exist as behaviour flags but only for the intra-day nudge/brief path — Insights never sees them.

## The addition: one Load Shape module

New shared module (mirrored on the frontend for label rendering only):

```text
supabase/functions/_shared/load-shape/
  modes.ts          A–H → demand mode (moved out of cause-effect-engine, single owner)
  classify.ts       classifyLoadShape(events, ctx) -> LoadShape
  labels.ts         canonical shape ids + display labels + tooltips
src/lib/loadShape.ts  FE mirror of ids/labels only (no formulas)
```

`LoadShape` (pure, derived from merged calendar events for a local day):

| Field | Meaning |
|---|---|
| `shapeId` | one of `focused`, `back_to_back`, `switching`, `weight_heavy`, `volume_heavy`, `travel_adjacent`, `light` |
| `shapeLabel` | display string, e.g. "Back-to-back day", "Mode-switching day" |
| `backToBackHours`, `shortGapRatio` | from `computeCognitiveFragmentation` |
| `modeSequence`, `modeSwitchCount` | distinct demand modes in local-day order |
| `stakesWeight`, `meetingCount`, `weightRatio` | aggregate stakes weight vs raw slot count |
| `travelAdjacency` | high-stakes event within 12h of a flight/landing |
| `evidence[]` | short strings for tooltips and traces |

Precedence (deterministic, first match wins): `travel_adjacent` → `back_to_back` (≥4h chains with a <15min gap) → `switching` (≥3 distinct modes, or ≥2 with a relational mode) → `weight_heavy` (stakesWeight high, ≤4 meetings) → `volume_heavy` (≥7 meetings, low stakesWeight) → `focused` → `light`.

This is the layer that finally gives "Mixed" a second axis: a Mixed day is now **Mixed · switching**, **Mixed · weight-heavy**, **Mixed · volume-heavy** etc.

## Surface-by-surface wiring (all existing surfaces, version bumps only)

### 1. Insights — "When You Perform Best" + "What Drains You" + Stress Load
- `cause-effect-engine` → **v23**: import `modes.ts` instead of its private map; add `loadShapeMatrix` (shape × next-day HRV / PRS delta) alongside the existing `dayTypeHrvMatrix`; stamp each day's `shapeId` into diagnostics.
- Stress Load tooltip and Day Type rows gain a shape qualifier line (`Mixed · mode-switching`, `n = …`). Existing cells, colours and bands unchanged.
- `performance-rhythm-insights`: drain/lift sentences may cite a shape when its n ≥ 3 and its delta beats the category delta, e.g. "Mode-switching days cost you more than any single meeting type."
- Same gates as today: n ≥ 3 for banners, n ≥ 2 for rows, no formulas in the UI.

### 2. Brief
- `brief-context.ts` gains `signals.loadShape` (additive, optional).
- `deterministic-brief.ts` + the LLM prompt get one shape sentence per bucket (Day Shape bucket already exists). Bump brief prompt version so caches invalidate.
- `contextSwitchingCost` moves from `stubs.ts` into `ceo-behaviour/load-shape.ts` and reads `modeSwitchCount` instead of raw category count; `backToBackLoadOverride` reads the same shape object. Rule names, scopes and copy contracts unchanged (registry contract test stays green).

### 3. Plan
- Mastery plan scorer receives `loadShape.shapeId` and uses it as a tie-breaker only: switching days favour transition/reset practices, weight-heavy days favour prep/composure, volume-heavy days favour short recovery. Slot model, eligibility and regeneration stability untouched.

### 4. Smart Nudges
- Nudge evaluator reads `loadShape` from the daily context snapshot instead of recomputing back-to-back hours locally. `meetingPrepCliff` severity stacks when the shape is `switching` or `weight_heavy`.

### Persistence
- `daily_context_snapshot` gets one additive nullable `jsonb` column `load_shape` written by `build-daily-context` (the existing SSOT orchestrator). Every consumer reads from the snapshot — no surface recomputes. No new tables, no RLS surface change beyond the existing snapshot policies.

## Tests
- Unit tests for `classifyLoadShape` precedence, including the four Mixed sub-shapes and the travel-within-12h case.
- Contract test: `cause-effect-engine` and the FE mirror agree on shape ids/labels.
- Guard test: no surface imports the demand-mode map from anywhere except `_shared/load-shape/modes.ts`.
- Existing behaviour-rule registry and brief-copy tests must stay green unchanged.

## Explicitly out of scope
- No free-text topic classifier on titles (Eng vs Legal vs Sales). Demand mode is derived from A–H, which is already learned and user-correctable — a second keyword taxonomy would drift.
- No new Insights card, no new tab, no schema beyond one nullable column.
