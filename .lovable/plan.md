

# Comprehensive Fix: Performance Plan Stability + Coach UI + Insights Enhancements

## Overview

This plan addresses multiple issues:
1. **Performance Plan fluctuating on refresh** - Root cause analysis and fix
2. **Coach greeting text positioning** - Move below hero text
3. **Clickable Tiny Wins bubbles** - Already implemented, verify working
4. **Connected Mind Map patterns** - Already implemented, verify relationships generating
5. **Plan context labels** - Already implemented, verify display

---

## Part 1: Performance Plan Stability Fix (CRITICAL)

### Root Cause Analysis

After investigating the code and database, the plan fluctuation has multiple potential causes:

1. **Timestamp Comparison Issue**: In `DailyRitual.tsx` line 268:
   ```tsx
   const ritualTime = new Date(todayRitual.created_at || todayRitual.ritual_date);
   ```
   The `created_at` from Supabase is `"2026-02-01 17:01:51.519151+00"` but this is compared against `todayCheckin.timestamp` which is `"2026-02-01 16:41:58.948303+00"`. Since the check-in (16:41) is OLDER than the ritual (17:01), the stored plan SHOULD be used - but something is still causing regeneration.

2. **Regeneration on Every Load**: Looking at the data:
   - `recommended_practice_ids: [deep-calm-forest-bathing, ikigai-purpose, coach-integrate]`
   - But the plan content may not be reconstructing correctly from these IDs.

3. **The upsertRitual Updating created_at**: Each call to `upsertRitual` may be resetting the plan comparison baseline.

### Solution

**Fix 1: Use `updated_at` for comparison instead of `created_at`**

The `updated_at` field tracks when the ritual was last modified (including when recommendations were stored). We should compare against this to detect if a new check-in occurred AFTER the plan was stored.

```tsx
// In loadRecommendations() - line 268
const ritualTime = new Date(todayRitual.updated_at || todayRitual.created_at || todayRitual.ritual_date);
```

**Fix 2: Add explicit plan generation timestamp**

Store when the plan was generated separately from ritual row timestamps:

```tsx
// When storing the plan (line 384-389)
await upsertRitual({
  ritual_date: today,
  recommended_practice_ids: plan.map(r => r.content.id),
  recommended_practices_count: plan.length,
  // Add explicit plan generation timestamp
  plan_generated_at: new Date().toISOString()
});

// When checking (line 267-268)
const planGeneratedAt = todayRitual.plan_generated_at 
  ? new Date(todayRitual.plan_generated_at) 
  : new Date(todayRitual.updated_at || todayRitual.created_at || todayRitual.ritual_date);
```

**Fix 3: Prevent unnecessary regeneration by caching in session storage**

Add session-level caching to prevent regeneration within the same browser session:

```tsx
// At the start of loadRecommendations
const sessionPlanKey = `performancePlan-${new Date().toISOString().split('T')[0]}`;
const cachedPlan = sessionStorage.getItem(sessionPlanKey);

if (cachedPlan && !forceRegenerate) {
  const parsed = JSON.parse(cachedPlan);
  setRecommendations(parsed.recommendations);
  // ... restore state
  setLoading(false);
  return;
}

// After generating/loading plan
sessionStorage.setItem(sessionPlanKey, JSON.stringify({
  recommendations: plan,
  timestamp: Date.now()
}));
```

### Files to Modify
- `src/components/home/DailyRitual.tsx` - Fix timestamp comparison, add session caching

---

## Part 2: Coach Greeting Text Positioning

### Current State (from screenshot)
```
+----------------------------------+
| Self Mastery Coach               |
| Inner Awareness. Presence. Growth|
|                                  |
|           [SM monogram]          |
|           Hello, Dev             |
|  I'm your self-mastery coach...  |
+----------------------------------+
```

The greeting text is already below the hero text, but the user wants to ensure the greeting paragraph ("I'm your self-mastery coach. Share what's on your mind...") appears AFTER the hero section.

### Current Code (CoachSplitView.tsx lines 90-112)
```tsx
{/* Hero title section */}
<div className="pt-8 pb-4 px-6 text-center">
  <h1>Self Mastery Coach</h1>
  <p>Inner Awareness. Presence. Growth.</p>
</div>

{/* Centered greeting */}
<div className="flex-1 flex flex-col items-center justify-center">
  <div>[SM monogram]</div>
  <h2>Hello, {firstName}</h2>
  <p>{contextualGreeting}</p>  // This is the "I'm your self-mastery coach..." text
</div>
```

### Clarification Needed
The current structure already has the greeting below the hero. Looking at the screenshot, the layout appears correct. However, if the user wants the greeting text (`contextualGreeting`) to be positioned differently, we can:

1. Move the greeting paragraph from the monogram section to directly under the subtitle
2. Make the hero section include the greeting

### Proposed Change
Move the introductory greeting text to be part of the hero section, so it flows as:
- Title: "Self Mastery Coach"
- Subtitle: "Inner Awareness. Presence. Growth."
- Description: "I'm your self-mastery coach. Share what's on your mind..."
- Then the monogram + "Hello, {firstName}"

```tsx
{/* Hero title section - matching Recalibrate Studio pattern */}
<div className="pt-8 pb-4 px-6 text-center">
  <h1 className="text-4xl font-headline text-white tracking-tight drop-shadow-lg">
    Self Mastery Coach
  </h1>
  <p className="text-base font-subheadline italic text-white/80 mt-1">
    Inner Awareness. Presence. Growth.
  </p>
  <p className="text-sm text-white/70 mt-3 max-w-sm mx-auto leading-relaxed">
    I'm your self-mastery coach. Share what's on your mind, and let's explore it together.
  </p>
</div>

{/* Centered greeting - just name */}
<div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
  <div className="w-16 h-16 rounded-full...">SM</div>
  <h2 className="text-xl font-headline text-white mt-5">
    Hello, {firstName}
  </h2>
  {/* Removed contextualGreeting from here */}
</div>
```

### Files to Modify
- `src/components/coach/CoachSplitView.tsx` - Restructure greeting placement

---

## Part 3: Verify Clickable Tiny Wins Bubbles

### Current State
The `PsychologicalDimensionBubbles.tsx` component ALREADY has:
- Popover wrapping each bubble
- `DIMENSION_INSIGHTS` templates for each dimension
- "Explore with Coach" button
- Related wins display (when `relatedWins` prop is passed)

### Issue
The `relatedWins` prop may not be passed from `Insights.tsx`. Let me verify:

Looking at Insights.tsx, the component is rendered without the `relatedWins` prop being connected to actual data.

### Solution
Enhance the Insights.tsx to pass related wins data:

```tsx
// In Insights.tsx, when rendering PsychologicalDimensionBubbles
<PsychologicalDimensionBubbles
  data={tinyWinsInsights.dimensions?.map(d => ({
    dimension: d.dimension as DimensionData['dimension'],
    value: d.value,
    count: d.count
  })) || []}
  relatedWins={/* Need to fetch and pass related wins here */}
/>
```

### Files to Modify
- `src/pages/Insights.tsx` - Pass related wins data to dimension bubbles

---

## Part 4: Verify Connected Mind Map Relationships

### Current State
The `fetchSemanticAnalysis` function in `Insights.tsx` (lines 525-560) ALREADY generates theme relationships:

```tsx
// Generate theme relationships based on co-occurrence
const themeRelationships: { from: string; to: string; strength: number }[] = [];
// ... calculation logic
```

And `InnerWorldBubbles.tsx` ALREADY renders connection lines (lines 193-211).

### Verification Needed
Check if relationships are being generated and passed correctly. The DB query and console logs show the logic is in place.

---

## Part 5: Add More Pre-Executive Scenarios

### Current State
The `performancePlanEngine.ts` already has 15 executive scenarios including:
- Pre-Board Meeting
- Pre-Investor Meeting
- Pre-Strategic Planning
- Pre-Negotiations
- Pre-All Hands
- Pre-Media/Interview
- Pre-Crisis Response
- Pre-Hiring Decision
- Pre-Client Presentation
- Pre-Budget Review
- Pre-Performance Review
- Pre-Difficult Conversation
- Pre-Quarterly Review
- Pre-Speaking Engagement
- Pre-Leadership Meeting

### Additional Scenarios to Add

| Scenario | Trigger Keywords | Hours Ahead |
|----------|-----------------|-------------|
| Pre-M&A Discussion | "m&a", "merger", "acquisition", "due diligence" | 48h |
| Pre-Layoff Announcement | "layoff", "restructuring", "reduction" | 24h |
| Pre-Board Presentation Prep | "board deck", "board presentation" | 48h |
| Pre-Competitive Intel | "competitor", "competitive analysis" | 12h |
| Pre-Product Launch | "launch", "go live", "release" | 24h |

### Files to Modify
- `src/utils/performancePlanEngine.ts` - Add 5 more proactive scenarios

---

## Implementation Summary

| File | Changes |
|------|---------|
| `src/components/home/DailyRitual.tsx` | Fix timestamp comparison, add session caching for plan stability |
| `src/components/coach/CoachSplitView.tsx` | Move greeting text to below hero subtitle |
| `src/pages/Insights.tsx` | Pass related wins to dimension bubbles component |
| `src/utils/performancePlanEngine.ts` | Add 5 more executive scenarios |

---

## Technical Details

### DailyRitual.tsx Changes

**Line 264-294 - Fix regeneration logic:**
```tsx
let shouldRegenerate = !hasStoredPlan;

// Use session storage to prevent regeneration within same session
const sessionKey = `plan-loaded-${new Date().toISOString().split('T')[0]}`;
const sessionLoaded = sessionStorage.getItem(sessionKey);

if (hasStoredPlan && todayCheckin && todayRitual) {
  const checkinTime = new Date(todayCheckin.timestamp);
  // Use updated_at for more accurate comparison
  const planTime = new Date(todayRitual.updated_at || todayRitual.created_at || todayRitual.ritual_date);
  
  // Only regenerate if check-in is genuinely newer
  if (checkinTime.getTime() > planTime.getTime() + 60000) { // 1 minute buffer
    console.log('🔄 Check-in is newer than stored plan - regenerating');
    shouldRegenerate = true;
    sessionStorage.removeItem(sessionKey); // Clear session cache
    
    // Reset completion status
    await upsertRitual({...});
  }
}

// If we have a valid stored plan and already loaded this session, use it
if (!shouldRegenerate && storedPracticeIds && sessionLoaded) {
  // Use stored plan
}

// After successfully loading/generating plan
sessionStorage.setItem(sessionKey, 'true');
```

### CoachSplitView.tsx Changes

**Lines 90-112 - Restructure greeting:**
```tsx
{/* Hero title section */}
<div className="pt-8 pb-4 px-6 text-center space-y-2">
  <h1 className="text-4xl font-headline text-white tracking-tight drop-shadow-lg">
    Self Mastery Coach
  </h1>
  <p className="text-base font-subheadline italic text-white/80">
    Inner Awareness. Presence. Growth.
  </p>
  <p className="text-sm text-white/70 max-w-sm mx-auto leading-relaxed pt-2">
    I'm your self-mastery coach. Share what's on your mind, and let's explore it together.
  </p>
</div>

{/* Centered greeting - just personalized hello */}
<div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
  <div className="w-16 h-16 rounded-full bg-black/20 backdrop-blur-sm flex flex-col items-center justify-center border border-white/20 shadow-lg">
    <span className="text-xl font-headline text-saffron leading-none">SM</span>
    <span className="text-[6px] uppercase tracking-[0.12em] text-white/60 mt-0.5">Coach</span>
  </div>
  <h2 className="text-xl font-headline text-white mt-5">
    Hello, {firstName}
  </h2>
  {/* Removed contextualGreeting - now in hero */}
</div>
```

---

## Expected Outcomes

1. **Stable Performance Plan**: Plan won't regenerate on page refresh unless a new check-in occurs
2. **Consistent Coach UI**: Greeting flows naturally from hero text
3. **Interactive Insights**: Bubbles show rich context when tapped
4. **Connected Themes**: Mind Map shows relationship lines between related themes
5. **Expanded Scenarios**: 20+ executive scenarios covering common senior leader situations

