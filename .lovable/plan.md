

# Context Intelligence Overhaul — Implementation Plan

## What Changes

Only the **text copy** produced by three context statement builders changes. No UI, no scoring, no module selection, no layout.

**Files in scope:**
- `supabase/functions/compute-inner-readiness/index.ts` — State statement builder
- `supabase/functions/compute-outer-readiness/index.ts` — Compass statement + Lean On / Watch For copy
- `supabase/functions/generate-mastery-plan/index.ts` — `generatePlanBrief()` + `buildEnrichedContextDescription()`

**One client-side behavioral change:**
- `src/pages/ExecutiveHome.tsx` — JIT-takes-priority rendering (show one plan, not both)
- `src/components/home/DailyRitual.tsx` — Accept `jitPriority` flag to suppress ToD plan
- `src/components/home/StrategicIntentionCard.tsx` — Accept JIT-aware mode for Compass reorientation

---

## Architecture: Shared Context + alreadyUsed[] Relay

### New: `buildSharedContext()` in `generate-mastery-plan/index.ts`
A single function that runs once per plan generation, producing a `SharedContext` object. This consolidates all signal fetches that currently happen independently across State, Compass, and Plan. The object is passed through to each statement builder.

Key additions to what's already fetched:
- `consecutiveDayStreak` — query last 5 `daily_checkins`, detect same-tier streak (already partially done via `getPatternOverride`)
- `coachMemory.sessionMemories` — from `coach_memory_index` (existing table)
- `coachMemory.breakthroughs` — from `coach_breakthrough_moments` (existing table)
- `coachMemory.commitmentOutcomes` — from `coach_accountability_tracker` (existing table, status field)
- `causeEffect.practiceImpact` — from `practice_sessions` + `daily_checkins` correlation
- `causeEffect.eventPhysiologicalPattern` — from existing `getHRVEventCorrelations()` (already computed)
- `causeEffect.stateCarryover` — from `daily_checkins` evening→morning pattern
- `calendarGaps[]` — computed from existing `calendar_events` data (gap between sorted events)
- `innerReadinessPattern.trend` — derived from last 5 check-ins energy_balance direction

**Note on `mentalSharpness`:** This does not exist as a column in `daily_checkins`. The closest proxy is `clarity_level`. Will map `mentalSharpness → clarity_level` and document.

**Note on `peakHR` / `hrVsBaseline`:** `wearable_data` already has `heart_rate` (peak) and `resting_heart_rate`. `compute-outer-readiness` already computes `hrElevated`. Will expose this in SharedContext.

### alreadyUsed[] Tracking
- State builder outputs `alreadyUsed: string[]` (e.g., `['hrv_deviation', 'sleep_score', 'streak_3d']`)
- Compass receives `alreadyUsed[]`, adds its own used signals, passes combined array forward
- Plan receives combined `alreadyUsed[]`, derives rationale only from modules + coach memory + urgency

---

## Problem 1: State — Calendar-Aware Signal Selection

### Current behavior
`compute-inner-readiness/index.ts` builds the statement from outcome × timeOfDay (Layer 1) + C×C modifier (Layer 2) + HRV context (Layer 3). It has **zero calendar awareness**.

### Changes to `compute-inner-readiness/index.ts`

1. **Accept optional `calendarLoad` and `highStakesCount` parameters** in `ComputeRequest`
2. **New function: `selectSignalsForStatement()`** — runs before `assembleContextStatement()`
   - IF calendarLoad = heavy/extreme OR highStakesCount > 0: check ALL signals (sleep, HRV, RHR), surface the most divergent from baseline, surface multiple if multiple diverge, or surface strength if all good
   - IF calendarLoad = light/moderate: surface single strongest signal only
   - IF no wearable: use clarity + confidence as proxy
3. **Add consecutive streak detection** — query not needed here (passed in from caller). Accept `consecutiveStreak: { tier: string, count: number } | null` in request
4. **Rewrite `assembleContextStatement()`** to use signal selection output instead of hardcoded Layer 1/2/3 assembly
5. **Output `alreadyUsed[]`** in the response alongside the statement

### Statement construction rules (enforced in code):
- Max 2 sentences
- First sentence: physiological reality (strongest signal)
- Second sentence (optional): cognitive reality only if it meaningfully diverges from physical signal
- Never repeat score/tier (shown in UI), never mention calendar events, never recommend

### Who calls it with calendar data?
`compute-inner-readiness` is called from `src/utils/energyStateEngine.ts` client-side. The client doesn't have calendar data at that point. **Solution:** The `generate-mastery-plan` edge function already calls `compute-outer-readiness` server-to-server and has all calendar data. Add a **server-to-server call to `compute-inner-readiness`** from `generate-mastery-plan` with `calendarLoad` and `highStakesCount` injected, or restructure so the State statement is built inside `compute-outer-readiness` (which already has calendar + wearable data). The cleaner approach: **move the State statement builder into `compute-outer-readiness`** as a sub-function, since it already has all required inputs (tier, outcome, wearable, calendar). The `compute-inner-readiness` function continues to compute the score/tier but the statement copy is generated in the outer readiness function and returned as a new field `stateStatement` + `stateAlreadyUsed[]`.

This avoids a new server-to-server call and keeps the relay contained within one edge function.

---

## Problem 2: Compass — Intersection Intelligence

### Changes to `compute-outer-readiness/index.ts`

1. **Receive `alreadyUsed[]`** from the State statement builder (now co-located)
2. **New priority cascade for context statement:**
   - P1: Coach memory + calendar match → lead with coach insight + event reference
   - P2: HRV × calendar historical pattern → reference pattern, not raw number
   - P3: State × calendar intersection → interpret, don't repeat
   - P4: Lean On / Watch For from coach > C×C > archetype × tier (existing cascade, improved copy)
3. **Enforce no-repeat rule:** if `alreadyUsed[]` contains `'hrv_deviation'`, Compass references the pattern ("your body is showing a familiar pre-board-meeting response") not the number
4. **Calendar event titles in italics:** Add `*event_title*` formatting in output strings (the UI component `TextWithEventEmphasis` already handles `'event_title'` with bold italic rendering)
5. **Coach memory integration:** Fetch `coach_memory_index` (recent, importance ≥ 5) and `coach_accountability_tracker` (pending commitments) — match against upcoming event types using `extractEventType()`
6. **HRV × event correlations:** Already computed in `generate-mastery-plan`. For `compute-outer-readiness`, add the same `getHRVEventCorrelations()` query
7. **Output `compassAlreadyUsed[]`** combining State's array + new signals used
8. **Evening logic improvements:** preserve existing branch structure, improve copy per the brief's examples

### Lean On / Watch For copy improvements:
- Keep existing cascade priority (coach > C×C > archetype > tier)
- Improve copy quality — shorter, more specific, derived from actual signals not generic templates
- Source labels already exist (`(coach)`, `(check-in)`, `(archetype)`, `(readiness)`)

---

## Problem 3: Plan Brief — Module-Derived Rationale

### Changes to `generate-mastery-plan/index.ts`

1. **Stop passing `outerReadinessContext` into `generatePlanBrief()`** — currently the Plan copies Compass verbatim
2. **New inputs to `generatePlanBrief()`:**
   - `resolvedModules[]` — the actual ToD modules selected (type + focus pairs)
   - `coachMemory` — matching commitment, historical event pattern, flagged pattern
   - `alreadyUsed[]` from State + Compass
   - `calendarGaps[]` and `nextEventMinutes`
3. **New function: `deriveRationaleFromModules(modules[])`** — maps module composition to rationale using the mapping table from the brief (regulate+restore → "nervous system recovery before the load lands", etc.)
4. **New function: `buildUrgencyFrame()`** — generates the final sentence based on JIT timing, calendar gaps, or time of day
5. **Coach memory integration:** if commitment matches upcoming event, reference it; if historical HRV pattern exists, reference it; if practice was previously effective, reference it
6. **Apply same logic to `buildEnrichedContextDescription()`** — the JIT context description builder follows identical rules

---

## Problem 4: One Plan at a Time — JIT Takes Priority

### Changes to `generate-mastery-plan/index.ts`
1. **Add `jitPriority: boolean` to response** — `true` when a JIT event is in touch_2 window (0-6h)
2. Already partially implemented: the plan returns both `timeOfDayPlan` and `preEventPlan`. The priority decision moves to the client.

### Changes to `src/pages/ExecutiveHome.tsx`
1. Read `jitPriority` from the mastery plan response
2. IF `jitPriority === true`: pass a prop to `DailyRitual` to render in collapsed/hidden mode
3. The JIT carousel becomes the primary plan display

### Changes to `src/components/home/DailyRitual.tsx`
1. Accept `jitPriority?: boolean` prop
2. When `true`: collapse the ToD plan to header + status message ("Your Time-of-Day plan is available after your event")
3. Add manual expand toggle

### Changes to `src/components/home/StrategicIntentionCard.tsx`
1. When JIT is primary, Compass context reorients toward the JIT event
2. Accept optional `jitEvent: { title: string, minutesUntil: number }` via a shared context or prop

---

## Implementation Order

1. **Build `buildSharedContext()` + extended data fetches** in `generate-mastery-plan/index.ts`
2. **Move State statement builder** into `compute-outer-readiness/index.ts` with calendar awareness + `alreadyUsed[]` output
3. **Rewrite Compass context builder** with intersection intelligence + no-repeat rule + coach memory
4. **Rewrite `generatePlanBrief()`** with module-derived rationale + urgency frame
5. **Rewrite `buildEnrichedContextDescription()`** with same pattern as Plan brief
6. **Add `jitPriority` flag** to plan response + client-side conditional rendering
7. **Deploy edge functions** (auto-deployed)

---

## Technical Details

### Database queries added (all from existing tables, no schema changes):
- `coach_memory_index`: recent memories by user, importance ≥ 5, limit 10
- `coach_breakthrough_moments`: last 30 days, limit 5
- `coach_accountability_tracker`: pending + recently resolved, limit 10
- `daily_checkins`: last 5 for streak detection (already queried, extend usage)
- `wearable_data`: last 7 days for trend (already partially done)
- Calendar gaps: computed from already-fetched `calendar_events`

### No new database tables or migrations required.

### Estimated scope:
- `compute-inner-readiness/index.ts`: ~30 lines changed (add optional params, output alreadyUsed)
- `compute-outer-readiness/index.ts`: ~250 lines changed (State builder, Compass rewrite, coach memory queries)
- `generate-mastery-plan/index.ts`: ~200 lines changed (SharedContext, generatePlanBrief rewrite, buildEnrichedContextDescription rewrite, jitPriority flag)
- `ExecutiveHome.tsx`: ~15 lines (jitPriority conditional)
- `DailyRitual.tsx`: ~20 lines (collapse mode)
- `StrategicIntentionCard.tsx`: ~10 lines (JIT-aware mode)

