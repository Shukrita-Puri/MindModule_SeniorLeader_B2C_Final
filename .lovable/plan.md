
# Progressive Insights System with Luxury Charting

## Overview

This plan implements a **tiered progressive disclosure** system for the Insights page that surfaces valuable data from Day 0 while building toward comprehensive pattern recognition by Day 7+. All charts will receive **luxury 3D styling** with gradients, shadows, and glass morphism suitable for executive users.

---

## Phased Data Disclosure Strategy

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Day 0         │ Day 1-2       │ Day 3        │ Day 4-6      │ Day 7+       │
│ (Onboarding)  │ (Early Data)  │ (First View) │ (Deepening)  │ (Full View)  │
├───────────────┼───────────────┼──────────────┼──────────────┼──────────────┤
│ Baseline      │ Compare to    │ Factual      │ Deeper       │ Correlations │
│ Score +       │ baseline +    │ summaries    │ insights +   │ + Patterns + │
│ Archetype     │ previous day  │ (no arrows)  │ themes       │ Mind Map     │
└───────────────┴───────────────┴──────────────┴──────────────┴──────────────┘
```

---

## Part 1: Baseline Integration (Day 0+)

### 1.1 Add Baseline Dotted Line to All Charts

The user's onboarding scores become a **dotted reference line** across all metrics:

**Affected Components:**
- State Patterns bar chart → Add dotted line at onboarding stress response score
- Energy Rhythm heatmap → Add baseline energy tier indicator
- Progress stats → Show "vs baseline" comparison

**Implementation:**
```tsx
// Fetch baseline from profiles table
const { data: profile } = await supabase
  .from('profiles')
  .select('inner_world_profile, inner_world_archetype, baseline_established_date')
  .eq('id', user.id)
  .single();

// Baseline score becomes dotted reference
const baselineScore = profile?.inner_world_profile?.overallScore || 58;
```

**Visual Treatment:**
```tsx
// Dotted baseline marker on charts
<div 
  className="absolute border-t-2 border-dashed border-saffron/40 w-full"
  style={{ top: `${100 - baselineScore}%` }}
>
  <span className="absolute -top-3 right-0 text-[10px] text-saffron/60">
    Baseline ({baselineScore})
  </span>
</div>
```

### 1.2 Add "Your Starting Point" Card (Always Visible)

A permanent card showing the user's onboarding results for reference:

```tsx
<Card className="relative overflow-hidden">
  <div className="absolute inset-0 bg-gradient-to-br from-saffron/5 via-transparent to-primary/5" />
  <CardHeader>
    <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground">
      Your Starting Point
    </span>
  </CardHeader>
  <CardContent>
    <div className="flex items-center gap-4">
      <div className="text-3xl font-bold text-saffron">{baselineScore}</div>
      <div>
        <p className="text-sm font-medium">{archetype.title}</p>
        <p className="text-xs text-muted-foreground">Established {formatDate}</p>
      </div>
    </div>
  </CardContent>
</Card>
```

---

## Part 2: Day 1-2 Insights (Early Engagement)

### 2.1 Comparison-Based Metrics

Show factual data with comparisons to:
1. **Baseline** (onboarding score)
2. **Previous day** (when available)

**Streak Card Enhancement:**
```tsx
<div className="space-y-1">
  <p className="text-2xl font-bold">{checkInStreak}</p>
  <p className="text-xs text-muted-foreground">days</p>
  {baselineExists && (
    <p className="text-[10px] text-saffron">
      {streak > 0 ? 'Building consistency' : 'Start today'}
    </p>
  )}
</div>
```

**Today vs Yesterday:**
```tsx
{checkInCount >= 2 && (
  <div className="text-xs mt-2 text-muted-foreground">
    Today: <span className="text-foreground">{todayState}</span>
    {yesterdayState && (
      <> • Yesterday: <span className="text-foreground">{yesterdayState}</span></>
    )}
  </div>
)}
```

### 2.2 Tiny Wins Patterns (Day 1+)

Show wins progressively from the first capture:

```tsx
const getWinsMessage = (count: number) => {
  if (count === 0) return 'Capture your first win during evening integration';
  if (count === 1) return 'First win captured! Each one reveals what you do naturally well.';
  if (count < 5) return `${count} wins logged. Patterns emerge around 5+ wins.`;
  return null; // Show full visualization
};
```

### 2.3 Energy Rhythm (Day 1+)

Start populating factual data immediately:

```tsx
const getEnergyMessage = (checkInCount: number) => {
  if (checkInCount === 0) return 'Complete your first check-in to start mapping your rhythm';
  if (checkInCount === 1) return 'First data point recorded. Check in at different times to see patterns.';
  if (checkInCount < 5) return `${checkInCount} check-ins logged. Your rhythm becomes clearer with each one.`;
  return null; // Show full heatmap
};
```

---

## Part 3: Day 3 Insights (First Summary View)

### 3.1 Factual Summaries (No Direction Arrows)

At 3+ check-ins, show aggregated data without trend claims:

**State Patterns Card:**
```tsx
{checkInCount >= 3 && checkInCount < 7 && (
  <p className="text-sm text-muted-foreground mt-4 p-3 bg-muted/30 rounded-lg">
    "In {checkInCount} check-ins, you've felt {mostCommonState} most often. 
    A few more days will reveal if this is your typical pattern."
  </p>
)}
```

**What NOT to Show:**
- ↗ Improving / ↘ Declining arrows
- "Your trend is..."
- Pattern confidence percentages

---

## Part 4: Day 4-6 Insights (Deepening)

### 4.1 Emerging Insights

Begin showing correlations with appropriate caveats:

**Theme Patterns (Day 4+):**
```tsx
{checkInCount >= 4 && semanticAnalysis?.themePatterns.length > 0 && (
  <div className="space-y-2">
    <p className="text-xs text-muted-foreground">
      Emerging themes from your {checkInCount} check-ins:
    </p>
    {/* Show theme bubbles */}
  </div>
)}
```

### 4.2 Calendar Correlation Teaser

Show upcoming unlock:

```tsx
{checkInCount >= 4 && checkInCount < 7 && (
  <div className="p-4 bg-muted/20 rounded-lg border border-dashed border-muted-foreground/30">
    <p className="text-sm text-muted-foreground">
      <span className="font-medium">Calendar → State Patterns</span>
      <br />
      Unlocks in {7 - checkInCount} more days of check-ins
    </p>
  </div>
)}
```

---

## Part 5: Day 5+ (Mind Map & Unified Themes)

### 5.1 Mind Map Progressive Reveal

The unified mind map appears when sufficient cross-source data exists:

**Unlock Conditions:**
- At least 3 coach conversations, OR
- At least 5 check-ins + 2 wins, OR
- 5+ total data points across sources

```tsx
const mindMapReady = useMemo(() => {
  const coachSessions = semanticAnalysis?.unifiedThemes?.reduce((sum, t) => sum + t.sources.coach, 0) || 0;
  const totalPoints = checkInCount + (tinyWinsInsights?.winsCount || 0) + coachSessions;
  return coachSessions >= 3 || (checkInCount >= 5 && (tinyWinsInsights?.winsCount || 0) >= 2) || totalPoints >= 5;
}, [semanticAnalysis, checkInCount, tinyWinsInsights]);

{!mindMapReady ? (
  <div className="py-8 text-center">
    <p className="text-sm text-muted-foreground">
      Your Mind Map builds from coach conversations, practices, and wins.
      <br />
      <span className="text-xs">
        Keep engaging to see unified themes emerge.
      </span>
    </p>
  </div>
) : (
  <InnerWorldBubbles items={semanticAnalysis?.unifiedThemes || []} />
)}
```

---

## Part 6: Day 7+ (Full Patterns & Correlations)

### 6.1 Calendar-State Correlations Unlock

Show the full correlation analysis:

```tsx
{checkInCount >= 7 && (
  <Card>
    <CardHeader>
      <span className="text-xs font-medium tracking-widest uppercase">
        Calendar → State Patterns
      </span>
    </CardHeader>
    <CardContent>
      <CalendarStateCorrelations userId={user?.id} />
      <p className="text-xs text-muted-foreground mt-3">
        "Days you felt scattered or low energy often had high-decision 
        or back-to-back meetings."
      </p>
    </CardContent>
  </Card>
)}
```

### 6.2 Full Pattern Recognition

Enable trend arrows and confidence indicators:

```tsx
{checkInCount >= 7 && statePatterns?.observation && (
  <div className="flex items-center gap-2 text-sm">
    {getTrendDirection(weekData) === 'improving' && (
      <TrendingUp className="w-4 h-4 text-green-500" />
    )}
    {getTrendDirection(weekData) === 'declining' && (
      <TrendingDown className="w-4 h-4 text-amber-500" />
    )}
    <span className="text-muted-foreground">{statePatterns.observation}</span>
  </div>
)}
```

---

## Part 7: Luxury Chart Styling

### 7.1 Luxury Card Wrapper

Create a reusable luxury card component:

```tsx
// src/components/insights/LuxuryInsightCard.tsx
export const LuxuryInsightCard = ({ children, className }: Props) => (
  <Card className={cn(
    "relative overflow-hidden",
    "bg-gradient-to-br from-card via-card to-card/95",
    "border border-white/10 dark:border-white/5",
    "shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]",
    "backdrop-blur-sm",
    className
  )}>
    {/* Top glass highlight */}
    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    {/* Inner glow */}
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,140,66,0.03)_0%,transparent_50%)]" />
    {children}
  </Card>
);
```

### 7.2 Luxury Bar Chart Styling

Transform the current flat bars into 3D gradient bars:

```tsx
// Enhanced bar with gradient, shadow, and 3D effect
<div className="flex-1 h-8 bg-muted/20 rounded-full overflow-hidden relative shadow-inner">
  {/* 3D inset shadow */}
  <div className="absolute inset-0 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]" />
  
  {/* Gradient bar with glow */}
  <div
    className="h-full rounded-full relative transition-all duration-700 ease-out"
    style={{
      width: `${(item.count / maxStateCount) * 100}%`,
      background: `linear-gradient(135deg, ${item.fill} 0%, ${lighten(item.fill, 15)} 50%, ${item.fill} 100%)`,
      boxShadow: `0 2px 8px ${item.fill}40, inset 0 1px 2px rgba(255,255,255,0.3)`,
      minWidth: item.count > 0 ? '16px' : '0'
    }}
  >
    {/* Top highlight for 3D effect */}
    <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/25 to-transparent rounded-t-full" />
  </div>
</div>
```

### 7.3 Luxury Heatmap Cells (Energy Rhythm)

Enhanced heatmap with depth and glow:

```tsx
<div 
  className={cn(
    "aspect-square rounded-lg flex items-center justify-center transition-all duration-300",
    "shadow-[0_2px_8px_rgba(0,0,0,0.1)]",
    hasCheckIn 
      ? cn(
          "relative overflow-hidden",
          stateColors[cell.outcome || ''],
          "shadow-lg"
        )
      : "bg-gradient-to-br from-muted/40 to-muted/20 border border-white/5"
  )}
>
  {hasCheckIn && (
    <>
      {/* Inner glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
      {/* Center dot */}
      <div className="w-2.5 h-2.5 rounded-full bg-white/50 shadow-sm" />
    </>
  )}
</div>
```

### 7.4 Luxury Progress Ring (For Stats)

Replace flat numbers with luxury circular indicators:

```tsx
// Luxury circular progress for streak/practices
<div className="relative w-20 h-20">
  {/* Outer glow ring */}
  <svg className="absolute inset-0 w-full h-full drop-shadow-lg">
    <defs>
      <linearGradient id="luxuryGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="hsl(var(--saffron))" stopOpacity="1" />
        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" />
      </filter>
    </defs>
    <circle 
      cx="40" cy="40" r="35" 
      fill="none" 
      stroke="url(#luxuryGradient)"
      strokeWidth="6"
      strokeDasharray={`${(value / max) * 220} 220`}
      strokeLinecap="round"
      transform="rotate(-90 40 40)"
      filter="url(#glow)"
    />
  </svg>
  <div className="absolute inset-0 flex items-center justify-center">
    <span className="text-2xl font-bold text-saffron">{value}</span>
  </div>
</div>
```

### 7.5 Luxury Bubble Styling (Mind Map)

Enhanced bubbles with glass morphism:

```tsx
<div
  className={cn(
    "rounded-full flex flex-col items-center justify-center text-center cursor-pointer",
    "bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5",
    "border border-primary/20",
    "shadow-[0_4px_20px_rgba(0,0,0,0.1),0_0_0_1px_rgba(255,255,255,0.1)_inset]",
    "backdrop-blur-sm",
    "hover:shadow-[0_8px_30px_rgba(0,0,0,0.15),0_0_20px_rgba(var(--primary),0.1)]",
    "hover:scale-105 transition-all duration-300"
  )}
>
  {/* Glass highlight */}
  <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent opacity-60" />
</div>
```

---

## Part 8: Implementation Summary

### New Components to Create

| Component | Purpose |
|-----------|---------|
| `LuxuryInsightCard.tsx` | Reusable luxury card wrapper with 3D effects |
| `BaselineReferenceCard.tsx` | Day 0+ baseline score display |
| `ProgressiveUnlockMessage.tsx` | Shows unlock conditions for locked insights |
| `LuxuryProgressRing.tsx` | Circular progress with gradient glow |

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Insights.tsx` | Add tier logic, baseline fetching, progressive visibility |
| `src/components/insights/EnergyRhythm.tsx` | Luxury cell styling, early data messages |
| `src/components/insights/InnerWorldBubbles.tsx` | Enhanced glass morphism bubbles |
| `src/components/insights/CalendarStateCorrelations.tsx` | Day 7+ gate |

### Data Tier Logic

```tsx
// Add to Insights.tsx
const insightsTier = useMemo(() => {
  if (checkInCount >= 7) return 'full';       // Day 7+: Full patterns
  if (checkInCount >= 4) return 'deepening';  // Day 4-6: Emerging insights
  if (checkInCount >= 3) return 'summary';    // Day 3: Factual summaries
  if (checkInCount >= 1) return 'early';      // Day 1-2: Comparisons
  return 'baseline';                           // Day 0: Onboarding only
}, [checkInCount]);
```

---

## Expected Visual Outcomes

1. **Day 0**: User sees their baseline score, archetype, and empty charts with "Start your journey" messaging
2. **Day 1-2**: First data points appear with luxury styling, compared to baseline
3. **Day 3**: Factual summaries without directional claims ("You felt Focused most often")
4. **Day 4-6**: Theme patterns emerge, Mind Map begins populating
5. **Day 7+**: Full correlations, trend arrows, calendar-state patterns unlock

All charts will have:
- Gradient fills with 3D depth
- Soft shadows and inner glows
- Glass morphism effects
- Smooth animations
- Baseline dotted reference lines
