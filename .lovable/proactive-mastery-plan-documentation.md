# Proactive Mastery Plan — Full System Documentation

## Overview

The Proactive Mastery Plan is the app's daily practice recommendation engine. It assembles a personalized sequence of 2–4 practice modules based on the user's Inner Readiness Score, Outer Readiness Brief (theme phrase), calendar context, coach insights, and user preferences. The plan is generated server-side via the `generate-mastery-plan` Edge Function and rendered client-side by `DailyRitual.tsx`.

---

## 1. Edge Functions

### `generate-mastery-plan` (1,270 lines)
**Path:** `supabase/functions/generate-mastery-plan/index.ts`  
**Auth:** `verify_jwt = false` (public, receives userId in body)  
**Purpose:** Generates the complete daily plan response.

#### Input (`PlanRequest`)
| Field | Type | Source |
|-------|------|--------|
| `userId` | string | Auth user ID |
| `innerReadinessTier` | string (`depleted`/`managing`/`strong`/`peak`) | `computeEnergyState()` → `compute-inner-readiness` EF |
| `innerReadinessScore` | number (0–100) | Same |
| `outerReadinessPhrase` | string (theme phrase) | `fetchOuterReadiness()` → Outer Readiness Brief |
| `outerReadinessDriver` | string | Same |
| `calendarLoad` | string (`none`/`low`/`medium`/`high`) | `energyStateEngine.ts` → client-side calendar metrics |
| `calendarPressure` | string | Same |
| `calendarEvents` | CalendarEvent[] | Direct DB query from `calendar_events` table |
| `favorites` | string[] | `useFavorites()` hook → `user_preferences.favorite_content_ids` |
| `completedToday` | string[] | `daily_ritual_completions.completed_practice_ids` |
| `timezoneOffset` | number | `new Date().getTimezoneOffset()` |
| `clarityLevel` | number | From check-in (currently hardcoded 0) |
| `confidenceLevel` | number | From check-in (currently hardcoded 0) |
| `checkInOutcome` | string | `energyState.checkInOutcome` |
| `archetype` | string | Currently empty string |
| `coachInsights` | CoachInsight[] | `getActiveCoachInsights()` → `user_coach_insights` table |
| `effectiveContent` | string[] | Currently empty array |
| `patternInsight` | `{ count, state }` | Client-side: 7-day `daily_checkins` consecutive low check |
| `practicePriorityTag` | string | `profiles.practice_priority_tag` |
| `pressureContextTag` | string | `profiles.pressure_context_tag` |

#### Output (`MasteryPlanResponse`)
```typescript
{
  timeOfDayPlan: {
    label: string;           // "Morning Practice" / "Afternoon Reset" / "Evening Close"
    period: 'morning' | 'afternoon' | 'evening';
    modules: PlanModule[];   // 2-4 practice modules
    coachCard: CoachCardData | null;
    totalDuration: number;
    progressTracked: boolean;
  };
  calendarPills: CalendarPill[];  // Max 2 upcoming event badges
  preEventPlan: PreEventPlan | null;  // Scenario-specific plan for top event
  meta: {
    generatedAt: string;
    scenarioId: string | null;
    durationCeiling: number;
    maxModules: number;
  };
}
```

#### Core Logic

**Step 1 — Skip Preferences:** Queries `jit_preferences` for events the user has dismissed 2+ times in 30 days. Events skipped 3+ times are fully excluded.

**Step 2 — Pending Commitments:** Queries `coach_accountability_tracker` for `status = 'pending'` commitments, used to boost matching content (+15 for exact ID match, +10 for keyword match).

**Step 3 — Content Library:** Fetches all active content from `sanctuary_content` + `sanctuary_content_metadata` (structured tags, mastery categories).

**Step 4 — Calendar Event Scoring:** Each calendar event receives a composite score:
- Immediacy: +40 (≤2h), +30 (≤4h), +20 (≤24h), +10 (≤48h)
- Organizer: +15
- Attendees > 5: +10
- Duration > 60 min: +8
- Non-recurring: +10
- Scenario keyword match: +25
- Prime hours (9-12, 14-16): +5
- Back-to-back: +5
- Skip penalty: -15

**Step 5 — Theme-to-Module Mapping:** The Outer Readiness phrase maps to a `ThemeModuleMapping` containing `regulate`, `align`, `prepare`, `integrate` module specs. ~60 theme phrases are mapped, with a fallback default.

**Step 6 — Content Selection & Scoring:**
| Signal | Weight |
|--------|--------|
| User Favourite | +30 |
| Coach Insight match (direct ref) | +25 |
| Previously rated effective | +20 |
| Intensity match | +15 |
| Onboarding priority tag match | +15 (full) / +5 (decayed) |
| Duration match | +10 |
| Focus tag match | +10 |
| Onboarding pressure tag match | +8 (full) / +3 (decayed) |
| Not completed today | +5 |
| Coach commitment (exact ID) | +15 |
| Coach commitment (keyword) | +10 |

Onboarding signals decay when `favorites.length > 0` or `coachInsights.length > 0`.

Selection: Top 3 candidates → deterministic pick via date-seeded hash.

**Step 7 — Coach Card Inclusion Rules:**
| Time of Day | Tier | Condition | Include? |
|-------------|------|-----------|----------|
| Evening | Any | Always | ✅ Always (Tiny Win & Reflection) |
| Morning | Depleted/Managing | Always | ✅ |
| Morning | Strong/Peak | 3-day low pattern OR high pressure OR coach favourite | ✅ |
| Morning | Strong/Peak | Otherwise | ❌ |
| Afternoon | Depleted | Always | ✅ |
| Afternoon | Any | High pressure + event within 4h | ✅ |
| Afternoon | Otherwise | — | ❌ |
| Pre-event | Any | Always | ✅ |

**Step 8 — Duration Ceiling:**
| Calendar Load | Max Duration | Max Modules |
|---------------|-------------|-------------|
| Low | 15 min | 4 |
| Medium | 10 min | 3 |
| High | 5 min | 2 |
| None | 10 min | 3 |

**Step 9 — Executive Scenarios (20 scenarios):**
Calendar events are matched to pre-defined executive scenarios (board meetings, investor pitches, negotiations, etc.) via keyword triggers. Each scenario defines specific module specs with priority, intensity, and focus.

---

### `daily-rituals` Edge Function
**Path:** `supabase/functions/daily-rituals/index.ts`  
**Auth:** JWT verified via `authenticateRequest()`  
**Actions:** `GET_RITUALS`, `GET_TODAY_RITUAL`, `GET_RITUAL_RANGE`, `UPSERT_RITUAL`  
**Purpose:** CRUD operations on `daily_ritual_completions` table.

---

## 2. Database Tables

### Primary Tables

#### `daily_ritual_completions` ⭐ (Core tracking table)
| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | PK |
| `user_id` | text | Owner |
| `ritual_date` | date | The day |
| `completion_status` | text | `'partial'` / `'full'` / `'skipped'` |
| `recommended_practice_ids` | text[] | IDs from the generated plan |
| `completed_practice_ids` | text[] | IDs the user actually completed |
| `recommended_practices_count` | integer | Total expected count |
| `session_period` | text | `'morning'` / `'afternoon'` / `'evening'` |
| `soundscape_completed` | boolean | Legacy: individual type flags |
| `soundscape_completed_at` | timestamptz | Legacy |
| `guided_practice_completed` | boolean | Legacy |
| `guided_practice_completed_at` | timestamptz | Legacy |
| `micro_exercise_completed` | boolean | Legacy |
| `micro_exercise_completed_at` | timestamptz | Legacy |
| `created_at` / `updated_at` | timestamptz | Timestamps |

**RLS:** Deny-by-default. Access via `daily-rituals` Edge Function (service role).  
**Unique constraint:** `(user_id, ritual_date)` for upsert.

#### `sanctuary_content` (Content library)
| Column | Type | Purpose |
|--------|------|---------|
| `id` | text | Content ID (e.g., `box-breathing-mastery`) |
| `title` | text | Display name |
| `content_type` | text | `'soundbath'` / `'guided-practice'` / `'micro-practice'` |
| `category` | text | `'pause'` / `'power-up'` / `'presence'` |
| `tags` | text[] | Searchable tags |
| `duration` | numeric | Minutes |
| `sub_type` | text | E.g., `'mindset'`, `'somatic'` |
| `difficulty` | text | Level |
| `protocol_type` | text | Practice protocol |
| `thumbnail_url` | text | Card image |
| `is_active` | boolean | Active filter |

**RLS:** Public SELECT for active content. Admin-only mutations.

#### `sanctuary_content_metadata` (Extended content tags)
| Column | Type | Purpose |
|--------|------|---------|
| `content_id` | text | FK to sanctuary_content |
| `structured_tags` | jsonb | `{ intensityLevel, goalTags, contextTags }` |
| `mastery_category` | jsonb | `{ primary, secondary }` |
| `meta_skills` / `sub_skills` / `checkin_tags` | jsonb | Mapping arrays |

**Used by:** Content scoring in `generate-mastery-plan` for intensity and goal tag matching.

### Upstream Input Tables

#### `daily_checkins`
**Used for:** `checkInOutcome`, `clarityLevel`, `confidenceLevel`, and 7-day consecutive low pattern detection.  
**Connection:** Client queries last 7 check-ins → builds `patternInsight` → sends to EF.

#### `calendar_events`
**Used for:** Calendar event scoring, pre-event plan generation, executive scenario matching.  
**Connection:** Client fetches next 48h events → sends as `calendarEvents` array.

#### `calendar_connections`
**Used for:** Determining if user has active calendar integration (affects `calendarLoad`/`calendarPressure`).

#### `profiles`
**Used for:** `practice_priority_tag`, `pressure_context_tag` (onboarding signals), streak data.  
**Connection:** Client fetches profile → sends tags in request body.

#### `user_preferences`
**Used for:** `favorite_content_ids` → sent as `favorites` array.  
**Connection:** `useFavorites()` hook.

#### `user_coach_insights` *(referenced but NOT in types.ts — potential issue)*
**Used for:** Coach insight content matching (+25 boost for direct reference, keyword matching).  
**Connection:** `getActiveCoachInsights()` → sends as `coachInsights` array.

#### `coach_accountability_tracker`
**Used for:** Pending commitments boost (+15 exact ID, +10 keyword).  
**Connection:** Direct query in EF.

#### `jit_preferences`
**Used for:** Skip/dismiss penalty on calendar events.  
**Connection:** Direct query in EF.

#### `inner_readiness_scores`
**Used for:** Inner Readiness tier and score (computed by `compute-inner-readiness` EF).  
**Connection:** Client calls `computeEnergyState()` → sends `innerReadinessTier` and `innerReadinessScore`.

### Downstream Consumer Tables/Features

#### `daily_ritual_completions` (Write-back)
**Consumer:** After plan generation, client upserts `recommended_practice_ids` and `recommended_practices_count`. On each practice completion, `completed_practice_ids` is appended and `completion_status` recalculated.

#### `profiles` (Streak updates)
**Consumer:** `useStreakTracking` reads `daily_ritual_completions` with `completion_status = 'full'` to calculate streaks → updates `profiles.current_streak`, `longest_streak`, `last_streak_celebration`.

#### `sanctuary_events` (Insights tracking)
**Consumer:** `logPracticeCompletion()` via `practiceCompletionTracker.ts` logs each completed practice to `sanctuary_events` for the Insights page.

#### `mental_fitness_scores`
**Consumer:** `mentalFitnessEngine.ts` reads `dailyRitualHistory` from localStorage to calculate `ritual_completion_score` (40% weight in mental fitness).

#### `content_relevance_feedback`
**Consumer:** Post-practice ratings feed back into `effectiveContent` signal (currently empty array — **gap identified**).

---

## 3. Client-Side Files

| File | Role |
|------|------|
| `src/components/home/DailyRitual.tsx` | Main UI component — calls EF, manages plan state, handles navigation |
| `src/utils/dailyRituals.ts` | CRUD wrapper for `daily_ritual_completions` via `daily-rituals` EF |
| `src/utils/energyStateEngine.ts` | Computes energy state (calls `compute-inner-readiness` EF) |
| `src/utils/coachInsightsExtractor.ts` | Fetches active coach insights from `user_coach_insights` |
| `src/utils/practiceCompletionTracker.ts` | Logs completions to `sanctuary_events` |
| `src/hooks/useStreakTracking.ts` | Calculates streaks from ritual completions |
| `src/hooks/useFavorites.ts` | Manages user favourites |
| `src/hooks/useOuterReadiness.ts` | Fetches Outer Readiness Brief (theme phrase) |
| `src/components/home/JitCarousel.tsx` | Renders pre-event JIT pills |
| `src/components/insights/PerformanceRhythmCard.tsx` | Reads ritual completions for rhythm heatmap |
| `src/pages/SelfMasteryCoach.tsx` | Coach page — calls `updateRitualCompletion` on session end |
| `src/pages/SoundscapePlayer.tsx` | Calls `updateRitualCompletion('soundscape', ...)` on completion |
| `src/pages/GuidedPracticePlayer.tsx` | Calls `updateRitualCompletion('guided_practice', ...)` on completion |
| `src/pages/MicroPracticePlayerCards.tsx` | Calls `updateRitualCompletion('micro_exercise', ...)` on completion |

---

## 4. Data Flow Diagram

```
┌─────────────────────── UPSTREAM INPUTS ───────────────────────┐
│                                                                │
│  daily_checkins ──→ checkInOutcome, patternInsight             │
│  compute-inner-readiness EF ──→ tier, score                    │
│  compute-outer-readiness EF ──→ themePhrase, driver            │
│  calendar_events ──→ calendarEvents[]                          │
│  user_preferences ──→ favorites[]                              │
│  user_coach_insights ──→ coachInsights[]                       │
│  profiles ──→ practicePriorityTag, pressureContextTag          │
│  energyStateEngine (client) ──→ calendarLoad, calendarPressure │
│                                                                │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │  generate-mastery-plan EF     │
              │                              │
              │  READS (server-side):        │
              │  • sanctuary_content          │
              │  • sanctuary_content_metadata │
              │  • jit_preferences            │
              │  • coach_accountability_tracker│
              │                              │
              │  SCORING → MODULE SELECTION  │
              │  THEME MAPPING → PLAN BUILD  │
              └──────────────┬───────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │  DailyRitual.tsx (Client)     │
              │                              │
              │  WRITES:                     │
              │  • daily_ritual_completions   │
              │    (recommended_practice_ids, │
              │     recommended_practices_    │
              │     count, session_period)    │
              │  • sessionStorage cache       │
              │  • localStorage practiceQueue │
              └──────────────┬───────────────┘
                             │
                 ┌───────────┼───────────┐
                 ▼           ▼           ▼
         ┌───────────┐ ┌─────────┐ ┌────────────┐
         │Soundscape │ │Guided   │ │Micro       │
         │Player     │ │Practice │ │Practice    │
         │           │ │Player   │ │Player/Coach│
         └─────┬─────┘ └────┬────┘ └─────┬──────┘
               │             │            │
               └─────────────┼────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │  updateRitualCompletion()     │
              │  (src/utils/dailyRituals.ts)  │
              │                              │
              │  WRITES:                     │
              │  • daily_ritual_completions   │
              │    (completed_practice_ids,   │
              │     completion_status)        │
              └──────────────┬───────────────┘
                             │
               ┌─────────────┼──────────────┐
               ▼             ▼              ▼
     ┌──────────────┐ ┌───────────┐ ┌──────────────────┐
     │useStreak     │ │Performance│ │Mental Fitness     │
     │Tracking      │ │Rhythm Card│ │Engine             │
     │→profiles     │ │(Insights) │ │(localStorage only)│
     └──────────────┘ └───────────┘ └──────────────────┘
```

---

## 5. Audit: Connection Gaps & Issues

### ✅ Connected & Working
| Connection | Status |
|-----------|--------|
| Inner Readiness → Plan (tier, score) | ✅ Connected via `computeEnergyState()` |
| Outer Readiness → Plan (theme phrase) | ✅ Connected via `fetchOuterReadiness()` |
| Calendar Events → Plan (event scoring) | ✅ Direct DB query in `DailyRitual.tsx` |
| Favourites → Plan (+30 boost) | ✅ Via `useFavorites()` hook |
| Content Library → Plan (selection pool) | ✅ EF queries `sanctuary_content` + metadata |
| Coach Commitments → Plan (+15/+10 boost) | ✅ EF queries `coach_accountability_tracker` |
| JIT Skip Preferences → Plan (penalty) | ✅ EF queries `jit_preferences` |
| Onboarding Tags → Plan (priority/pressure) | ✅ Client fetches from `profiles` |
| Pattern Insight → Plan (consecutive low) | ✅ Client checks 7-day checkins |
| Plan → `daily_ritual_completions` (save) | ✅ Upserts on generation |
| Practice Players → `updateRitualCompletion()` | ✅ All 3 players + Coach call it |
| Ritual Completions → Streak Tracking | ✅ `useStreakTracking` reads completions |
| Ritual Completions → Performance Rhythm | ✅ `PerformanceRhythmCard` reads completions |
| Practice Completions → Sanctuary Events | ✅ `logPracticeCompletion()` tracks to insights |

### ⚠️ Partially Connected / Gaps

| Issue | Severity | Detail |
|-------|----------|--------|
| **`effectiveContent` always empty** | 🟡 Medium | `DailyRitual.tsx` line 340 sends `effectiveContent: []`. The scoring engine supports +20 for effective content, but no data is ever passed. Should query `content_relevance_feedback` for practices with high `star_rating` (4-5). |
| **`clarityLevel` / `confidenceLevel` hardcoded 0** | 🟡 Medium | Lines 335-336 in `DailyRitual.tsx`. These values exist in `daily_checkins` and are fetched by `energyStateEngine.ts`, but not passed through to the plan request. The EF doesn't use them currently either, but they're in the interface. |
| **`archetype` always empty** | 🟢 Low | Line 338. `profiles.user_archetype` exists but is never sent. The EF doesn't use it currently. |
| **`user_coach_insights` table not in types.ts** | 🟡 Medium | `coachInsightsExtractor.ts` queries this table directly. It works because Supabase allows string-based table access, but it's not type-safe and won't appear in auto-generated types. Confirm table exists in DB. |
| **Mental Fitness reads from localStorage only** | 🟡 Medium | `mentalFitnessEngine.ts` reads `dailyRitualHistory` from localStorage, not from the DB `daily_ritual_completions` table. This means mental fitness scores don't reflect actual cloud data and are lost on cache clear. |
| **`wearableStress` in PlanRequest but never sent** | 🟢 Low | The interface includes `wearableStress` but `DailyRitual.tsx` doesn't send it. The EF doesn't use it either. Dead field. |
| **Completion status race condition** | 🟡 Medium | `updateRitualCompletion()` does GET → append → UPSERT → GET → UPSERT (4 network calls). If two practices complete near-simultaneously, `completed_practice_ids` could lose an entry. Consider server-side array append. |
| **No real-time refresh after completion** | 🟢 Low | `DailyRitual.tsx` polls every 15s (`checkRitualCompletion` interval). If user completes a practice and returns quickly, there may be a delay before the UI updates. |

### ✅ No Issues Found
- Plan regeneration on new check-in: ✅ Correctly detects when checkin timestamp > plan timestamp
- Session caching: ✅ Uses sessionStorage to avoid redundant EF calls
- Coach card in queue: ✅ Coach sessions now call `updateRitualCompletion('micro_exercise', coachContentId)`
- Pre-event plan separate from time-of-day plan: ✅ Independent module lists
- Duration ceiling enforcement: ✅ Correctly limits based on calendar load

---

## 6. Scoring Weight Summary

### Content Selection Scoring (max theoretical: ~148)
| Signal | Points | Condition |
|--------|--------|-----------|
| User Favourite | +30 | Content in favourites |
| Coach Insight (direct ref) | +25 | `contentReference === content.id` |
| Effective Content | +20 | In effective list *(currently unused)* |
| Intensity Match | +15 | `structured_tags.intensityLevel` matches |
| Practice Priority Tag | +15/+5 | Onboarding tag match (full/decayed) |
| Coach Commitment (exact) | +15 | `target_practice_id === content.id` |
| Duration Match | +10 | Duration fits module spec |
| Focus Tag Match | +10 | Goal tags include module focus |
| Coach Commitment (keyword) | +10 | Commitment text matches content tags |
| Pressure Context Tag | +8/+3 | Onboarding tag match (full/decayed) |
| Not Completed Today | +5 | Recency boost |

### Calendar Event Scoring (max theoretical: ~108)
| Signal | Points |
|--------|--------|
| Immediacy (≤2h) | +40 |
| Scenario keyword | +25 |
| Organizer | +15 |
| Attendees > 5 | +10 |
| Non-recurring | +10 |
| Duration > 60 min | +8 |
| Prime hours | +5 |
| Back-to-back | +5 |
| Skip penalty | -15 |
