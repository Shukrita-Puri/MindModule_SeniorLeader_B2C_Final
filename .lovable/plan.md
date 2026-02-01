
# Coach Visual + Mind Map Relationships + Tiny Wins Bubbles Enhancement

## Overview

This plan addresses:
1. **New Coach Visual Image** - Use a different image (light shirt with blue misty background) for the Self Mastery Coach
2. **Connected Mind Map Relationships Not Showing** - Fix the relationship line rendering in InnerWorldBubbles.tsx
3. **Tiny Wins Bubbles Enhancements** - Single-word labels, visible text, color legend explanation, and Mindsera-style insight panel
4. **Color Legend for Bubbles** - Explain what each color means

---

## Part 1: New Coach Visual Image

### Requirement
User wants "Image 1 (the light shirt with blue misty background)" for the Self Mastery Coach instead of the current `coach-visual.jpeg`.

### Implementation
The user will need to upload the new image. Once uploaded, it will be copied to `src/assets/` and the import in `CoachSplitView.tsx` and `DailyRitual.tsx` will be updated.

### Files to Modify
- `src/assets/` - Add new coach image (e.g., `coach-visual-calm.jpeg`)
- `src/components/coach/CoachSplitView.tsx` - Update import
- `src/components/home/DailyRitual.tsx` - Update import

---

## Part 2: Connected Mind Map Relationships Not Showing

### Root Cause Analysis

The relationship lines aren't showing because of multiple issues:

1. **SVG Container Height Issue**: The SVG uses `height: 100%` but since it's absolutely positioned inside a flex container, it may have height 0 if not properly sized.

2. **Relationship Generation Too Strict**: The condition `overlap >= 2` requires themes to appear in at least 2 common sources (e.g., both coach AND wins). With limited data, this is rarely met.

3. **Position Updates Timing**: The `bubblePositions` Map may not be populated when relationships are being drawn due to animation delays.

### Solution

**Fix 1: Improve SVG Container Sizing**

```tsx
// In InnerWorldBubbles.tsx, change the SVG container:
<svg 
  className="absolute inset-0 pointer-events-none z-0 overflow-visible"
  style={{ 
    width: '100%', 
    height: '100%',
    minHeight: '200px' // Ensure minimum height
  }}
  preserveAspectRatio="none"
>
```

**Fix 2: Relax Relationship Generation Criteria**

```tsx
// In Insights.tsx, change overlap threshold from 2 to 1
if (overlap >= 1 || isSemanticallyRelated) {
  themeRelationships.push({
    from: theme1.theme,
    to: theme2.theme,
    strength: Math.min((overlap + (isSemanticallyRelated ? 1 : 0)) / 3, 1)
  });
}
```

**Fix 3: Add More Semantic Pairs**

```tsx
const semanticPairs = [
  ['focus', 'clarity'], ['stress', 'overwhelm'], ['balance', 'steady'],
  ['energy', 'activation'], ['calm', 'grounding'], ['growth', 'progress'],
  ['self-awareness', 'presence'], ['emotional regulation', 'calm'],
  ['confidence', 'achievement'], ['resilience', 'growth'],
  ['relationships', 'communication'], ['focus', 'presence'],
  ['energy', 'focus'], ['stress management', 'emotional regulation']
];
```

**Fix 4: Update Positions After Animation Delay**

```tsx
// In InnerWorldBubbles.tsx, add delayed position update
useEffect(() => {
  // Initial update
  updatePositions();
  
  // Delayed update after bubble animations complete (400ms per bubble + margin)
  const animationDelay = (sortedItems.length * 60) + 500;
  const timeoutId = setTimeout(updatePositions, animationDelay);
  
  return () => clearTimeout(timeoutId);
}, [sortedItems, updatePositions]);
```

**Fix 5: Use Container-Relative Coordinates**

The current implementation uses `getBoundingClientRect()` which gives viewport-relative coordinates. We need to ensure these are properly converted to container-relative:

```tsx
// Ensure the container has position relative and explicit height
<div ref={containerRef} className="relative min-h-[200px]">
```

### Files to Modify
- `src/pages/Insights.tsx` - Relax relationship criteria, add more semantic pairs
- `src/components/insights/InnerWorldBubbles.tsx` - Fix SVG sizing, add delayed position update

---

## Part 3: Tiny Wins Bubbles Enhancement

### 3.1 Single-Word Labels with Visible Text

Current bubbles may show multi-word values. Update to extract single-word labels:

```tsx
// In PsychologicalDimensionBubbles.tsx
// Ensure text is truncated to one word for display
const displayLabel = item.value.split(' ')[0]; // First word only

<span className={cn(
  "font-semibold leading-tight relative z-10 capitalize",
  isLarge ? "text-xs" : "text-[10px]"
)}>
  {displayLabel}
</span>
```

### 3.2 Mindsera-Style Insight Panel

The current implementation already has Popovers with DIMENSION_INSIGHTS. Enhance to match Mindsera style:

```tsx
<PopoverContent 
  className="w-80 p-5 bg-white dark:bg-card border-0 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] rounded-2xl"
  side="bottom"
  sideOffset={12}
>
  <div className="space-y-4">
    {/* Bubble header with color indicator */}
    <div className="flex items-center gap-3">
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center",
        style.bg
      )}>
        <span className={cn("text-sm font-semibold capitalize", style.text)}>
          {item.value.charAt(0).toUpperCase()}
        </span>
      </div>
      <div>
        <h4 className="font-semibold text-foreground capitalize text-lg">
          {item.value}
        </h4>
        <span className={cn(
          "text-xs px-2 py-0.5 rounded-full",
          style.bg, style.text
        )}>
          {getDimensionLabel(item.dimension)}
        </span>
      </div>
    </div>
    
    {/* Summary insight */}
    <div className="border-l-2 border-primary/30 pl-3">
      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
        Summary
      </h5>
      <p className="text-sm text-foreground leading-relaxed">
        {insightText}
      </p>
    </div>
    
    {/* Related wins */}
    {relatedWins && relatedWins.length > 0 && (
      <div className="space-y-2">
        <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          From your wins
        </h5>
        {relatedWins.slice(0, 2).map((win, i) => (
          <div key={i} className="bg-muted/50 rounded-xl p-3 text-sm text-foreground">
            "{win.content}"
          </div>
        ))}
      </div>
    )}
    
    {/* Explore button */}
    <button className="...">
      <ChatCircle /> Explore with Coach
    </button>
  </div>
</PopoverContent>
```

### 3.3 Color Legend Explanation

Add a legend below the bubbles explaining what each color means:

```tsx
{/* Color Legend */}
<div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground mt-4">
  <div className="flex items-center gap-1">
    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/50"></span>
    <span>Sentiment</span>
  </div>
  <div className="flex items-center gap-1">
    <span className="w-2.5 h-2.5 rounded-full bg-orange-400/50"></span>
    <span>Emotion</span>
  </div>
  <div className="flex items-center gap-1">
    <span className="w-2.5 h-2.5 rounded-full bg-sky-500/50"></span>
    <span>Agency</span>
  </div>
  <div className="flex items-center gap-1">
    <span className="w-2.5 h-2.5 rounded-full bg-violet-500/50"></span>
    <span>Regulation</span>
  </div>
  <div className="flex items-center gap-1">
    <span className="w-2.5 h-2.5 rounded-full bg-saffron/50"></span>
    <span>Growth</span>
  </div>
</div>
```

### Files to Modify
- `src/components/insights/PsychologicalDimensionBubbles.tsx` - Single-word labels, Mindsera-style popover, color legend

---

## Part 4: Pass Related Wins to Dimension Bubbles

Currently `PsychologicalDimensionBubbles` has a `relatedWins` prop but it's not being populated from Insights.tsx.

### Solution
Fetch and store tiny wins content, then pass to the component:

```tsx
// In Insights.tsx
const [tinyWinsContent, setTinyWinsContent] = useState<Array<{ content: string; date: string }>>([]);

// In fetchTinyWinsInsights, also store the raw wins content
const winsWithContent = recentWins?.map(w => ({
  content: w.win_content,
  date: new Date(w.win_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
})) || [];
setTinyWinsContent(winsWithContent);

// Pass to component
<PsychologicalDimensionBubbles
  data={...}
  relatedWins={tinyWinsContent}
/>
```

### Files to Modify
- `src/pages/Insights.tsx` - Fetch and pass related wins data

---

## Technical Implementation Summary

| File | Changes |
|------|---------|
| `src/components/coach/CoachSplitView.tsx` | Update coach visual import (once new image is uploaded) |
| `src/components/home/DailyRitual.tsx` | Update coach visual import (once new image is uploaded) |
| `src/pages/Insights.tsx` | Relax relationship criteria (overlap >= 1), add more semantic pairs, pass related wins to bubbles |
| `src/components/insights/InnerWorldBubbles.tsx` | Fix SVG container sizing, add delayed position update, add min-height to container |
| `src/components/insights/PsychologicalDimensionBubbles.tsx` | Single-word labels, enhanced Mindsera-style popover, add color legend |

---

## Expected Visual Outcome

### Mind Map with Connections
```text
    [Focus]•••••••[Clarity]
         \        /
          \      /
    [Self-awareness]•••[Presence]
          |
     [Growth]
```

### Tiny Wins Bubbles with Legend
```text
  (Pride)  (Calm)  (Proactive)  (Learning)
   green   orange    blue        gold

  ─────────────────────────────────────────
  ● Sentiment  ● Emotion  ● Agency  ● Regulation  ● Growth
```

### Popover (Mindsera-style)
```text
┌─────────────────────────────────────┐
│  [P]  Pride                         │
│       Emotion                       │
│                                     │
│  Summary                            │
│  ──────────────────────             │
│  Pride appears frequently in your   │
│  wins. You're learning to own your  │
│  accomplishments.                   │
│                                     │
│  From your wins                     │
│  ┌────────────────────────────┐     │
│  │ "Managed to get traction..." │   │
│  └────────────────────────────┘     │
│                                     │
│  [ 💬 Explore with Coach ]          │
└─────────────────────────────────────┘
```

---

## Note on Coach Image

The user mentioned "Image 1 (light shirt with blue misty background)" but the current assets folder contains `coach-visual.jpeg`. The user will need to either:
1. Upload the desired new image, or
2. Confirm which existing asset to use

Once the image is available, it will be integrated into the Coach and DailyRitual components.
