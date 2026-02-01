
# Fix Plan: Insights Page Bubbles + Coach Split Layout + State Patterns Differentiation

## Issues Identified

### Issue 1: Tiny Wins Bubbles Not Showing
**Root Cause**: In DEV_MODE, the `fetchTinyWinsInsights` function (lines 306-351) queries the database for psychological dimensions, but if the wins in the database don't have dimensions populated yet (because they were added before the migration or edge function update), the `dimensions` array will be empty even though `winsCount > 0`.

**Evidence**: 
- Lines 320-331 aggregate dimensions only if they exist in the database
- If `primary_emotion`, `agency_type`, etc. are all NULL, no dimensions are created
- The UI shows "3 wins logged" but no bubbles because `tinyWinsInsights.dimensions` is empty

**Solution**: In DEV_MODE, run the keyword-based dimension extraction client-side for wins that don't have dimensions populated:

```typescript
// In fetchTinyWinsInsights DEV_MODE block
wins?.forEach(win => {
  // If no dimensions populated, extract from text
  if (!win.sentiment && !win.primary_emotion && !win.agency_type) {
    const extracted = extractDimensionsFromText(win.win_content);
    if (extracted.sentiment) dimensionCounts.sentiment[extracted.sentiment] = ...
    // etc
  } else {
    // Use existing dimensions
    if (win.sentiment) dimensionCounts.sentiment[win.sentiment] = ...
  }
});
```

### Issue 2: Mind Map Not Showing
**Root Cause**: In DEV_MODE (lines 426-443), `fetchSemanticAnalysis` sets empty arrays for all semantic data:

```typescript
setSemanticAnalysis({
  themePatterns: [],
  unifiedThemes: [],  // <-- Always empty in DEV_MODE
  themeRelationships: []
});
```

This causes `mindMapReady` to evaluate to false because `coachSessions = 0` and `unifiedThemes` is empty.

**Solution**: In DEV_MODE, populate `unifiedThemes` from available data sources:
1. Query `dialogue_messages` for coach conversation content
2. Query `tiny_wins` for win content
3. Extract themes using simple keyword patterns or use existing win dimensions as themes
4. Create `unifiedThemes` entries with source attribution

### Issue 3: State Patterns vs Energy Rhythm Overlap
**Analysis**: Both visualizations show the same underlying data (daily check-in outcomes) but in different formats:
- **State Patterns** (LuxuryStateBar): Bar chart showing total count of each state across the week
- **Energy Rhythm** (EnergyRhythm): Heatmap showing state by time-of-day (morning/afternoon/evening) and day

**Current Redundancy**: Both only use check-in data. The user wants State Patterns to incorporate wearable data to show a richer picture.

**Proposed Differentiation**:
| Visualization | Data Source | Purpose |
|---------------|-------------|---------|
| **State Patterns** | Check-ins + Wearable (HRV, sleep) | Shows layered state: "You reported focused, but your HRV suggests underlying stress" |
| **Energy Rhythm** | Check-ins only | When you check in during the week (time patterns) |

**Implementation**:
1. Rename "State Patterns" to "State + Physiology Patterns" or keep as is
2. Add wearable data integration to State Patterns section
3. Display comparison insight: "You felt [check-in state] but your wearable shows [physiological state]"

### Issue 4: Coach Page Not Split from Start
**Root Cause**: Looking at `CoachSplitView.tsx`, the split layout IS implemented correctly. However, from the screenshots:
- The top half shows coach area with gradient background
- The bottom half shows user input area

The issue is that the split may not be visually clear enough. The user message "Hi" appears as a small bubble at bottom right, making it look like the page isn't split.

**Review**: The current implementation in `CoachSplitView.tsx`:
- Lines 74-198: Top half with `flex-1` for coach response area
- Lines 200-318: Bottom half with user input area

This IS a split layout, but the visual distinction might not be strong enough. The screenshots show it's working, but we can enhance the visual separation.

**Enhancements**:
1. Increase the visual contrast between top and bottom halves
2. Make the coach area more visually distinct with a stronger background treatment
3. Ensure the page is split 50/50 from the start, not flexible

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Insights.tsx` | Fix DEV_MODE dimension extraction for tiny wins; Fix DEV_MODE unifiedThemes generation; Add wearable overlay to State Patterns |
| `src/components/coach/CoachSplitView.tsx` | Strengthen visual split with fixed 50/50 layout |
| `src/utils/dimensionExtraction.ts` (new) | Client-side dimension extraction helper for DEV_MODE |

---

## Technical Implementation

### Part 1: Fix Tiny Wins Bubbles in DEV_MODE

Create a utility function to extract dimensions client-side:

```typescript
// src/utils/dimensionExtraction.ts
export const DIMENSION_PATTERNS = {
  sentiment: {
    positive: ['good', 'great', 'happy', 'proud', 'grateful', 'amazing'],
    negative: ['bad', 'sad', 'angry', 'frustrated', 'upset'],
  },
  emotion: {
    pride: ['proud', 'accomplished', 'achieved', 'succeeded', 'nailed'],
    relief: ['relief', 'relieved', 'finally'],
    gratitude: ['grateful', 'thankful', 'appreciate'],
    confidence: ['confident', 'capable', 'strong'],
  },
  agency: {
    proactive: ['decided', 'chose', 'initiated', 'started', 'led'],
    responsive: ['responded', 'handled', 'managed', 'adapted'],
    collaborative: ['together', 'team', 'partnered'],
  },
  regulation: {
    regulated: ['calm', 'composed', 'steady', 'controlled', 'breathed'],
    intentional: ['paused', 'thought', 'considered', 'reflected'],
  },
  growth: {
    learning: ['learned', 'realized', 'understood', 'discovered'],
    breakthrough: ['finally', 'first time', 'overcame'],
    resilience: ['bounced back', 'persisted', 'kept going'],
  },
};

export function extractDimensionsFromText(text: string) {
  const lowerText = text.toLowerCase();
  const dimensions: { dimension: string; value: string }[] = [];
  
  for (const [dimension, categories] of Object.entries(DIMENSION_PATTERNS)) {
    for (const [value, keywords] of Object.entries(categories)) {
      if (keywords.some(k => lowerText.includes(k))) {
        dimensions.push({ dimension, value });
        break; // Only one per dimension
      }
    }
  }
  
  // Default to positive sentiment for wins
  if (!dimensions.find(d => d.dimension === 'sentiment')) {
    dimensions.push({ dimension: 'sentiment', value: 'positive' });
  }
  
  return dimensions;
}
```

Update `fetchTinyWinsInsights` DEV_MODE block:

```typescript
// In Insights.tsx, fetchTinyWinsInsights DEV_MODE block
const dimensionCounts: Record<string, Record<string, number>> = {
  sentiment: {}, emotion: {}, agency: {}, regulation: {}, growth: {}
};

wins?.forEach(win => {
  // Check if win has dimensions from database
  const hasDbDimensions = win.sentiment || win.primary_emotion || win.agency_type;
  
  if (hasDbDimensions) {
    // Use stored dimensions
    if (win.sentiment) dimensionCounts.sentiment[win.sentiment] = (dimensionCounts.sentiment[win.sentiment] || 0) + 1;
    // ... rest of existing logic
  } else {
    // Extract from text client-side
    const extracted = extractDimensionsFromText(win.win_content);
    extracted.forEach(({ dimension, value }) => {
      if (dimensionCounts[dimension]) {
        dimensionCounts[dimension][value] = (dimensionCounts[dimension][value] || 0) + 1;
      }
    });
  }
});
```

### Part 2: Fix Mind Map in DEV_MODE

Update `fetchSemanticAnalysis` to generate themes from actual data:

```typescript
// In Insights.tsx, fetchSemanticAnalysis DEV_MODE block

// Query dialogue_messages for coach content
const { data: messages } = await supabase
  .from('dialogue_messages')
  .select('content, session_id')
  .eq('sender_type', 'user')
  .order('timestamp', { ascending: false })
  .limit(50);

// Query tiny_wins for win content
const { data: recentWins } = await supabase
  .from('tiny_wins')
  .select('win_content')
  .eq('user_id', DEV_USER.id)
  .limit(20);

// Simple theme extraction from content
const themeCounts = new Map<string, { count: number; sources: { coach: number; wins: number } }>();

// Extract themes from coach messages
messages?.forEach(msg => {
  const themes = extractThemesFromContent(msg.content);
  themes.forEach(theme => {
    const existing = themeCounts.get(theme) || { count: 0, sources: { coach: 0, wins: 0 } };
    existing.count++;
    existing.sources.coach++;
    themeCounts.set(theme, existing);
  });
});

// Extract themes from wins
recentWins?.forEach(win => {
  const themes = extractThemesFromContent(win.win_content);
  themes.forEach(theme => {
    const existing = themeCounts.get(theme) || { count: 0, sources: { coach: 0, wins: 0 } };
    existing.count++;
    existing.sources.wins++;
    themeCounts.set(theme, existing);
  });
});

// Convert to unifiedThemes format
const unifiedThemes = Array.from(themeCounts.entries())
  .map(([theme, data]) => ({
    theme,
    totalCount: data.count,
    weight: Math.min(data.count / 5, 1), // Normalize to 0-1
    sources: { coach: data.sources.coach, practice: 0, wins: data.sources.wins, checkins: 0 }
  }))
  .sort((a, b) => b.totalCount - a.totalCount)
  .slice(0, 12);

setSemanticAnalysis({
  themePatterns: [],
  unifiedThemes,
  themeRelationships: []
});
```

### Part 3: Differentiate State Patterns from Energy Rhythm

Add wearable data overlay to State Patterns section:

```typescript
// In the State Patterns section of Insights.tsx

{/* Wearable Correlation Insight */}
{wearableData && checkInCount > 0 && (
  <div className="mt-4 p-3 bg-muted/20 rounded-lg">
    <p className="text-xs font-medium text-muted-foreground mb-1">
      Wearable Insight
    </p>
    <p className="text-sm text-foreground">
      {getWearableStateComparison(statePatterns, wearableData)}
    </p>
  </div>
)}
```

Where `getWearableStateComparison` analyzes:
- If check-in says "focused" but HRV is low → "You reported focused, but your body shows signs of stress"
- If check-in says "drained" and sleep was poor → "Your low energy aligns with a short sleep night"

**Note**: This requires wearable data integration which may not be fully available. If not, we can show a teaser message: "Connect wearable to see how your physiology correlates with your felt state."

### Part 4: Strengthen Coach Split Layout

Update `CoachSplitView.tsx` to have clearer visual separation:

```tsx
<div className="flex flex-col h-full">
  {/* TOP HALF - Coach Response Area - Fixed height */}
  <div className="h-1/2 relative overflow-hidden">
    {/* Stronger background treatment */}
    <div className="absolute inset-0 bg-gradient-to-b from-saffron/12 via-taupe/8 to-background" />
    {/* ... coach content */}
  </div>

  {/* BOTTOM HALF - User Input Area - Fixed height */}
  <div className="h-1/2 border-t-2 border-saffron/20 bg-background/95 backdrop-blur-xl">
    {/* ... user content */}
  </div>
</div>
```

Key changes:
- Change from `flex-1` to `h-1/2` for both halves to ensure 50/50 split
- Stronger border between sections (`border-t-2 border-saffron/20`)
- Increase gradient intensity in coach area (`from-saffron/12` instead of `from-saffron/8`)

---

## Expected Outcomes

1. **Tiny Wins Bubbles**: Psychological dimension bubbles will appear even in DEV_MODE, extracted from win text
2. **Mind Map**: Will show unified themes from coach conversations and wins
3. **State vs Energy**: State Patterns will show wearable correlation insights (or teaser to connect wearable)
4. **Coach Split**: Clear 50/50 visual split from page load with stronger visual separation

---

## Mind Map Data Measurement

The Mind Map (`InnerWorldBubbles`) is populated from `semanticAnalysis.unifiedThemes`, which aggregates:

1. **Coach conversations** (`dialogue_messages`): Themes extracted from user messages to the coach
2. **Practice completions** (`sanctuary_events`): Categories of practices completed
3. **Tiny wins** (`tiny_wins`): Themes from win content
4. **Check-ins** (`daily_checkins`): State patterns

Each theme gets:
- `totalCount`: Number of times mentioned across all sources
- `weight`: Normalized 0-1 value for bubble sizing
- `sources`: Breakdown by source type (coach, practice, wins, checkins)

The `mindMapReady` gate (line 158-161) requires:
- 3+ coach sessions OR
- 5+ check-ins AND 2+ wins OR
- 5+ total data points

In DEV_MODE, the current implementation returns empty arrays, hence no Mind Map. The fix populates this from actual database content.
