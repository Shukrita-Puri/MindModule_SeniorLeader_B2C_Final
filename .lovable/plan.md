

# Insights & Feature Pages Refinement + Executive Scenario Expansion

## Overview

This plan addresses:
1. **More "Pre" Executive Scenarios** - Proactive self-mastery focus for senior executives
2. **Consistent Feature Page Layout** - Match Recalibrate Studio intro text pattern across Insights, Coach, and Daily Check-in
3. **Remove Coach Visual from Insights** - Replace with consistent header layout
4. **Add Coach Visual to Executive Homepage** - Show when coach is in the Performance Plan
5. **Plan Context Labels** - Show source/reasoning for recommendations

---

## Part 1: Expanded "Pre" Executive Scenarios

### Current Scenarios (7 total)
- Pre-Board Meeting
- Pre-Investor Meeting
- High Cognitive Load Day
- Post-Tough Day Recovery
- Recovery Day
- Quarterly Review Prep
- Difficult Conversation Prep

### New "Pre" Scenarios to Add (8 additional)

| Scenario | Trigger Keywords | Hours Ahead | Modules |
|----------|-----------------|-------------|---------|
| **Pre-Strategic Planning** | "strategy", "strategic planning", "offsite" | 24h | Align + Prepare |
| **Pre-Negotiations** | "negotiation", "contract", "deal" | 12h | Regulate + Prepare |
| **Pre-All Hands** | "all hands", "town hall", "company meeting" | 4h | Regulate + Align |
| **Pre-Media/PR** | "interview", "podcast", "media", "press" | 6h | Regulate + Align + Prepare |
| **Pre-Crisis Response** | "crisis", "urgent", "emergency" | 2h | Regulate (priority 10) |
| **Pre-Hiring Decision** | "final round", "hiring committee", "offer" | 4h | Align + Prepare |
| **Pre-Client Presentation** | "client", "demo", "proposal" | 8h | Align + Prepare |
| **Pre-Budget/Finance Review** | "budget", "finance review", "forecast" | 24h | Align + Prepare |

### Implementation in `performancePlanEngine.ts`

Add to `EXECUTIVE_SCENARIOS` array:

```ts
{
  id: 'pre-strategic-planning',
  name: 'Pre-Strategic Planning',
  contextLabel: 'Strategy Session Prep',
  triggers: { 
    calendarKeywords: ['strategy', 'strategic planning', 'offsite', 'vision'], 
    hoursAhead: 24 
  },
  modules: [
    { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'clarity' },
    { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  ]
},
{
  id: 'pre-negotiations',
  name: 'Pre-Negotiations',
  contextLabel: 'Negotiation Prep',
  triggers: { 
    calendarKeywords: ['negotiation', 'contract', 'deal', 'terms'], 
    hoursAhead: 12 
  },
  modules: [
    { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' },
    { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'composure' }
  ]
},
{
  id: 'pre-all-hands',
  name: 'Pre-All Hands',
  contextLabel: 'Company Meeting Prep',
  triggers: { 
    calendarKeywords: ['all hands', 'town hall', 'company meeting', 'team meeting'], 
    hoursAhead: 4 
  },
  modules: [
    { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  ]
},
{
  id: 'pre-media',
  name: 'Pre-Media/Interview',
  contextLabel: 'Media Appearance Prep',
  triggers: { 
    calendarKeywords: ['interview', 'podcast', 'media', 'press', 'journalist'], 
    hoursAhead: 6 
  },
  modules: [
    { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' },
    { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' },
    { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  ]
},
{
  id: 'pre-crisis-response',
  name: 'Pre-Crisis Response',
  contextLabel: 'Crisis Preparation',
  triggers: { 
    calendarKeywords: ['crisis', 'urgent', 'emergency', 'incident'], 
    hoursAhead: 2 
  },
  modules: [
    { type: 'regulate', required: true, priority: 10, intensity: 'gentle', duration: 'micro', focus: 'composure' }
  ]
},
{
  id: 'pre-hiring-decision',
  name: 'Pre-Hiring Decision',
  contextLabel: 'Hiring Review Prep',
  triggers: { 
    calendarKeywords: ['final round', 'hiring committee', 'offer discussion', 'candidate review'], 
    hoursAhead: 4 
  },
  modules: [
    { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'clarity' },
    { type: 'prepare', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'clarity' }
  ]
},
{
  id: 'pre-client-presentation',
  name: 'Pre-Client Presentation',
  contextLabel: 'Client Meeting Prep',
  triggers: { 
    calendarKeywords: ['client', 'demo', 'proposal', 'customer'], 
    hoursAhead: 8 
  },
  modules: [
    { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' },
    { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  ]
},
{
  id: 'pre-budget-review',
  name: 'Pre-Budget/Finance Review',
  contextLabel: 'Finance Review Prep',
  triggers: { 
    calendarKeywords: ['budget', 'finance review', 'forecast', 'financial planning'], 
    hoursAhead: 24 
  },
  modules: [
    { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'clarity' },
    { type: 'prepare', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'clarity' }
  ]
}
```

---

## Part 2: Consistent Feature Page Layout

### Reference: Recalibrate Studio Layout

```text
+--------------------------------------------------+
| [Navigation]                                      |
+--------------------------------------------------+
|                                                  |
|           Recalibrate Studio                     |  <- text-5xl font-headline
|                                                  |
|    Reset. Restore. Refocus. — Master Your        |  <- text-lg font-subheadline italic
|              Mental Edge                         |
|                                                  |
|   Curated Sonic Library, Guided Sessions and     |  <- text-sm text-muted-foreground
|   Micro Exercises, crafted from centuries...     |
|                                                  |
+--------------------------------------------------+
```

### Pages to Update with This Pattern

#### 1. Insights Page (`src/pages/Insights.tsx`)

**Remove:** Coach visual header (lines 658-672)

**Add:** Typography-based hero matching Recalibrate Studio:

```tsx
{/* Hero Banner - matching Recalibrate Studio */}
<div className="relative h-auto py-8 overflow-hidden">
  <div className="relative h-full flex flex-col items-center justify-center px-4 text-center z-10 space-y-3">
    <h1 className="text-5xl font-headline mb-2 text-foreground tracking-tight">
      Your Inner World
    </h1>
    <p className="text-lg font-subheadline italic text-muted-foreground">
      Patterns. Progress. Presence.
    </p>
    <p className="text-sm text-muted-foreground max-w-3xl mx-auto leading-relaxed">
      Your longitudinal view of mental fitness development — tracking states, wins, and inner patterns over time.
    </p>
  </div>
</div>
```

#### 2. Self Mastery Coach Empty State (`src/components/coach/CoachSplitView.tsx`)

**Current:** Full-bleed cinematic background with greeting

**Update:** Add hero text overlay matching the pattern (while keeping the visual background):

The Coach already has a visual background which works well. We'll add the title text pattern as an overlay in the greeting area to match the style:

```tsx
{/* Empty state - Hero text before greeting */}
<div className="text-center mb-6">
  <h1 className="text-4xl font-headline text-white tracking-tight drop-shadow-lg">
    Self Mastery Coach
  </h1>
  <p className="text-base font-subheadline italic text-white/80 mt-1">
    Inner Awareness. Presence. Growth.
  </p>
</div>
```

#### 3. Daily Check-In (`src/pages/DailyCheckIn.tsx`)

**Current:** Simple "How are you feeling right now?" header

**Update:** Add hero section matching pattern:

```tsx
{/* Hero Banner */}
<div className="relative h-auto py-6 overflow-hidden mb-4">
  <div className="relative h-full flex flex-col items-center justify-center px-4 text-center z-10 space-y-2">
    <h1 className="text-4xl font-headline text-foreground tracking-tight">
      Daily Check-In
    </h1>
    <p className="text-base font-subheadline italic text-muted-foreground">
      Awareness First. Action Follows.
    </p>
    <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
      A moment to check your inner state — guiding today's performance plan.
    </p>
  </div>
</div>
```

---

## Part 3: Coach Visual on Executive Homepage

### Requirement
Show the coach visual in the Performance Plan carousel when coach (Prepare/Integrate) is one of the recommended modules.

### Current State
Coach cards in `DailyRitual.tsx` show an "SM Coach" monogram on a gradient background (lines 640-656).

### Update
Replace the monogram with the actual coach visual image for stronger visual presence:

```tsx
{/* Coach Card Thumbnail - Use actual coach visual */}
{isCoach ? (
  <div className="w-32 h-full flex-shrink-0 relative overflow-hidden">
    <img 
      src={coachVisual}
      alt=""
      className="w-full h-full object-cover object-top brightness-75"
    />
    {/* Gradient overlay for depth */}
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/30" />
    
    {/* SM Monogram overlay */}
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <span className="text-3xl font-headline text-white tracking-tight leading-none drop-shadow-lg">SM</span>
      <span className="text-[8px] uppercase tracking-[0.15em] text-white/80 mt-0.5">Coach</span>
    </div>
    
    {/* Part of Today's Plan badge */}
    <div className="absolute top-2 right-2 bg-saffron/90 text-charcoal text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full shadow-sm">
      Today's Plan
    </div>
  </div>
) : (
  // ... existing thumbnail code
)}
```

**Import Required:**
```tsx
import coachVisual from '@/assets/coach-visual.jpeg';
```

---

## Part 4: Plan Context Labels

### Current State
`DailyRitual.tsx` has `planContext` state but doesn't display it prominently.

### Update
Add context badge/label above the Performance Plan carousel:

```tsx
{/* Plan Context Label */}
{planContext.source !== 'checkin' && (
  <div className="px-4 max-w-lg mx-auto mb-2">
    <div className="flex items-center gap-2">
      {planContext.source === 'executive-scenario' && (
        <>
          <span className="px-2 py-0.5 bg-saffron/15 text-saffron rounded-full text-[10px] font-medium uppercase tracking-wider">
            {planContext.scenarioName || 'Scenario'}
          </span>
          {planContext.description && (
            <span className="text-xs text-muted-foreground">{planContext.description}</span>
          )}
        </>
      )}
      {planContext.source === 'jit-calendar' && (
        <>
          <span className="px-2 py-0.5 bg-amber-500/15 text-amber-600 rounded-full text-[10px] font-medium uppercase tracking-wider">
            JIT
          </span>
          {planContext.description && (
            <span className="text-xs text-muted-foreground">{planContext.description}</span>
          )}
        </>
      )}
      {planContext.source === 'routine-morning' && (
        <span className="text-xs text-muted-foreground">Morning Performance Routine</span>
      )}
      {planContext.source === 'routine-evening' && (
        <span className="text-xs text-muted-foreground">Evening Integration Routine</span>
      )}
    </div>
  </div>
)}

{/* Default context for check-in based plans */}
{planContext.source === 'checkin' && recommendations.length > 0 && (
  <div className="px-4 max-w-lg mx-auto mb-2">
    <span className="text-xs text-muted-foreground">Based on your check-in, calendar, and time of day</span>
  </div>
)}
```

### Wire Up Executive Scenario Detection

In `loadRecommendations()`, after building the context, detect scenarios and update `planContext`:

```tsx
// 7b. Check for executive scenarios
const scenario = detectExecutiveScenario(context);
if (scenario) {
  setPlanContext({
    source: 'executive-scenario',
    scenarioName: scenario.contextLabel,
    description: `Detected: ${scenario.name}`
  });
} else if (getTimeOfDay() === 'morning' && !energyState.checkInOutcome) {
  setPlanContext({ source: 'routine-morning' });
} else if (getTimeOfDay() === 'evening') {
  setPlanContext({ source: 'routine-evening' });
} else {
  setPlanContext({ source: 'checkin' });
}
```

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `src/utils/performancePlanEngine.ts` | Add 8 new "Pre" executive scenarios |
| `src/pages/Insights.tsx` | Remove coach visual, add typography-based hero matching Recalibrate Studio |
| `src/components/coach/CoachSplitView.tsx` | Add hero title text in empty state (keeping visual background) |
| `src/pages/DailyCheckIn.tsx` | Add hero section with title/subtitle/description |
| `src/components/home/DailyRitual.tsx` | Add coach visual to coach cards, add plan context labels |

---

## Visual Consistency Summary

| Page | Title | Subtitle (italic) | Description |
|------|-------|-------------------|-------------|
| Recalibrate Studio | "Recalibrate Studio" | "Reset. Restore. Refocus. — Master Your Mental Edge" | Curated Sonic Library... |
| Your Inner World | "Your Inner World" | "Patterns. Progress. Presence." | Your longitudinal view of mental fitness... |
| Self Mastery Coach | "Self Mastery Coach" | "Inner Awareness. Presence. Growth." | (keeps visual context) |
| Daily Check-In | "Daily Check-In" | "Awareness First. Action Follows." | A moment to check your inner state... |

---

## Expected Outcomes

1. **Proactive Self-Mastery**: 15 executive scenarios (8 new "Pre" scenarios) covering common senior leader situations
2. **Visual Consistency**: All feature pages share the same typography-based hero pattern
3. **Coach Visual Integration**: Executive Homepage shows coach portrait when coach is in the plan
4. **Context Clarity**: Users understand why specific recommendations were made (JIT, scenario, routine, or check-in based)
5. **Professional Polish**: Consistent branding signals a cohesive product experience

