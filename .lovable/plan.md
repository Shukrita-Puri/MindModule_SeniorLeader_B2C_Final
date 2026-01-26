
# Fix Plan: Data Tracking, Evening Tiny Win Prompt, and UX Improvements

## Issues Identified

### 1. Naming Changes Needed
- "Tiny Wins Patterns" → "Your Tiny Wins"
- "Energy Rhythm" → "Your Energy Rhythm"

### 2. Data Not Tracking in DEV_MODE
The Insights page calls Auth0's `getAccessTokenSilently()` in three functions, which fails in DEV_MODE:
- `fetchTinyWinsInsights()` - calls `tiny-wins-insights` edge function
- `fetchStatePatterns()` - calls `state-patterns-insights` edge function  
- `fetchSemanticAnalysis()` - calls `insights-semantic-analysis` edge function

These need DEV_MODE branches to query the database directly instead of using edge functions that require Auth0 tokens.

### 3. Evening Tiny Win Prompt Not Appearing
The current logic in `JustInTimeIntervention.tsx` only shows the evening integrate prompt if:
- It's evening (after 5 PM)
- AND the user has a check-in with a "low energy" state (overwhelmed, drained, scattered)

This is too restrictive. The evening Integrate flow should appear for ALL users in the evening who haven't completed their tiny win for the day - not just those in low-energy states.

### 4. Missing Space for Insights Content
Each section needs designated space for dynamic AI-generated insights to appear as data accumulates.

---

## Part 1: Naming Updates

**File: `src/pages/Insights.tsx`**

| Current | New |
|---------|-----|
| Line 699: "Tiny Wins Patterns" | "Your Tiny Wins" |
| Line 750: "Energy Rhythm" | "Your Energy Rhythm" |

---

## Part 2: DEV_MODE Data Fetching Fixes

**File: `src/pages/Insights.tsx`**

Add DEV_MODE branches to each data fetching function:

### 2.1 `fetchTinyWinsInsights` (Lines 284-301)
```typescript
const fetchTinyWinsInsights = async () => {
  if (!user?.id) return;
  setWinsLoading(true);
  
  try {
    // DEV_MODE: Direct database query
    if (DEV_MODE) {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      
      const { data: wins } = await supabase
        .from('tiny_wins')
        .select('win_content, win_date')
        .eq('user_id', DEV_USER.id)
        .gte('win_date', fourteenDaysAgo.toISOString().split('T')[0])
        .order('win_date', { ascending: false });
      
      // Simple theme extraction from win content
      const themes = wins?.slice(0, 5).map(w => 
        w.win_content.split(' ').slice(0, 4).join(' ')
      ) || [];
      
      setTinyWinsInsights({
        themes,
        summary: wins?.length ? `You've captured ${wins.length} wins recently.` : null,
        winsCount: wins?.length || 0
      });
      return;
    }
    
    // Production: Use edge function
    const accessToken = await getAccessTokenSilently();
    // ... existing code
  }
};
```

### 2.2 `fetchStatePatterns` (Lines 303-320)
```typescript
const fetchStatePatterns = async () => {
  if (!user?.id) return;
  setPatternsLoading(true);
  
  try {
    // DEV_MODE: Direct database query
    if (DEV_MODE) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { data: checkins } = await supabase
        .from('daily_checkins')
        .select('outcome')
        .eq('user_id', DEV_USER.id)
        .gte('checkin_date', sevenDaysAgo.toISOString().split('T')[0]);
      
      const distribution: Record<string, number> = {
        focused: 0, steady: 0, scattered: 0, drained: 0, overwhelmed: 0
      };
      
      checkins?.forEach(c => {
        if (c.outcome && distribution.hasOwnProperty(c.outcome)) {
          distribution[c.outcome]++;
        }
      });
      
      setStatePatterns({
        distribution,
        observation: checkins?.length >= 7 
          ? 'Your week shows a pattern of varied states.'
          : null,
        checkInCount: checkins?.length || 0
      });
      return;
    }
    
    // Production: Use edge function
    const accessToken = await getAccessTokenSilently();
    // ... existing code
  }
};
```

### 2.3 `fetchSemanticAnalysis` (Lines 322-339)
```typescript
const fetchSemanticAnalysis = async () => {
  if (!user?.id) return;
  setSemanticLoading(true);
  
  try {
    // DEV_MODE: Direct database query for basic themes
    if (DEV_MODE) {
      // Query dialogue_sessions for coach conversation themes
      const { data: sessions } = await supabase
        .from('dialogue_sessions')
        .select('id, scenario_id')
        .eq('user_id', DEV_USER.id)
        .order('created_at', { ascending: false })
        .limit(10);
      
      // For now, return empty semantic analysis in DEV_MODE
      // Full semantic analysis requires AI processing
      setSemanticAnalysis({
        themePatterns: [],
        unifiedThemes: [],
        themeRelationships: []
      });
      return;
    }
    
    // Production: Use edge function
    const accessToken = await getAccessTokenSilently();
    // ... existing code
  }
};
```

Also add imports at the top:
```typescript
import { DEV_MODE, DEV_USER } from '@/config/devMode';
```

---

## Part 3: Evening Integrate Flow for All Users

**File: `src/components/home/JustInTimeIntervention.tsx`**

The current logic (lines 305-328) only triggers for users in `LOW_ENERGY_STATES`. 

Change to show for ALL users in the evening:

```typescript
// 4. Evening → Integrate flow (for all users, not just depleted)
if (isEvening() && !moduleStatus.integrate) {
  // Check if user has done their tiny win today via tiny_wins table
  const today = new Date().toISOString().split('T')[0];
  const { data: todayWin } = await supabase
    .from('tiny_wins')
    .select('id')
    .eq('user_id', user?.id)
    .eq('win_date', today)
    .maybeSingle();
  
  // If no tiny win captured today, show integrate prompt
  if (!todayWin) {
    const { data: todayCheckin } = await supabase
      .from('daily_checkins')
      .select('outcome')
      .eq('user_id', user?.id)
      .gte('checkin_date', today)
      .maybeSingle();
    
    // Customize prompt based on state
    const isLowEnergy = todayCheckin && LOW_ENERGY_STATES.includes(todayCheckin.outcome);
    
    const interventionData: InterventionData = {
      trigger: 'evening-depleted', // Keep trigger name for consistency
      modules: ['integrate'],
      practices: [],
      showCoachCard: true,
      hasFavorites: false
    };
    
    interventionData.coachPrompt = isLowEnergy
      ? `Let's close out today gently. Take a breath. What's one small thing you did right today?`
      : `Time to close out today. What's one small win you can celebrate from today?`;
    
    setIntervention(interventionData);
    return;
  }
}
```

Also update the message function:
```typescript
if (intervention.trigger === 'evening-depleted') {
  return 'Capture your win for today';  // Changed from "Time to close out today"
}
```

---

## Part 4: Add Space for Insights Content

Each section should have a dedicated area for dynamic insights. Add after the visualization in each section:

**State Patterns Section (add after bar chart):**
```tsx
{/* Insight space */}
<div className="mt-4 p-3 bg-muted/10 rounded-lg min-h-[40px]">
  {insightsTier === 'full' && statePatterns?.observation ? (
    <p className="text-sm text-muted-foreground leading-relaxed italic">
      "{statePatterns.observation}"
    </p>
  ) : checkInCount > 0 && checkInCount < 7 ? (
    <p className="text-xs text-muted-foreground/60">
      Complete {7 - checkInCount} more days to unlock pattern insights.
    </p>
  ) : null}
</div>
```

**Mind Map Section:**
```tsx
{/* Insight space */}
<div className="mt-4 p-3 bg-muted/10 rounded-lg min-h-[40px]">
  {mindMapReady && semanticAnalysis?.unifiedThemes?.length > 0 ? (
    <p className="text-xs text-muted-foreground leading-relaxed">
      These themes emerge from your coach conversations, practices, and wins - revealing your inner patterns.
    </p>
  ) : (
    <p className="text-xs text-muted-foreground/60">
      Engage with the coach and complete practices to see unified themes emerge.
    </p>
  )}
</div>
```

**Tiny Wins Section:**
```tsx
{/* Insight space */}
<div className="mt-4 p-3 bg-muted/10 rounded-lg min-h-[40px]">
  {tinyWinsInsights?.summary ? (
    <p className="text-sm text-muted-foreground leading-relaxed italic">
      {tinyWinsInsights.summary}
    </p>
  ) : (
    <p className="text-xs text-muted-foreground/60">
      Capture wins during evening integration to reveal what you naturally do well.
    </p>
  )}
</div>
```

**Energy Rhythm Section:**
```tsx
{/* Insight space */}
<div className="mt-4 p-3 bg-muted/10 rounded-lg min-h-[40px]">
  {checkInsWithTimestamp.length >= 7 ? (
    <p className="text-xs text-muted-foreground leading-relaxed">
      Your energy rhythm reveals natural peaks and dips throughout the week.
    </p>
  ) : checkInsWithTimestamp.length > 0 ? (
    <p className="text-xs text-muted-foreground/60">
      {7 - checkInsWithTimestamp.length} more check-ins will reveal your energy rhythm.
    </p>
  ) : null}
</div>
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Insights.tsx` | Add DEV_MODE imports, update 3 fetch functions with DEV_MODE branches, rename section titles, add insight space divs |
| `src/components/home/JustInTimeIntervention.tsx` | Update evening integrate logic to show for all users, check tiny_wins table, customize prompt |

---

## Expected Outcomes

1. **Naming**: "Your Tiny Wins" and "Your Energy Rhythm" for personalized feel
2. **Data Tracking**: DEV_MODE users will see their check-in data in Energy Rhythm and State Patterns
3. **Evening Prompt**: ALL users will see the evening integrate prompt to capture their tiny win (not just depleted users)
4. **Insight Spaces**: Each section has a designated area for dynamic insights to appear as data accumulates

---

## Technical Note on Check-in Data

The check-in save logic in `DailyCheckIn.tsx` correctly calls `saveCheckin()` which has DEV_MODE handling. If check-ins are not appearing:
1. The `saveCheckin` function should be logging success/failure
2. Verify RLS policies on `daily_checkins` table allow inserts for the dev user
3. The user_id in DEV_MODE is `'dev-user-123'` - ensure this matches what's being saved
