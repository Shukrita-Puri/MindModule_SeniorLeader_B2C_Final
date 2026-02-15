
# Your Proactive Mastery Plan -- Refinement Plan

## What This Is

A targeted refinement -- not a rewrite. Most of the architecture (executive scenarios, theme-to-module mapping, content scoring, JIT detection) already exists in `performancePlanEngine.ts`. The work is:

1. Moving that existing logic into a backend function (IP protection)
2. Adding coach inclusion rules (morning = practice-heavy; evening = always coach + Tiny Wins)
3. Adding pill navigation for calendar context
4. Adding `session_period` tracking for progress
5. Cleaning up orphaned files

---

## Phase 1: Create `generate-mastery-plan` Backend Function

A new backend function that receives user context and returns the fully assembled plan. This is a **lift-and-shift** of existing `performancePlanEngine.ts` logic with three additions:

### What moves (already written, just relocating):
- `EXECUTIVE_SCENARIOS` array (20+ scenarios with keywords, lead times, modules)
- `THEME_MODULE_MAP` (40+ theme phrases to module specs)
- `detectExecutiveScenario()` function
- `calculateContentScore()` with the 7-factor scoring system
- `selectContentForModule()` with date-seeded deterministic selection
- `generatePerformancePlan()` orchestrator
- Content pool filters (`REGULATE_CONTENT_FILTERS`, `ALIGN_CONTENT_FILTERS`, `DURATION_FILTERS`)

### What is new (additions to the relocated logic):

**Coach Inclusion Rules:**
- Morning (strong/peak tier): NO coach card. Practice-only session.
- Morning (depleted/managing tier): Coach card included, but brief -- focused on regulation, not unpacking.
- Morning (consecutive-low 3+ days): Coach card included with pattern acknowledgement prompt.
- Afternoon: Coach card only when executive scenario has Prepare module.
- Evening: Coach card ALWAYS included. Prompt always references Tiny Wins ("What's one thing you did right today?"). Covers day unpacking and next-day preparation.
- JIT/Pre-event: Coach card included for mental rehearsal.

**Calendar Event Prioritisation** (new logic):
- Scoring factors: immediacy (+40/+30/+20/+10), organiser (+15), attendees >5 (+10), duration >60min (+8), non-recurring (+10), scenario keyword match (+25), prime hours (+5), back-to-back (+5), skip penalty (-15 or removal at 3+)
- Top 2 events become calendar context pills
- Highest-scoring event populates the pre-event plan

**Duration Ceiling by Calendar Load:**
- Low (0-2 meetings): 12-15 min, 4 modules max
- Medium (3-4 meetings): 7-10 min, 3 modules max
- High (5+ meetings): 3-5 min, 2 modules max
- No calendar: 10 min default, 3 modules max

**Evening-specific rules:**
- Prepare module only surfaces if high-priority event within 18 hours
- Integrate module always included
- If HRV load delta is significant: "You started today at [X]. You're closing at [Y]..." prompt

**Skip Learning:**
- Queries `jit_preferences` for last 30 days
- Event types with 3+ skips are filtered from surfacing

**Future feature tags** (stored but not surfaced):
- `role_play_eligible` on relevant scenarios
- `mental_model_tag` on relevant scenarios

### Inputs (sent from client):
`userId`, `innerReadinessTier`, `innerReadinessScore`, `outerReadinessPhrase`, `outerReadinessDriver`, `calendarLoad`, `calendarPressure`, `calendarEvents` (titles + start times), `favorites`, `completedToday`, `timezoneOffset`, `clarityLevel`, `confidenceLevel`, `checkInOutcome`, `archetype`

### Output shape:
```text
timeOfDayPlan:
  label (Morning Start / Afternoon Reset / Evening Close)
  period (morning / afternoon / evening)
  modules[] (type, contentId, title, contentType, duration, focus, intensity, isFavorite, reasoning)
  coachCard (prompt, title, duration) -- or null if not included
  totalDuration
  progressTracked: true

calendarPills[] (label, eventId, priorityScore) -- max 2

preEventPlan (if any):
  eventTitle, eventType, minutesUntil, timePill, contextDescription
  modules[], coachCard
  progressTracked: false

meta:
  generatedAt, scenarioId, durationCeiling, maxModules
```

Config addition to `supabase/config.toml`:
```text
[functions.generate-mastery-plan]
verify_jwt = false
```

---

## Phase 2: Database Changes

### Add column to `daily_ritual_completions`:
- `session_period` (text, nullable) -- "morning", "afternoon", or "evening"
- Enables per-period progress tracking on the Insights page

### Add column to `jit_preferences`:
- `dismissed` (boolean, default false) -- distinguishes "snoozed" (temporary) from "X dismissed" (permanent for this instance)

---

## Phase 3: Refactor `DailyRitual.tsx` (Thin Renderer)

### Remove:
- All imports of `performancePlanEngine`, `planReconstruction`, `energyStateEngine`, `coachInsightsExtractor`
- The entire `loadRecommendations()` method body (currently ~180 lines of local orchestration)

### Replace with:
- Single call to `generate-mastery-plan` backend function
- Receives the full plan object and renders it directly

### Add:
- **Pill navigation** at the top: 1 time-of-day pill (active by default) + up to 2 calendar context pills
- Clicking a calendar pill switches carousel to show pre-event session; clicking time-of-day pill switches back
- **Progress counter** continues to show `X of N completed` for time-of-day plans only
- **Session period** stored with completions for Insights tracking
- Tooltip updated: "Your Proactive Mastery Plan is built from your Inner Readiness Score and Outer Readiness Brief -- what your system needs right now, matched to the shape of your day. Each session is designed to close the gap between where you are and where the day needs you to be."

### Keep unchanged:
- Card design (carousel with thumbnail, module label, title, duration, favorite heart, completion checkmark)
- "Start Your Mastery Plan" button styling (bg-taupe text-white)
- Celebration confetti on completion
- Practice queue and navigation logic
- Coach card visual (SM monogram, portrait image)

---

## Phase 4: Refactor `JitCarousel.tsx` (Thin Renderer)

### Remove:
- All local detection logic: `detectInterventions()`, `checkConsecutiveLow()`, `getQuickPractices()`, `persistClassification()`
- Imports of `recommendationEngine`, `energyStateEngine`, `useCalendarSync`

### Replace with:
- Consume `preEventPlan` and `calendarPills` from the same backend response used by DailyRitual (passed as props or shared via context/query cache)

### Keep unchanged:
- X dismiss button (writes `action: 'dismissed'` to `jit_preferences`)
- Snooze button (writes `action: 'snoozed'` to `jit_preferences`)
- Time pills ("In 2 days", "In 30 min")
- Context descriptions
- "Start Pack" button
- Visual hierarchy (secondary to time-of-day plan)
- JIT plans excluded from progress tracking

---

## Phase 5: Delete Orphaned Files

### Components (confirmed no imports from any active page/route):
- `src/components/home/PerformancePreparation.tsx`
- `src/components/home/MicroInterventions.tsx`
- `src/components/home/MomentCard.tsx`
- `src/components/home/MomentCarousel.tsx`
- `src/components/home/DailyRitualCard.tsx`
- `src/components/home/IntelligentPriorityCard.tsx`
- `src/components/home/JustInTimeIntervention.tsx`
- `src/components/home/RecommendedPlan.tsx`

### Utilities (logic moved to backend):
- `src/utils/performancePlanEngine.ts` -- relocated to edge function
- `src/utils/planReconstruction.ts` -- no longer needed
- `src/utils/recommendationEngine.ts` -- replaced by backend scoring
- `src/utils/interventionContentMatcher.ts` -- only used by orphaned MicroInterventions
- `src/utils/interventionTracking.ts` -- only used by orphaned MicroInterventions
- `src/utils/momentDetectionEngine.ts` -- only used by orphaned PerformancePreparation
- `src/utils/packBuilderSystem.ts` -- only used by orphaned components
- `src/utils/contentRecommendationEngine.ts` -- only used by orphaned DailyRitualCard
- `src/utils/intelligenceEngine.ts` -- only used by orphaned IntelligentPriorityCard

### Note on `selfRegulationScoring.ts`:
- Still imported by `userArchetypeEngine.ts` for the `ComponentScores` type
- Will inline the type definition into userArchetypeEngine rather than keeping the whole file

---

## Phase 6: Update Naming and Tooltips

- Section header: "Your Proactive Mastery Plan" (already in place)
- MetricInfoModal description updated to: "Your Proactive Mastery Plan is built from your Inner Readiness Score and Outer Readiness Brief -- what your system needs right now, matched to the shape of your day. Each session is designed to close the gap between where you are and where the day needs you to be."
- JIT section tooltip: "A focused preparation sequence for the high-stakes moment ahead. Two or three minutes of targeted practice -- regulation, alignment, and a coaching prompt -- designed to bring your best self into the room."
- Button text: "Start Your Mastery Plan" (already in place)

---

## Summary of Changes

```text
NEW FILES:
  supabase/functions/generate-mastery-plan/index.ts

MODIFIED FILES:
  src/components/home/DailyRitual.tsx (thin renderer + pills)
  src/components/home/JitCarousel.tsx (thin renderer)
  src/pages/ExecutiveHome.tsx (tooltip text update)
  src/utils/userArchetypeEngine.ts (inline ComponentScores type)

DB MIGRATION:
  daily_ritual_completions: add session_period column
  jit_preferences: add dismissed column

DELETED FILES (8 components + 9 utilities = 17 files):
  Components: PerformancePreparation, MicroInterventions, MomentCard,
    MomentCarousel, DailyRitualCard, IntelligentPriorityCard,
    JustInTimeIntervention, RecommendedPlan
  Utilities: performancePlanEngine, planReconstruction,
    recommendationEngine, interventionContentMatcher,
    interventionTracking, momentDetectionEngine, packBuilderSystem,
    contentRecommendationEngine, intelligenceEngine
```
