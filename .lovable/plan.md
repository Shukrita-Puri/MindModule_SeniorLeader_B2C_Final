

# Insights Page Overhaul — C-Suite Performance Intelligence

8 tasks across 4 files. No database migrations.

---

## Task 1: Rename & Gate AI Observation — `LeadershipPatternsCard.tsx`

- Line 278: `"Your Self Mastery Patterns"` → `"Your Performance Patterns"` (title, InsightInfoModal title+explanation, error fallback line 292)
- Lines 296-306: Wrap AI observation with quality gate:
  ```tsx
  {data.aiObservation && data.checkInCount >= 7 && 
   (data.recurringThemes?.length > 0 || data.coachStrength) && (
  ```

## Task 2: Harden AI Prompt — `state-patterns-insights/index.ts`

- Line 465 system prompt: Append `"If the data is too sparse to name a specific, non-obvious pattern, respond with exactly the word 'null'. Do NOT generate generic statements about navigating challenges, recalibration, or renewal."`
- After line 491 (parsing): If `aiObservation === "null"` or word count < 10, set `aiObservation = null`
- Enrich recurring themes (line 271-273): Also query `daily_checkins` for `state_tags` (already fetched in checkInsRes), merge tag counts into `themeCounts` map before building `recurringThemes`

## Task 3: Redesign Momentum Card — `Insights.tsx` (lines 812-910)

Replace bubble chart with performance log per mockup. Keep title "Your Momentum".

**Header:** Two stat boxes — "X Wins this month" | "Y Under pressure"  
- "Under pressure" = wins where `regulation_level` is `managed`/`composed` or `primary_emotion` is `determination`/`relief`

**Insight bar** (≥3 wins): Pattern line reframed with C-suite language

**Win list** (up to 5 recent): Each shows color dot, win text (line-clamp-2), domain tag pill + date  
**Domain tag mapping** from existing `tiny_wins` fields:
- `agency_type: proactive/decisive` → Decision (purple)
- `primary_emotion: pride/confidence` → Leadership (blue)
- `regulation_level: managed/composed` → Resilience (green)
- `growth_signal: insight/progress` → Growth (amber)
- Default → Delivery (slate)

**Remove:** `PsychologicalDimensionBubbles`, `InnerWorldBubbles` renders, dimension text summaries. Move archived components to `src/components/_archived/`.

Keep data source line at bottom.

## Task 4: Lower Cause-Effect Thresholds — `PerformanceRhythmCard.tsx`

- Line 320: `insightCalendarEvents.length >= 3` → `>= 2`, `wearableData.length >= 5` → `>= 3`
- Line 345: `data.hrvs.length < 2` → `< 1`
- After line 361 (bestDeviation block): Add confidence qualifier:
  ```typescript
  if (bestDeviation && bestDeviation.count === 1) {
    causeEffectInsight = `Early signal: ${causeEffectInsight} (based on 1 occurrence — will validate over time)`;
  }
  ```

## Task 5: Add RHR to Path A — `PerformanceRhythmCard.tsx`

After HRV deviation block (~line 361), add RHR enrichment using `wearableData` (which already fetches `resting_heart_rate` at line 137):
- Build `rhrByDate` map, calculate `rhrBaseline` from all RHR readings
- For matched event type, collect event-day RHRs
- If `eventRHRs.length >= 1` and `|avgRHR - rhrBaseline| >= 3`, append to `causeEffectInsight`

## Task 6: Elevate Sharpest Window & Coach Impact — `PerformanceRhythmCard.tsx`

**Best Readiness Window** (lines 932-937):
- Move up to render after "How You Show Up" section (after line 810)
- Restyle as highlighted stat box with green gradient border
- Remove old footer rendering

**Coach Session Impact** (lines 826-830):
- When `causeEffectInsight` contains "coach" (case-insensitive), render in its own bordered section with "Coach Impact" label and primary gradient styling
- Otherwise render in default muted box

## Task 7: Heatmap → Rolling Weekly Calendar — `PerformanceRhythmCard.tsx`

Replace the 30-day composite 3×7 grid with a rolling weekly calendar view:

**Data model change** (lines 168-204): Instead of building a single composite grid, build an array of week objects:
```typescript
interface WeekRow {
  weekLabel: string;        // e.g. "This week", "Last week", "Mar 3-9"
  startDate: string;
  days: Array<{ date: string; dayLabel: string; outcome: string | null; compositeScore: number | null; divergence: boolean; isToday: boolean; isFuture: boolean }>;
}
```

Build 4 weeks of data (current week + 3 prior weeks). Current week shows Mon→today with future days greyed/empty. Each cell maps to a specific real date.

**UI change** (lines 854-918): Replace single grid with vertically stacked weeks:
- "This week" label + 7-cell row (future days muted)
- "Last week" label + 7-cell row
- 2 more prior weeks (scrollable or always visible)
- Keep same cell styling (gradient colors, composite score overlay, divergence ring)
- Keep "Your Week at a Glance" title
- Add small date range subtitle per week row

Keep existing legend unchanged.

## Task 8: Verify Upstream/Downstream Connections (Audit Only)

Verified during file reads:
- ✅ `state-patterns-insights` EF reads: `daily_checkins`, `daily_themes`, `user_coach_insights`, `profiles`, `wearable_data`, `sanctuary_events`, `daily_ritual_completions`, `tiny_wins`, `dialogue_sessions`, `calendar_connections`, `behavior_logs`, `inner_readiness_scores`
- ✅ `performance-rhythm-insights` EF: called from production path (line 704)
- ✅ `tiny-wins-insights` EF reads: `tiny_wins` (via edge function, line 395)
- ✅ `insights-semantic-analysis` EF reads: `dialogue_messages`, `tiny_wins`, `daily_checkins` (line 690)
- ✅ All write operations upstream — insights page is read-only
- ✅ DEV_MODE paths mirror production queries correctly

---

## Files Modified

| File | Changes |
|------|---------|
| `LeadershipPatternsCard.tsx` | Rename → "Performance Patterns"; gate AI observation on data quality |
| `state-patterns-insights/index.ts` | Harden prompt; null-gate sparse output; enrich themes with state_tags |
| `Insights.tsx` | Redesign Momentum → performance log; archive bubble components |
| `PerformanceRhythmCard.tsx` | Lower thresholds; add RHR; elevate sharpest window & coach impact; rolling weekly heatmap |

No database changes. Mind Map untouched.

