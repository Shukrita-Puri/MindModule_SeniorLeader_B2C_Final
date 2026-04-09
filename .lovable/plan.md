

# Today's 3 Performance Priorities — v4.0 Implementation Plan

This is a major architectural refactor that unifies the current Time-of-Day plan (DailyRitual.tsx) and JIT carousel (JitCarousel.tsx) into a single 3-slot horizon-classified system.

## Scope Summary

**Backend**: Extend `generate-mastery-plan` edge function to produce a new `horizonModules[]` array (always 3 items) with horizon classification, deterministic `whyLine` construction, and JIT absorption into slots.

**Frontend**: Replace DailyRitual.tsx rendering with a new `TodayThreePriorities.tsx` component. Remove JitCarousel from homepage rendering. Preserve all existing completion tracking, navigation, and player routing.

---

## Phase 1: Backend — `generate-mastery-plan` Edge Function

### 1A. Add `HorizonModule` interface and allocation logic

Add to `generate-mastery-plan/index.ts`:
- `HorizonModule` interface (horizon, timeLabel, typeLabel, whyLine, practice, isJit, jitEventTitle, jitMinutesUntil, showNavyBorder, showPulse, showPriorityPill)
- `determineAllocationPattern()` function using tier, calendarLoad, hasJitEvent, jitMinutesUntil
- Returns `'2immediate-1tactical'` or `'1immediate-1tactical-1strategic'`

### 1B. Add deterministic `buildWhyLine()` function

Implement the full `buildWhyLine()` function from the spec. Key signal sources:
- **Immediate**: divergenceMode (from wearable), tier, patternInsight, JIT event proximity
- **Tactical**: `hrvEventCorrelation` (from existing `getHRVEventCorrelations()`), `patternInsight`, `frictionTrend` (from `innerReadinessPattern.trend`), `scoreTrend`
- **Strategic**: `pendingCommitment` (from `coach_accountability_tracker` via `shared.pendingCommitments`), `coachGrowthArea` (from `req.coachInsights`), `practicePriorityTag`, archetype watchFor

All deterministic TypeScript — no LLM call.

### 1C. Build 3 horizon slots in `generateMasteryPlan()`

After existing ToD and JIT plan generation, construct `horizonModules[3]`:

**Slot 1 (Immediate)**:
- If JIT event < 120 mins → use JIT practice from `preEventPlan.modules[0]` (bridge pipeline primary, legacy fallback)
- Else if depleted → first regulate/restore module from ToD
- Else → first ToD module
- timeLabel: contextual ("Before [event]", "This morning", "Right now")

**Slot 2 (Tactical)**:
- If JIT event 120-360 mins → JIT practice, navy border flag
- Else if HRV correlation exists for today's events → ToD module with correlation whyLine
- Else if JIT event > 360 mins → JIT as early awareness (orange border)
- Else → second ToD module
- timeLabel: contextual

**Slot 3 (Strategic or second Immediate)**:
- If allocation = `2immediate-1tactical` → third ToD module as immediate
- Else → strategic content: pendingCommitment match > coachGrowthArea match > archetype match > coach card > third ToD module
- timeLabel: "This evening", "When you have space", "For your development"

### 1D. Add `horizonModules` to response

Add `horizonModules: HorizonModule[]` to the return object alongside existing `timeOfDayPlan` and `preEventPlan` (preserved for backward compatibility / fallback guard).

### 1E. Derive additional signals for whyLine

Extract from existing `shared` context:
- `frictionTrend` from `shared.innerReadinessPattern.trend` (map 'declining' → friction)
- `scoreTrend` from comparing today's score vs yesterday's
- `divergenceMode` from wearable context (already available: compare HRV with check-in self-report)
- `pendingCommitment` text from `shared.pendingCommitments[0]`
- `coachGrowthArea` from `req.coachInsights` (filter for growth-area type)
- `archetypeWatchFor` from archetype lookup (use existing archetype → watchFor mapping)

---

## Phase 2: Frontend — New `TodayThreePriorities.tsx` Component

### 2A. Create `src/components/home/TodayThreePriorities.tsx`

A new component that:
- Receives `horizonModules[]` from the plan response
- Renders 3 numbered slots with expand/collapse behavior
- Slot 1 auto-expanded on load; slots 2-3 collapsed with reveal arrow
- On completion: circle → green tick, auto-collapse, auto-expand next slot
- Preserves all existing practice card styling from DailyRitual.tsx (thumbnails, labels, durations, favorites)

**Visual per slot state** (from spec):
- **Active**: Orange number circle, practice card visible, whyLine in italic 11px, Start button
- **Active JIT < 2hrs**: Pulse animation on number circle
- **Active JIT 2-6hrs**: Navy left border on card, "Priority event" pill
- **Collapsed**: Grey number circle, practice name only, reveal arrow
- **Completed**: Green circle with checkmark, collapsed

### 2B. Wire completion tracking

Reuse existing `upsertRitual()`, `checkRitualCompletion()`, and `navigateToPractice()` logic from DailyRitual.tsx. The `horizonModules[].practice` maps directly to existing `PlanModule` type.

### 2C. Wire JIT dismiss from slot

When user dismisses a JIT slot, call `track-jit-skip` edge function exactly as JitCarousel does today. Preserve 3-strike escalation logic.

### 2D. Slot 2 midday regeneration

On afternoon check-in with energy_balance delta >= 15 from morning:
- Re-invoke `generate-mastery-plan` 
- Replace only slot 2 from new `horizonModules[1]`
- Preserve slot 1 completion state and slot 3

---

## Phase 3: Homepage Integration — `ExecutiveHome.tsx`

### 3A. Replace DailyRitual + JitCarousel with TodayThreePriorities

- Remove `<JitCarousel>` rendering (both jitPriority and non-jitPriority blocks)
- Replace `<DailyRitual>` with `<TodayThreePriorities>`
- Update section header from "Performance Readiness Plan" to "Today's 3 Performance Priorities"
- Preserve `MetricInfoModal` with updated description

### 3B. Fallback guard

If `horizonModules` is undefined/empty in the response → render existing DailyRitual exactly as today. This ensures backward compatibility during rollout.

### 3C. Preserve all existing infrastructure

- `JitCarousel.tsx` remains in codebase (not deleted)
- `DailyRitual.tsx` remains in codebase (not deleted)
- All DB tracking, streak logic, plan feedback modal preserved
- `PerformancePreparation.tsx` (student mode) unchanged

---

## Phase 4: Ensure Upstream Onboarding Data Flows

Per earlier conversation, the following already flow downstream:
- `component_scores` → compute-outer-readiness (for Brief lean-on/watch-out)
- `practice_priority_tag` → content scoring (+20/+7 boost)
- Both → coachContextBuilder

For the new whyLine, `practicePriorityTag` is already on `req` and will be used in the strategic whyLine. `archetypeWatchFor` needs a small mapping from archetype name → watchFor text (add to edge function).

---

## What Does NOT Change (Verification Checklist from Spec)

- All content scoring weights
- Executive scenario library
- Theme-to-module mapping
- Duration ceiling logic
- Coach card inclusion rules
- Calendar override logic
- Relay race principle (stateAlreadyUsed/compassAlreadyUsed)
- Noise filter
- Skip/dismiss logic and 3-strike system
- jit_event_context bridge pipeline
- Legacy JIT scoring fallback
- HRV × calendar correlation engine
- All DB queries and table references
- Practice player navigation
- updateRitualCompletion() calls
- Completion tracking to sanctuary_events
- Streak tracking logic
- sessionStorage caching
- Plan feedback modal
- Desktop/iPad: zero changes

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/generate-mastery-plan/index.ts` | Add HorizonModule interface, buildWhyLine(), determineAllocationPattern(), slot construction logic, horizonModules in response |
| `src/components/home/TodayThreePriorities.tsx` | **New file** — 3-slot horizon UI with expand/collapse, JIT visual treatment, completion tracking |
| `src/pages/ExecutiveHome.tsx` | Replace DailyRitual + JitCarousel with TodayThreePriorities, update header text |
| `src/components/home/DailyRitual.tsx` | Preserved (fallback), not deleted |
| `src/components/home/JitCarousel.tsx` | Preserved (not deleted), removed from homepage render |

## Implementation Order

Due to the size, this should be implemented in 3 sequential batches:
1. **Backend first**: Edge function changes (horizonModules, buildWhyLine, allocation logic)
2. **Frontend component**: TodayThreePriorities.tsx with all visual states
3. **Homepage wiring**: ExecutiveHome.tsx integration with fallback guard

