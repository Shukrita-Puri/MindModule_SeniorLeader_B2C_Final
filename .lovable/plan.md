

# Insights Page — Tab Layout (Matching Homepage Design)

## Current Structure
The Insights page has 4 cards in a vertical scroll:
1. **Your Self Mastery Patterns** (LeadershipPatternsCard)
2. **Your Momentum** (Tiny Wins / Performance Log)
3. **Your Performance Rhythm** (PerformanceRhythmCard)
4. **Your Mind Map** (InnerWorldBubbles)

## New Structure — 3 Tabs

Same tab bar design as the homepage: sticky, `bg-background/95 backdrop-blur-md border-b border-white/[0.06]`, 3-col grid, active underline `bg-primary`.

| Tab | Label | Cards |
|-----|-------|-------|
| **Patterns** | Patterns | LeadershipPatternsCard |
| **Momentum** | Momentum | Your Momentum card + PerformanceRhythmCard |
| **Mind Map** | Mind Map | Your Mind Map card |

## Changes

### `src/pages/Insights.tsx`

1. **Add tab state**: `const [activeTab, setActiveTab] = useState<'patterns' | 'momentum' | 'mindmap'>('patterns');`

2. **Add sticky tab bar** below the hero banner — identical markup to `ExecutiveHome.tsx`:
   - Sticky `top-0 z-30`, `bg-background/95 backdrop-blur-md border-b border-white/[0.06]`
   - 3-col grid with labels: "Patterns", "Momentum", "Mind Map"
   - Active tab gets `text-foreground` + `h-0.5 bg-primary rounded-full` underline
   - Inactive: `text-muted-foreground hover:text-foreground/70`

3. **Wrap existing cards in tab panels** using `display: block/none` (same pattern as homepage — no unmount):
   - **Patterns tab**: `<LeadershipPatternsCard />` inside `px-4 max-w-lg mx-auto pt-4`
   - **Momentum tab**: Your Momentum `LuxuryInsightCard` + `<PerformanceRhythmCard />` inside same container with `space-y-6`
   - **Mind Map tab**: Your Mind Map `LuxuryInsightCard`

4. **Container**: Change `max-w-4xl` to `max-w-lg` to match homepage card width on mobile

5. **No content, text, or logic changes** — cards move into tab panels as-is

### Files touched
- `src/pages/Insights.tsx` — add tab state, tab bar, wrap cards in display-toggled panels

