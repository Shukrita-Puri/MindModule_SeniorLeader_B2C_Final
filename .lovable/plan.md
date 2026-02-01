
# Insights Page Comprehensive Refinement

## Overview

This plan addresses multiple issues with the Insights page and related systems, including:
1. Today's tiny wins not being recorded/displayed
2. Performance Plan showing "Completed" after re-check-in
3. Missing SM Coach visual on executive homepage page- where today's performance plan shows the different modules.
4. JIT contextual recommendations with scenario-based plans
5. Clickable tiny wins bubbles with insights (Mindsera-style)
6. Connected Mind Map patterns visualization
7. Missing practices tracking
8. State Patterns hiding
9. Additional executive-relevant insights

---

## Part 1: Bug Fixes

### Issue 1.1: Today's Tiny Wins Not Recording

**Current State:** The tiny wins query shows entries only from January 26, 2026 - no wins for today (Feb 1).

**Root Cause:** Tiny wins are captured via the Coach "Integrate" flow, which extracts wins from conversation. If the user didn't complete an Integrate session today or the extraction didn't run, no win was recorded.

**Solution:**
- Review the `extract-coach-insights` edge function to ensure win detection runs on every coach session
- Add a manual "Capture Win" option outside of coach flow for quick logging
- Ensure the Insights page refreshes data after coach sessions complete

**Files to Modify:**
- `supabase/functions/self-mastery-coach/index.ts` - Add win extraction trigger
- `src/pages/Insights.tsx` - Add refresh trigger and fallback messaging

---

### Issue 1.2: Performance Plan "Completed" After Re-Check-in

**Current State:** Database shows `completion_status: full` for today with only 1 practice completed (`harmonic-calm`) but 3 recommended.

**Root Cause:** The ritual was marked "full" prematurely. When user checks in again, the system generates a NEW plan but doesn't reset the completion status.

**Solution:**
```tsx
// In DailyRitual.tsx loadRecommendations()
if (checkinTime > ritualTime) {
  console.log('Check-in is newer than stored plan - regenerating');
  shouldRegenerate = true;
  
  // CRITICAL: Also reset completion status
  await upsertRitual({
    ritual_date: today,
    completion_status: 'partial', // Reset to partial
    completed_practice_ids: [], // Clear completed IDs
    soundscape_completed: false,
    guided_practice_completed: false,
    micro_exercise_completed: false
  });
}
```

**Button Label Logic:**
- If `completion_status === 'full'` but new check-in happened: Show "Start Your Performance Plan"
- Only show "Completed" if plan was fully completed AFTER current check-in

**Files to Modify:**
- `src/components/home/DailyRitual.tsx` - Reset ritual status on re-check-in

---

### Issue 1.3: Practices Completed Not Tracking

**Current State:** `sanctuary_events` table is empty - no practice completions being logged.

**Root Cause:** Practice players need to log completion events to `sanctuary_events` with `event_type: 'completed'`.

**Solution:** Verify and fix practice completion tracking in:
- `SoundscapePlayer.tsx`
- `GuidedPracticePlayer.tsx`
- `MicroPracticeCards.tsx`

Each should call a `logPracticeCompletion()` function that inserts into `sanctuary_events`.

**Files to Modify:**
- `src/pages/SoundscapePlayer.tsx`
- `src/pages/GuidedPracticePlayer.tsx`
- `src/pages/MicroPracticeCards.tsx`
- Create: `src/utils/practiceCompletionTracker.ts`

---

### Issue 1.4: Typical State This Week Tracking

**Current State:** Shows correctly based on `statePatterns.distribution` data. Working as expected.

**Verification:** Today's check-in (scattered) is recorded. The Typical State card pulls from `fetchStatePatterns()` which queries `daily_checkins`.

---

## Part 2: UI/UX Improvements

### Issue 2.1: Add SM Coach Visual to Insights Page

**Current Implementation:** The Executive Home shows the SM coach visual in the StrategicIntentionCard area.

**Solution:** Add the coach visual as a header element on Insights page for brand consistency.

```tsx
// In Insights.tsx header section
import coachVisual from '@/assets/coach-visual.jpeg';

// Add after FloatingNavigation
<div className="relative w-full h-32 overflow-hidden rounded-xl mb-6">
  <img 
    src={coachVisual} 
    alt="" 
    className="w-full h-full object-cover object-top opacity-60"
  />
  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
  <div className="absolute bottom-4 left-4">
    <h1 className="text-2xl font-headline text-foreground">Your Inner World</h1>
    <p className="text-sm text-muted-foreground">Past 7 days</p>
  </div>
</div>
```

**Files to Modify:**
- `src/pages/Insights.tsx`

---

### Issue 2.2: Hide State Patterns Section

**Solution:** Wrap the State Patterns card in a conditional or remove entirely (per user request).

```tsx
// Remove or comment out lines 703-779 in Insights.tsx
// The "Your State Patterns" LuxuryInsightCard section
```

**Files to Modify:**
- `src/pages/Insights.tsx`

---

### Issue 2.3: Clickable Tiny Wins Bubbles with Insights (Mindsera-style)

**Reference:** Mindsera shows bubbles that, when clicked, reveal a summary/insight panel.

**Implementation:**

```tsx
// New component: ClickableDimensionBubble
interface BubbleInsight {
  dimension: string;
  value: string;
  count: number;
  summary: string; // AI-generated insight
  relatedWins: Array<{ content: string; date: string }>;
}

// Wrap bubbles in Popover with:
// - Summary text: "Your wins often reflect {dimension}. This suggests..."
// - 2-3 recent win snippets that contributed to this bubble
// - "Explore with Coach" button if applicable
```

**Visual Design:**
```text
+--------------------------------------+
| [Bubble clicked: "Pride"]            |
+--------------------------------------+
| You frequently capture moments of    |
| pride and accomplishment. This       |
| reflects strong self-recognition.    |
|                                      |
| Recent wins with this theme:         |
| - "Managed to get traction from..."  |
| - "I noticed things moved and..."    |
|                                      |
| [Explore with Coach]                 |
+--------------------------------------+
```

**Files to Modify:**
- `src/components/insights/PsychologicalDimensionBubbles.tsx` - Add click handling and Popover

---

### Issue 2.4: Connected Mind Map Patterns (Mindsera-style)

**Reference:** Mindsera shows thought patterns as connected nodes with lines showing relationships.

**Current State:** `InnerWorldBubbles.tsx` already has `relationships` prop and draws SVG connection lines. The issue is that `themeRelationships` is often empty.

**Solution:** Enhance the semantic analysis to generate theme relationships:

```ts
// In fetchSemanticAnalysis (DEV_MODE section) or edge function
// Generate relationships based on co-occurrence in same content
const themeRelationships = [];
const themeContent = new Map<string, Set<string>>(); // theme -> content IDs

// For each pair of themes that appear in same content, create a relationship
for (const [theme1, contents1] of themeContent) {
  for (const [theme2, contents2] of themeContent) {
    if (theme1 < theme2) {
      const overlap = [...contents1].filter(c => contents2.has(c)).length;
      if (overlap > 0) {
        themeRelationships.push({
          from: theme1,
          to: theme2,
          strength: Math.min(overlap / 3, 1) // Normalize 0-1
        });
      }
    }
  }
}
```

**Visual Enhancement:**
- Add descriptive labels on hover/click for connections
- Show "Connected themes" subtitle

**Files to Modify:**
- `src/pages/Insights.tsx` - Enhance fetchSemanticAnalysis
- `src/components/insights/InnerWorldBubbles.tsx` - Improve connection rendering

---

## Part 3: Performance Plan Contextual Recommendations

### Issue 3.1: Show Context Source for Recommendations

**Requirement:** If plan is JIT-triggered, show context (e.g., "Board meeting tomorrow"). If it's a generic morning/evening plan, show that context.

**Implementation:**

```tsx
// New interface in DailyRitual.tsx
interface PlanContext {
  source: 'checkin' | 'jit-calendar' | 'jit-wearable' | 'jit-pattern' | 'routine-morning' | 'routine-evening';
  description?: string; // e.g., "Board Meeting in 2 days"
  eventDate?: string;
}

// Display in UI:
<div className="flex items-center gap-2 mb-3">
  <span className="text-xs font-medium text-muted-foreground">
    {planContext.source === 'jit-calendar' && (
      <>
        <span className="px-2 py-0.5 bg-saffron/10 text-saffron rounded-full text-[10px] mr-2">
          JIT
        </span>
        {planContext.description}
      </>
    )}
    {planContext.source === 'routine-morning' && "Morning Performance Plan"}
    {planContext.source === 'routine-evening' && "Evening Integration Plan"}
    {planContext.source === 'checkin' && "Based on your check-in, calendar, and time of day"}
  </span>
</div>
```

**Files to Modify:**
- `src/components/home/DailyRitual.tsx`

---

### Issue 3.2: Executive Scenario-Based Plans

**New Scenarios to Support:**

| Scenario | Trigger | Plan Components |
|----------|---------|-----------------|
| Pre-Board Meeting | Calendar: "Board" keyword + 24h window | Regulate (calming) + Align (confidence) + Prepare (mental rehearsal) |
| High-Pressure Event | Calendar: "Investor", "Keynote" + 24h | Regulate + Prepare (coach for visualization) |
| High Cognitive Load Day | 4+ back-to-back meetings | Regulate (micro) + Align (focus) |
| Post-Tough Day | Evening + low check-in | Regulate (release) + Integrate (reflection) |
| Recovery Day | Low wearable readiness | Regulate (gentle) only - minimal load |
| Quarterly Review Prep | Calendar: "Quarterly", "Review" | Align (confidence) + Prepare (visualization) |

**Implementation in `performancePlanEngine.ts`:**

```ts
interface ScenarioPlan {
  id: string;
  name: string;
  triggers: {
    calendarKeywords?: string[];
    hoursAhead?: number;
    wearableCondition?: 'low_readiness' | 'elevated_stress';
    checkInPattern?: 'consecutive-low';
  };
  modules: ModuleSpec[];
  contextLabel: string;
}

const EXECUTIVE_SCENARIOS: ScenarioPlan[] = [
  {
    id: 'pre-board-meeting',
    name: 'Pre-Board Meeting',
    triggers: { calendarKeywords: ['board'], hoursAhead: 24 },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'composure' },
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'rehearsal' }
    ],
    contextLabel: 'Board Meeting Prep'
  },
  // ... more scenarios
];
```

**Files to Modify:**
- `src/utils/performancePlanEngine.ts` - Add scenario detection
- `src/components/home/DailyRitual.tsx` - Display scenario context
- `src/components/home/JustInTimeIntervention.tsx` - Link to scenarios

---

### Issue 3.3: Wearable Data Integration Status

**Current State:** Already incorporated:
- `computeEnergyState()` in `energyStateEngine.ts` fetches Oura data
- `JustInTimeIntervention.tsx` checks `oura_daily_data` for stress indicators
- `historicalPatternEngine.ts` supports HRV pattern detection

**Confirmation:** Wearable data IS being used for:
- Energy state computation
- JIT stress triggers
- Historical pattern analysis

---

## Part 4: Additional Executive Insights

### Missing Insights for Senior Leaders

| Insight Type | Description | Implementation |
|--------------|-------------|----------------|
| Decision Quality Tracker | Track when decisions were made under what state | Link check-in state to calendar events marked as "decisions" |
| Meeting Energy Cost | Calculate energy delta before/after meeting-heavy days | Compare check-in scores on high vs low meeting days |
| Recovery Velocity | How quickly user returns to "steady" after "overwhelmed" | Track state transitions over time |
| Optimal Performance Windows | When user reports "focused" most often | Aggregate check-in times by hour |
| Intervention Effectiveness | Which practices led to state improvements | Track state before/after practice completion |

**Priority Implementation:** Add "Your Energy Rhythm" enhancement to show optimal windows.

**Files to Create/Modify:**
- `src/components/insights/DecisionQualityTracker.tsx` (new)
- `src/components/insights/EnergyRhythm.tsx` (enhance)

---

## Part 5: Real-Time Data Recording Speed

**User Question:** "How quickly can the system record and analyze with all the historical data?"

**Answer:**
- **Recording:** Immediate (< 500ms) - Direct Supabase insert on action completion
- **Analysis:** Near real-time for basic queries (< 2s), batch for AI analysis
- **Insights Refresh:** Page-level polling every 30-60 seconds, or on navigation

**Current Data Flow:**
1. User completes Coach session
2. Edge function extracts insights (1-3s)
3. Writes to `tiny_wins` / `user_coach_insights` tables
4. Insights page fetches on load (fresh data)

---

## Implementation Priority

1. **Critical Bugs (Immediate):**
   - Performance Plan completion reset on re-check-in
   - Practice completion tracking to `sanctuary_events`
   - Tiny wins not appearing (verification)

2. **UI Quick Wins (Same Session):**
   - Hide State Patterns section
   - Add SM Coach visual to Insights
   - Add context labels to Performance Plan

3. **Feature Enhancements (Next Session):**
   - Clickable dimension bubbles with insights
   - Connected Mind Map relationships
   - Executive scenario plans
   - Additional executive insights

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `src/components/home/DailyRitual.tsx` | Reset ritual on re-check-in, add context labels |
| `src/pages/Insights.tsx` | Add coach visual, hide State Patterns, enhance semantic analysis |
| `src/components/insights/PsychologicalDimensionBubbles.tsx` | Add click handling and insight popover |
| `src/components/insights/InnerWorldBubbles.tsx` | Enhance connection rendering |
| `src/utils/performancePlanEngine.ts` | Add executive scenario detection |
| `src/pages/SoundscapePlayer.tsx` | Verify/fix completion tracking |
| `src/pages/GuidedPracticePlayer.tsx` | Verify/fix completion tracking |
| `src/pages/MicroPracticeCards.tsx` | Verify/fix completion tracking |
| `src/utils/practiceCompletionTracker.ts` (new) | Unified completion logging |

