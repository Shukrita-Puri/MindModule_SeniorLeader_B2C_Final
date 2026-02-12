

# Implementation Plan: Post-Event Micro-Reflection + JIT Integration

## Overview
This plan integrates three interconnected features:
1. **Post-Event Micro-Reflection** - 2-tap behavior logging after high-stakes calendar events
2. **JIT as Separate Carousel** - Move JIT from a standalone section into its own carousel below the Performance Plan
3. **Database Schema** - Support the memory system with 3 new tables + 2 new columns on `daily_checkins`

---

## Part 1: Database Migrations

### 1A. New Tables (3 migrations required)

**Table: `jit_preferences`**
- Tracks user skips and completions of JIT events
- Enables "show me less" learning in `detectIntervention()` logic
- Columns: `id, user_id, event_type, action, event_title, created_at`
- RLS: Users can only CRUD their own records

**Table: `behavior_logs`**
- Captures post-event behavior reflection (how user showed up)
- Links to calendar events via `context_event_id`
- Stores energy level after event
- Used by Coach and Insights to build behavioral memory
- Columns: `id, user_id, context_event_id, event_title, behavior_type, control_level, energy_after, created_at`
- RLS: Users can only CRUD their own records

**Table: `calendar_event_classifications`**
- Persists auto-detected classifications from `HIGH_STAKES_KEYWORDS`
- Enables pattern analysis in Insights without re-scanning calendar every time
- Columns: `id, user_id, calendar_event_id, event_type, stakes_level, classified_by, created_at`
- RLS: Users can only CRUD their own records

### 1B. Schema Updates on Existing Tables

**Add to `daily_checkins`:**
- `clarity_level` (integer, nullable, 1-5)
- `confidence_level` (integer, nullable, 1-5)

---

## Part 2: JIT Carousel Refactoring

### 2A. Architecture Change

**Current state:**
- `JustInTimeIntervention` renders as a single card section below `DailyRitual`
- Takes up full width, positioned after the carousel

**New state:**
- JIT becomes its own carousel section with event-specific cards
- Two separate carousels on the page:
  1. **Morning Performance Plan Carousel** - Regulate, Align, Prepare, Integrate (unchanged)
  2. **JIT Preparation Carousel** - Only renders when JIT is active; shows event-specific prep cards

**Visual hierarchy:**
```
[Hero Section]
[Today's State Card]
[Strategic Intention Card]
"Today's Performance Plan" header
[Morning Performance Plan Carousel]
[Action Button: Start/Continue]
--- Optional Section (only when JIT active) ---
"Prepare Now" header
[JIT Carousel with Event Cards]
[PrivacyFooter]
```

### 2B. JIT Card Design

Each JIT carousel card displays:
1. **Event name** (prominent, e.g., "Board Meeting")
2. **Event classification pill** (saffron background, e.g., "High Stakes" or "Pre-Presentation")
3. **Minutes until event** (e.g., "in 25 min")
4. **"Prepare Now" badge** (saffron pill to differentiate from routine modules)
5. **Skip button** (X icon, top-right)
6. **Practice recommendations** (1-2 quick practices for regulation/alignment)

### 2C. Skip/Show Less Logic

When user clicks **Skip** on a JIT card:
1. Save to `jit_preferences` table: `{ user_id, event_type, action: 'skipped', event_title, created_at }`
2. Remove card from local carousel state immediately
3. Modify `detectIntervention()` to query skips: if 3+ skips for same `event_type` in last 30 days, deprioritize that type

---

## Part 3: Post-Event Micro-Reflection Component

### 3A. New Component: `PostEventReflection.tsx`

**Location:** `src/components/home/PostEventReflection.tsx`

**Detection Logic:**
1. Query today's calendar events from `calendar_events` table
2. Filter for events with `stakes_level = 'high'` (via `calendar_event_classifications`)
3. Check if event `end_time` is within last 2 hours
4. Skip if `behavior_logs` entry already exists for that event (don't re-ask)

**UI Flow:**

**Step 1: Behavior Reflection**
- Header: "Your [Board Meeting] just ended"
- Three pill buttons:
  - "Avoided" → stores `behavior_type: 'avoided'`
  - "Confronted" → stores `behavior_type: 'confronted'`
  - "Listened" → stores `behavior_type: 'listened'`
- Optional description field (textarea, optional, for narrative capture)

**Step 2: Energy Assessment**
- After Step 1 tap, transition to Step 2
- Header: "How's your energy now?"
- Three pill buttons:
  - "Drained" → stores `energy_after: 'down'`
  - "Same" → stores `energy_after: 'same'`
  - "Energized" → stores `energy_after: 'up'`

**Data Saved:**
```typescript
{
  user_id: string,
  context_event_id: UUID (from calendar_events),
  event_title: string,
  behavior_type: 'avoided' | 'confronted' | 'listened',
  control_level: null (optional field for future),
  energy_after: 'down' | 'same' | 'up',
  created_at: now
}
```

### 3B. Coach Integration

**After behavior_logs save:**
1. Create a `user_coach_insights` entry with:
   - `source: 'post_event_reflection'`
   - `insight_type: 'behavior_pattern'`
   - `insight_content: "[Event Title] - You [behavior_type] and felt [energy_after]"`
   - `confidence_score: 0.85`

2. Navigate to Coach with contextual flow:
```typescript
navigate('/coach', {
  state: {
    flowType: 'guided-reflection',
    initialPrompt: `You just came out of "${eventTitle}". You said you [${behaviorType}] and feel [${energyLevel}]. Let's process that together. What was the moment where you made that choice?`,
    eventTitle,
    behaviorType,
    energyLevel,
    sourceFlow: 'post_event_reflection'
  }
});
```

---

## Part 4: Integration into DailyRitual & ExecutiveHome

### 4A. DailyRitual Changes

**Changes to `src/components/home/DailyRitual.tsx`:**
1. Import `PostEventReflection` component
2. Import JIT detection logic from `JustInTimeIntervention` (export it)
3. Add a check in the render: "Is there a post-event reflection to show?"
4. If yes, inject `<PostEventReflection />` card into the carousel **as the first card** or **as a standalone card before carousel**

**Alternatively:**
- Keep `PostEventReflection` separate and position it in `ExecutiveHome` between Performance Plan carousel and JIT carousel

### 4B. ExecutiveHome Changes

**Changes to `src/pages/ExecutiveHome.tsx`:**
1. Keep `DailyRitual` as-is (renders morning Performance Plan)
2. Move `JustInTimeIntervention` render into a new **JIT Carousel Section**:
   - Only renders if JIT has active interventions
   - New section header: "Prepare Now"
   - Refactored to use Carousel component instead of single card
   - Positioned after DailyRitual and action button

3. Add `PostEventReflection` import
4. Render `PostEventReflection` in a dedicated position (before JIT carousel or inside JIT carousel as first item)

---

## Part 5: File Changes Summary

### New Files (1):
- `src/components/home/PostEventReflection.tsx` - Complete micro-reflection UI + data save logic

### Modified Files (5):

1. **`src/components/home/JustInTimeIntervention.tsx`**
   - Export `detectIntervention` function and `InterventionData` type
   - Export `isHighStakesEvent` helper
   - Add skip persistence logic to write to `jit_preferences`
   - Modify `detectIntervention()` to query `jit_preferences` and deprioritize skipped event types
   - Modify render to output carousel-compatible card format (optional, or keep as-is and wrap in parent)

2. **`src/components/home/DailyRitual.tsx`**
   - No major changes needed initially (PostEventReflection handled separately in ExecutiveHome)
   - Optional: Import and conditionally render `PostEventReflection` if needed in carousel

3. **`src/pages/ExecutiveHome.tsx`**
   - Remove current `<JustInTimeIntervention />` section
   - Add new **JIT Carousel Section** below DailyRitual with its own Carousel wrapper
   - Import and render `PostEventReflection` (positioned strategically)
   - Add conditional rendering: only show JIT section if `intervention` exists

4. **`src/utils/dailyCheckins.ts`**
   - Update `saveCheckin` function to accept `clarity_level` and `confidence_level` parameters
   - Update database upsert to include these new columns

5. **`src/utils/performancePlanEngine.ts`** (optional enhancement)
   - Update coach prompt generation to include post-event reflection flow
   - Add integration point for behavior logs to influence future plan recommendations

### Database Migrations (3):
- Create `jit_preferences` table
- Create `behavior_logs` table
- Create `calendar_event_classifications` table
- Alter `daily_checkins` to add `clarity_level` and `confidence_level` columns

---

## Part 6: Implementation Sequence

1. **Database**: Execute 3 table migrations + alter `daily_checkins`
2. **PostEventReflection**: Create new component with full UI + data save logic
3. **JIT Refactoring**: 
   - Export detection logic from `JustInTimeIntervention`
   - Add skip persistence
   - Prepare carousel-ready card format
4. **ExecutiveHome**: Restructure sections, remove old JIT, add new JIT carousel + PostEventReflection
5. **DailyCheckins**: Update save function for new optional fields
6. **Testing**: Verify:
   - JIT carousel renders when intervention detected
   - Skip button persists to DB and deprioritizes future triggers
   - PostEventReflection appears 2 hours after high-stakes event
   - Coach receives context from behavior logs
   - Both carousels render independently on homepage

---

## Key Design Decisions

1. **Separate Carousels**: Morning plan and JIT are distinct visual sections to emphasize that JIT is reactive/urgent prep, not part of the core ritual sequence

2. **Post-Event Position**: Place `PostEventReflection` either as first item in JIT carousel OR in its own section above JIT, so it captures the immediate post-event window

3. **Coach Integration**: Automatically navigate to Coach after behavior log save to enable "dig deeper" immediately while the event is fresh

4. **Skip Tracking**: Uses simple count logic (3+ skips = deprioritize) rather than complex ML, keeping it predictable and transparent

5. **No Breaking Changes**: Existing DailyRitual and Performance Plan logic remains untouched; new features are additive

