

# Your Readiness Rhythm -- Full Rebuild

This plan covers three major workstreams: (1) styling the Mind Map chart circles/lines to taupe, (2) renaming and fully rebuilding the Performance Rhythm card into "Your Readiness Rhythm" with the complete spec, and (3) rewriting the edge function to pull from all correct tables.

---

## 1. Mind Map Bubble Chart -- Taupe Circles and Lines

**File:** `src/components/insights/InnerWorldBubbles.tsx`

- Change node circle `fill` from `hsl(var(--muted-foreground))` to taupe (`#8B7D6B`)
- Change connection line `stroke` from `hsl(var(--muted-foreground))` to taupe (`#8B7D6B`)

---

## 2. Rename Card: "Your Performance Rhythm" to "Your Readiness Rhythm"

**File:** `src/components/insights/PerformanceRhythmCard.tsx`

- Update all title/heading text from "Your Performance Rhythm" to "Your Readiness Rhythm"
- Update the `InsightInfoModal` explanation text to match the new purpose statement

---

## 3. Heatmap Cell Colors -- Match Daily Check-In Carousel

The current heatmap uses generic green/blue/amber/slate/red gradients. The spec requires matching the carousel card gradients from `/dailycheckin`:

| Outcome | Carousel Gradient | New Heatmap Gradient |
|---|---|---|
| Focused | `from-green-800/90 to-yellow-500/90` | `from-green-800 to-yellow-500` |
| Steady | `from-amber-700/90 to-yellow-200/90` | `from-amber-700 to-yellow-200` |
| Scattered | `from-teal-700/90 to-emerald-300/90` | `from-teal-700 to-emerald-300` |
| Drained | `from-slate-700/90 to-gray-400/90` | `from-slate-700 to-gray-400` |
| Overwhelmed | `from-red-800/90 to-amber-600/90` | `from-red-800 to-amber-600` |

**File:** `src/components/insights/PerformanceRhythmCard.tsx` -- update the `stateColors` object

---

## 4. Edge Function -- Full Rewrite to Match Spec v2.0

**File:** `supabase/functions/performance-rhythm-insights/index.ts`

The current edge function only queries `daily_checkins`, `calendar_connections`, `calendar_events`, and `behavior_logs`. The spec requires it to also query:

- `inner_readiness_scores` -- for composite scores and energy tiers (used in heatmap overlay, "How You Show Up", calendar correlations, and best window)
- `daily_ritual_completions` -- for pre-event session completion counting ("How You Show Up")
- `dialogue_messages` -- for coach presence keyword mining ("How You Show Up")

### New Response Payload Structure

```text
{
  presenceScore, presenceLabel, presenceInsight,   // "How You Show Up"
  calendarInsight,                                  // Calendar Pattern
  causeEffectInsight,                               // Cause-Effect
  grid (3x7 with outcome, compositeScore, divergence),
  bestReadinessWindow,
  checkInCount, behaviorLogCount, hasCalendar, dataSourceNote
}
```

### Calculation Logic Added

**Element 1A -- How You Show Up (new)**
- Identify high-stakes events via expanded keyword list (30 keywords vs current 15)
- Score pre-event session completions from `daily_ritual_completions`
- Score high-stakes events on depleted days from `inner_readiness_scores`
- Mine `dialogue_messages` for positive/negative presence keywords
- Check if high-stakes events energize (next-day composite score boost)
- Calculate composite presence score (0-100) and assign qualitative label
- Generate supporting insight from dominant signal
- Minimum threshold: 10 or more check-ins AND (2+ high-stakes events OR 3+ coach sessions)

**Element 1B -- Calendar Pattern (upgraded)**
- Use `inner_readiness_scores.composite_score` instead of just `energy_balance`
- Categorize events by type keywords (10 categories vs current flat list)
- Calculate avg composite score per event type, sort by draining/energizing

**Element 1C -- Cause-Effect (existing, minor refinement)**
- Keep current behavior-to-outcome logic
- Add behavior log count to response metadata

**Element 2 -- Heatmap (upgraded)**
- Use `inner_readiness_scores` for composite score overlay (30-day avg per cell)
- Flag divergence when felt-state vs composite delta is 20 or more points (expanded from just "focused < 50")

**Element 3 -- Best Readiness Window (upgraded)**
- Use `inner_readiness_scores` composite scores instead of `energy_balance`
- Require 2 or more data points per cell

**Element 4 -- Data Source Note (new)**
- Generate string: "Based on N check-ins, M behavior logs, calendar data over X days"

### Progressive Unlock Thresholds
- 0-6 check-ins: empty heatmap + prompt
- 7-9: heatmap + best window
- 10-14: + calendar pattern + cause-effect
- 15+: + "How You Show Up" + composite overlay

---

## 5. Frontend Card -- Full Rebuild

**File:** `src/components/insights/PerformanceRhythmCard.tsx`

### Updated Data Interface

```text
PerformanceRhythmData {
  presenceScore, presenceLabel, presenceInsight,
  calendarInsight, causeEffectInsight,
  grid: 3x7 array with outcome/compositeScore/divergence,
  bestReadinessWindow: { timeWindow, day, avgScore, label },
  checkInCount, behaviorLogCount, hasCalendar, dataSourceNote,
  // Backward compat fields kept for DEV_MODE
  heatmap, bestWindow, observations
}
```

### New Card Layout Sections (top to bottom)

1. **"How You Show Up" box** -- presence label + insight text (only when presenceScore exists)
2. **Calendar Pattern Observation** -- calendarInsight text
3. **Cause-Effect Observation** -- causeEffectInsight text
4. **"Your Week at a Glance" heatmap** -- 3x7 grid with carousel-matching colors
5. **Best Readiness Window** -- one-line sharpest window insight
6. **Data Source Note** -- transparent accounting line

### Progressive Unlock in UI
- Show prompt if checkInCount < 7
- Show heatmap from 7+
- Show insights from 10+
- Show "How You Show Up" from 15+

---

## 6. DEV_MODE Parity

The DEV_MODE local computation in PerformanceRhythmCard will be updated to match the new data shape, querying `inner_readiness_scores`, `daily_ritual_completions`, and approximating `dialogue_messages` keyword mining locally.

---

## Summary of Files Changed

| File | Change |
|---|---|
| `src/components/insights/InnerWorldBubbles.tsx` | Taupe circles and lines |
| `src/components/insights/PerformanceRhythmCard.tsx` | Full rebuild: rename, new layout, carousel colors, new data interface |
| `supabase/functions/performance-rhythm-insights/index.ts` | Full rewrite: "How You Show Up", expanded calendar patterns, composite score overlay, data source note |

