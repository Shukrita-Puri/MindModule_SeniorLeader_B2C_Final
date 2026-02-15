

# MIND Module — Insights Page v2.0 Redesign

## Overview

This is a major restructuring of the Insights page based on the final architecture document. The work covers **card renames + tooltip updates**, **card consolidation** (10 cards down to 6), **component cleanup**, and **security migrations** (moving client-side scoring logic to edge functions).

---

## Phase 1: Card Renames, Tooltips, and Structural Reorganization

### 1.1 Rename all card titles and tooltips in `src/pages/Insights.tsx`

| Current Name | New Name | New Tooltip |
|---|---|---|
| Your Starting Point (BaselineReferenceCard) | Your Leadership Blueprint | "Your foundation. This is who you are based on your onboarding assessment -- your mental fitness baseline, your archetype, and the component scores that define how you regulate, focus, and recover. Every other insight on this page is measured against this." |
| Your Progress This Week | *Remove entirely* (moved to homepage -- already lives there via `InsightProgressCard`) | -- |
| Typical State | *Absorb into Your Leadership Patterns* | -- |
| Practice Effectiveness | What Works For You | "The practices that actually move the needle for you -- not in general, but based on your own data. Drawn from your Recalibration sessions across Pause, Flow, and Renergise, correlated with your state the following day." |
| Strength and Friction | *Absorb into Your Leadership Patterns* | -- |
| Cause to Effect Patterns | *Absorb into Your Performance Rhythm* | -- |
| Theme Patterns | *Absorb into Your Leadership Patterns* | -- |
| Your Mind Map | Your Inner World | "The recurring themes, patterns, and preoccupations that surface across your check-ins, coaching sessions, and practices. Not what you reported on any single day -- what keeps coming up. The picture your data is painting of your inner world right now." |
| Your Tiny Wins | Your Momentum | "The wins you've logged over the past two weeks -- and what they reveal about your momentum, how you're showing up, and what you're building. At this level, few people reflect your progress back to you. This card does." |
| Your Energy Rhythm | Your Performance Rhythm | "When you perform, when you don't, and what your outer world is doing to your inner state. Your cognitive and emotional rhythm across the week -- paired with a read on which calendar conditions consistently lift or drain your readiness." |

### 1.2 Update `BaselineReferenceCard.tsx`
- Rename header from "Your Starting Point" to "Your Leadership Blueprint"
- Update tooltip text
- Fix archetype ID mismatch: add mapping for engine output IDs (`natural_regulator`, `strategic_pauser`, `high_octane_performer`, `awareness_builder`) to display names

### 1.3 Update page hero text
- Keep "Your Inner World" as page title (matches the document's naming)
- Update subtitle to match v2 positioning

---

## Phase 2: Card Consolidation (10 cards to 6)

### 2.1 Remove "Your Progress This Week" card
- Remove the `WeeklyRitualStreak` section from Insights page (it already lives on the homepage via `InsightProgressCard`)

### 2.2 Create new "Your Leadership Patterns" card
This card consolidates:
- **Typical State** (most common check-in outcome)
- **Strength and Friction** (coach insight pattern matching)
- **Theme Patterns** (recurring Compass themes)

New card displays:
- Archetype name + strength description
- 30-day composite score average + 7-day trend direction
- Most frequent check-in outcome (supporting line)
- Friction frequency with qualitative label
- Top 3 recurring Compass themes
- Coach insight excerpts (strength + friction quotes)
- AI-generated pattern observation (headline)

### 2.3 Restructure "Your Performance Rhythm" card
Absorbs:
- **Energy Rhythm** heatmap (renamed)
- **Calendar Correlations** (already merged in v1)
- **Cause-Effect Patterns** (as qualitative observation text, not a standalone card)
- **Behavior-Outcome Correlations** (as qualitative observation text)

Display structure:
- Qualitative insight observation box (top)
- 3x7 heatmap grid (morning/afternoon/evening x Mon-Sun)
- Best performance window line

### 2.4 Reorder cards to match v2 sequence
1. Your Leadership Blueprint
2. Your Leadership Patterns (new consolidated card)
3. What Works For You
4. Your Performance Rhythm (consolidated)
5. Your Inner World
6. Your Momentum

---

## Phase 3: Component Cleanup

### 3.1 Components to delete (no card home)
- `AlignmentTimeline.tsx`
- `CircadianGraph.tsx`
- `ContentTypeAnalysis.tsx`
- `DecisionQualityChart.tsx`
- `ElementalMandala.tsx`
- `EnergyDistributionChart.tsx`
- `EnergyGauge.tsx`
- `MentalFitnessScoreCard.tsx`
- `PracticeFocusBar.tsx`
- `LuxuryStateBar.tsx`

### 3.2 Components to retain (future use)
- `LuxuryProgressRing.tsx`
- `WeeklyRhythmHeatmap.tsx`
- `SemanticBubbles.tsx`
- `EnergyRhythmCurve.tsx`

---

## Phase 4: Progressive Unlock Update

Update tier gates in `Insights.tsx`:

| Tier | Check-ins | Cards Visible |
|---|---|---|
| baseline | 0 | Your Leadership Blueprint only |
| early | 1-2 | + Your Leadership Patterns, What Works For You summary |
| summary | 3 | + Your Momentum |
| deepening | 4-6 | + Your Performance Rhythm |
| full | 7+ | All cards including Your Inner World |

Your Inner World gate: 3+ coach sessions OR (5+ check-ins AND 2+ momentum entries) OR total data points 5+ (unchanged from v1).

---

## Phase 5: Security -- Edge Function Migrations

### 5.1 Update `state-patterns-insights` edge function
- Expand from 7-day to 30-day window
- Add composite score trend calculation (7-day avg vs prior 7-day avg)
- Add friction frequency calculation
- Add recurring theme aggregation (from `daily_themes`)
- Add coach insight pattern matching (from `user_coach_insights`)
- Return display-ready object for the new Leadership Patterns card

### 5.2 Update `insights-semantic-analysis` edge function
- Switch from direct Google API (`GEMINI_API_KEY`) to Lovable Gateway (`LOVABLE_API_KEY`) -- fixes v1 silent failure
- Reduce max bubbles from 12 to 8
- Reduce max relationship lines to 6
- Update AI prompt per v2 spec

### 5.3 Update `tiny-wins-insights` edge function
- Update AI observation prompt to speak to momentum and leadership
- Update dimension display labels (v2 C-suite language)

### 5.4 Create practice effectiveness calculation in edge function
- Move effectiveness scoring from `PracticeEffectiveness.tsx` client-side to a server-side calculation
- Add pillar-level effectiveness (Pause/Flow/Renergise)
- Add time-of-day split analysis
- Client receives ranked display list only

### 5.5 Strip client-side proprietary logic
- Remove `extractDimensionsFromText` and `extractThemesFromContent` usage from Insights.tsx (DEV_MODE path)
- All scoring flows through edge functions

---

## Files Modified

| File | Action |
|---|---|
| `src/pages/Insights.tsx` | Major restructure -- rename cards, reorder, consolidate, update progressive unlock |
| `src/components/insights/BaselineReferenceCard.tsx` | Rename to "Your Leadership Blueprint", fix archetype ID mismatch |
| `src/components/insights/InsightInfoModal.tsx` | No change (tooltip content passed as props) |
| `src/components/insights/PracticeEffectiveness.tsx` | Update header to "What Works For You", update tooltip |
| `src/components/insights/FrictionAndStrengthDetail.tsx` | Absorb into Leadership Patterns inline rendering |
| `src/components/insights/CauseEffectInsights.tsx` | Absorb into Performance Rhythm as qualitative text |
| `supabase/functions/state-patterns-insights/index.ts` | Expand to 30-day, add trend/friction/themes/coach insights |
| `supabase/functions/insights-semantic-analysis/index.ts` | Switch to Lovable Gateway, reduce bubbles to 8 |
| `supabase/functions/tiny-wins-insights/index.ts` | Update prompts for momentum language |
| 10 orphaned components | Delete |

---

## Implementation Order

1. Card renames + tooltip updates (quick wins, immediate visual impact)
2. Remove Weekly Progress Streak from Insights
3. Create Leadership Patterns consolidated card
4. Restructure Performance Rhythm card
5. Update progressive unlock tiers
6. Edge function updates (state-patterns-insights, insights-semantic-analysis, tiny-wins-insights)
7. Delete orphaned components
8. Strip client-side proprietary logic from DEV_MODE paths

