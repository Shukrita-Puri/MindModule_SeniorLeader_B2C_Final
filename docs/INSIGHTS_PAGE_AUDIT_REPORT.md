# Insights Page — Full Technical Audit Report

**Date**: February 13, 2026  
**Scope**: `/insights` route — all cards, data sources, calculation logic, AI usage, redundancies  
**File**: `src/pages/Insights.tsx` (993 lines) + 26 component files in `src/components/insights/`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Page Architecture Overview](#2-page-architecture-overview)
3. [Progressive Unlock System](#3-progressive-unlock-system)
4. [Card-by-Card Deep Dive](#4-card-by-card-deep-dive)
   - 4.1 [Baseline Reference Card](#41-baseline-reference-card)
   - 4.2 [Weekly Progress Streak](#42-weekly-progress-streak)
   - 4.3 [Practice Effectiveness](#43-practice-effectiveness)
   - 4.4 [Typical State](#44-typical-state)
   - 4.5 [Strength & Friction](#45-strength--friction)
   - 4.6 [Cause-Effect Patterns](#46-cause-effect-patterns)
   - 4.7 [Theme Patterns](#47-theme-patterns)
   - 4.8 [Mind Map (Your Inner World)](#48-mind-map-your-inner-world)
   - 4.9 [Tiny Wins (Psychological Dimensions)](#49-tiny-wins-psychological-dimensions)
   - 4.10 [Energy Rhythm + Calendar Correlations](#410-energy-rhythm--calendar-correlations)
5. [Unused/Orphaned Components](#5-unusedorphaned-components)
6. [AI vs Pure Logic Matrix](#6-ai-vs-pure-logic-matrix)
7. [Data Flow Architecture](#7-data-flow-architecture)
8. [Security Audit](#8-security-audit)
9. [Bug Report & Correctness Issues](#9-bug-report--correctness-issues)
10. [Redundancy Analysis](#10-redundancy-analysis)
11. [Recommendations](#11-recommendations)
12. [Appendix: Edge Function Reference](#12-appendix-edge-function-reference)

---

## 1. Executive Summary

The Insights page renders **10 active cards** organized in a vertically-scrolled layout. Data flows from **6 database tables** through a mix of **3 edge functions** and **7 client-side direct queries**. AI is used in **3 pipelines** (State Patterns observation, Tiny Wins dimension extraction, Semantic Analysis theme extraction), with keyword-based fallbacks in all cases.

### Critical Findings

| # | Finding | Severity |
|---|---------|----------|
| 1 | **Mental Fitness Score card uses localStorage, not database** — device-specific, easily lost | 🔴 Critical |
| 2 | **Archetype ID mismatch** between `BaselineReferenceCard` and `userArchetypeEngine.ts` | 🔴 Critical |
| 3 | **`insights-semantic-analysis` uses `GEMINI_API_KEY`** (not configured in secrets) — coach theme extraction fails silently in production | 🔴 Critical |
| 4 | 7 of 10 cards run correlation/scoring logic client-side, exposing proprietary algorithms | 🟡 Medium |
| 5 | `BehaviorOutcomeCorrelations` is imported but renders identical logic to `CauseEffectInsights` | 🟡 Medium |
| 6 | 14 component files in `src/components/insights/` are orphaned (not rendered on page) | 🟢 Low |

---

## 2. Page Architecture Overview

### File Structure

```
src/pages/Insights.tsx                          — Page orchestrator (993 lines)
src/components/insights/
  ├── BaselineReferenceCard.tsx                  — Onboarding baseline display
  ├── BehaviorOutcomeCorrelations.tsx            — Behavior→State correlations (IMPORTED BUT RENDERED)
  ├── CalendarStateCorrelations.tsx              — Calendar→State correlations
  ├── CauseEffectInsights.tsx                    — "When X, you tend to Y" patterns
  ├── EnergyRhythm.tsx                           — Time-of-day × day-of-week heatmap
  ├── FrictionAndStrengthDetail.tsx              — Archetype strength/growth areas
  ├── InnerWorldBubbles.tsx                      — Mind Map bubble visualization
  ├── InsightInfoModal.tsx                       — Info (?) modal for each card
  ├── LuxuryInsightCard.tsx                      — Glass-morphism card wrapper
  ├── MentalFitnessScoreCard.tsx                 — Score display (NOT currently rendered on /insights)
  ├── PracticeEffectiveness.tsx                  — Top restorer practice
  ├── ProgressiveUnlockMessage.tsx               — Lock/unlock progress indicator
  ├── PsychologicalDimensionBubbles.tsx          — Tiny Wins dimension bubbles
  └── [14 other orphaned files]
```

### Data Fetching Flow

```
Insights.tsx mounts
  ├── fetchInsightsData()          → direct Supabase: daily_checkins, sanctuary_events (7 days)
  ├── fetchTinyWinsInsights()      → DEV: direct Supabase | PROD: tiny-wins-insights edge fn
  ├── fetchStatePatterns()         → DEV: direct Supabase | PROD: state-patterns-insights edge fn
  ├── fetchSemanticAnalysis()      → DEV: direct Supabase | PROD: insights-semantic-analysis edge fn
  └── fetchProfileBaseline()       → direct Supabase: profiles table
```

All fetches trigger on `user?.id` change (line 168-176).

### Component Data Passing

The page fetches centralized data and distributes it:

| Component | Data Passed | Fetched Internally |
|-----------|------------|-------------------|
| BaselineReferenceCard | `profileBaseline` prop | No |
| WeeklyRitualStreak | None (self-fetching) | Yes — `daily-rituals` edge fn |
| PracticeEffectiveness | `userId` prop | Yes — direct Supabase |
| Typical State | Uses `mostCommonState` from parent state | No |
| FrictionAndStrengthDetail | `userId`, `profileBaseline` props | Yes — direct Supabase |
| CauseEffectInsights | `userId` prop | Yes — direct Supabase |
| Theme Patterns | Uses `semanticAnalysis` from parent state | No |
| InnerWorldBubbles | `items`, `relationships` from parent state | No (click details via prop callback) |
| PsychologicalDimensionBubbles | `data`, `relatedWins` from parent state | No |
| EnergyRhythm | `checkIns` prop from parent state | No |
| CalendarStateCorrelations | `userId` prop | Yes — direct Supabase |
| BehaviorOutcomeCorrelations | `userId` prop | Yes — direct Supabase |

---

## 3. Progressive Unlock System

The page implements a **tiered unlock system** based on total check-in count (line 132-138):

```typescript
const insightsTier: InsightsTier = useMemo(() => {
  if (checkInCount >= 7) return 'full';
  if (checkInCount >= 4) return 'deepening';
  if (checkInCount >= 3) return 'summary';
  if (checkInCount >= 1) return 'early';
  return 'baseline';
}, [checkInCount]);
```

### Tier → Visible Cards Matrix

| Card | baseline (0) | early (1-2) | summary (3) | deepening (4-6) | full (7+) |
|------|:---:|:---:|:---:|:---:|:---:|
| Baseline Reference | ✅ | ✅ | ✅ | ✅ | ✅ |
| Weekly Progress | ✅ | ✅ | ✅ | ✅ | ✅ |
| Practice Effectiveness | ✅ | ✅ | ✅ | ✅ | ✅ |
| Typical State | ✅ | ✅ | ✅ | ✅ | ✅ |
| Strength & Friction | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cause-Effect | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Theme Patterns** | ❌ | ❌ | ❌ | ✅ | ✅ |
| Mind Map | ✅* | ✅* | ✅* | ✅* | ✅* |
| Tiny Wins | ✅ | ✅ | ✅ | ✅ | ✅ |
| Energy Rhythm | ✅ | ✅ | ✅ | ✅ | ✅ |

\* Mind Map has its own readiness gate: `mindMapReady` (line 162-166) — requires ≥3 coach sessions OR (≥5 check-ins AND ≥2 wins) OR total data points ≥5.

### ProgressiveUnlockMessage Component

Used when a card is locked. Shows:
- Lock icon with saffron glow
- Feature name + "Unlocks in X more days of check-ins"
- Progress bar (0-100%) + dot indicators
- Preview text

**Currently NOT used** on the actual Insights page — the component exists but no card on the page calls it. The Theme Patterns card simply doesn't render (conditional `{(insightsTier === 'deepening' || insightsTier === 'full') && ...}`).

---

## 4. Card-by-Card Deep Dive

---

### 4.1 Baseline Reference Card

**File**: `src/components/insights/BaselineReferenceCard.tsx` (117 lines)  
**Position**: Top of page, always visible  
**Data Location**: Client-side (receives prop)  
**AI Usage**: None

#### Data Source

```
profiles table → mental_fitness_baseline, component_scores, user_archetype, 
                  onboarding_completed_at, growth_priority
```

Fetched in `Insights.tsx` line 178-204 via `fetchProfileBaseline()` — direct Supabase query.

#### Calculation

No calculation. Pure display of stored onboarding values:
- `baselineScore` = `profile.mental_fitness_baseline` (integer 0-100, set during onboarding)
- `archetypeLabel` = lookup from hardcoded map (line 18-24)
- `establishedDate` = formatted `onboarding_completed_at`

#### Display Logic

Renders a circular SVG progress ring:
```typescript
strokeDasharray = (baselineScore / 100) * 201  // 201 = circumference of r=32 circle
```

Returns `null` if `mentalFitnessBaseline` is falsy (line 27-29).

#### 🔴 BUG: Archetype ID Mismatch

The `archetypeLabels` map in this file uses these IDs:
```
'grounded-leader', 'resilient-performer', 'adaptive-navigator', 
'mindful-strategist', 'balanced-achiever'
```

But `userArchetypeEngine.ts` generates these IDs:
```
'natural_regulator', 'strategic_pauser', 'high_octane_performer', 'awareness_builder'
```

**Result**: The archetype label always falls back to `'Your Profile'` (line 33) because no ID ever matches. The correct archetype name is never displayed.

#### Qualitative AI Opportunity

This card could use AI to generate a personalized "since onboarding" narrative: *"Since your baseline of 62 on Jan 15, you've completed 34 practices and checked in 28 times. Your energy regulation appears to be strengthening."*

---

### 4.2 Weekly Progress Streak

**File**: `src/components/home/WeeklyRitualStreak.tsx` (127 lines)  
**Position**: Second card  
**Data Location**: Edge function (`daily-rituals`)  
**AI Usage**: None

#### Data Source

```
daily_ritual_completions table → ritual_date, completion_status, 
  soundscape_completed, guided_practice_completed, micro_exercise_completed,
  completed_practice_ids, recommended_practices_count
```

Fetched via `getRitualRange(startDate, endDate)` utility which calls the `daily-rituals` edge function.

#### Calculation

For each day Monday-Sunday of the current week:

```typescript
// Boolean completion count
const booleanCount = [
  completion.soundscape_completed,
  completion.guided_practice_completed,
  completion.micro_exercise_completed
].filter(Boolean).length;

// Also count IDs (for coach sessions, other practices)
const idsCount = (completion.completed_practice_ids || []).length;
const effectiveCompleted = Math.max(booleanCount, idsCount);
const totalRecommended = completion.recommended_practices_count || 3;

// Status determination
if (completion_status === 'full' && effectiveCompleted >= totalRecommended && effectiveCompleted > 0) {
  status = 'full';    // Gold circle with checkmark
} else if (effectiveCompleted > 0 || completion_status === 'partial') {
  status = 'partial'; // Taupe circle with star
} else {
  status = 'skipped'; // Empty circle
}
```

Future days get dashed border. Today gets a saffron ring + pulse animation.

#### Refresh Rate

- `staleTime`: 60 seconds
- `refetchInterval`: 30 seconds (polls)

#### Correctness Assessment

✅ **Correct**. The logic properly handles edge cases:
- Uses `Math.max(booleanCount, idsCount)` to account for different completion tracking methods
- Strict check requires BOTH `completion_status === 'full'` AND actual completions > 0
- Uses `toLocaleDateString('en-CA')` for consistent YYYY-MM-DD format regardless of timezone

---

### 4.3 Practice Effectiveness

**File**: `src/components/insights/PracticeEffectiveness.tsx` (183 lines)  
**Position**: Left 2/3 of a 3-column grid  
**Data Location**: Client-side (direct Supabase queries)  
**AI Usage**: None

#### Data Sources

```
sanctuary_events table → content_id, category, timestamp (event_type = 'completed')
daily_checkins table   → checkin_date, outcome
sanctuary_content table → id, title, category
```

All three queried in parallel within the component (lines 43-74), last 30 days.

#### Calculation: Effectiveness Rate

```typescript
effectivenessRate = improvedAfter / timesUsed
```

Where "improved" is defined as:

1. Practice completed on day X
2. Check-in on day X+1 has outcome in `positiveStates = {'focused', 'steady'}`
3. **OR** day X check-in was NOT positive but day X+1 IS positive

```typescript
// Lines 103-112
if (nextDayCheckin) {
  const nextOutcome = nextDayCheckin.outcome?.toLowerCase();
  const sameOutcome = sameDayCheckin?.outcome?.toLowerCase();

  if (nextOutcome && positiveStates.has(nextOutcome)) {
    effect.improvedAfter++;  // Next day is positive = improvement
  } else if (nextOutcome && sameOutcome &&
             !positiveStates.has(sameOutcome) && positiveStates.has(nextOutcome)) {
    effect.improvedAfter++;  // Transition from negative to positive
  }
}
```

**⚠️ Logic Issue**: The second condition (lines 109-111) can never be true because it requires `positiveStates.has(nextOutcome)` which was already checked in the first condition. If the first `if` already catches all positive next-day outcomes, the `else if` never fires. This second branch is **dead code**.

#### Selection Criteria

- Minimum 2 uses of a practice to qualify
- If tie on effectiveness rate, higher usage count wins
- Displays only the single top practice

#### Display

If top practice found:
```
[Practice Title]
Used X× · Y% followed by improved state
"Your top restorer"
```

If practices exist but none qualifies: shows total practice count.  
If no practices: shows empty state icon.

#### Qualitative AI Opportunity

Could use AI to explain WHY this practice works: *"Box Breathing appears to activate your parasympathetic nervous system — 80% of the time you complete it, your next-day state improves to Focused or Steady."*

---

### 4.4 Typical State

**File**: Inline in `Insights.tsx` (lines 719-740)  
**Position**: Right 1/3 of the 3-column grid  
**Data Location**: Client-side (derived from fetched state)  
**AI Usage**: None

#### Calculation

```typescript
const mostCommonState = useMemo(() => {
  const entries = Object.entries(statePatterns.distribution);
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : null;
}, [statePatterns]);
```

Simply picks the state with the highest count from the 7-day distribution. If all counts are 0, returns null (displays "—").

#### Supplementary: Today vs Yesterday

For `early` tier only (1-2 check-ins), shows today and yesterday states side by side:

```typescript
const todayAndYesterdayStates = useMemo(() => {
  const sorted = [...checkInsWithTimestamp].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  return { today: sorted[0]?.outcome, yesterday: sorted[1]?.outcome };
}, [checkInsWithTimestamp]);
```

#### Correctness Assessment

✅ **Correct** but simplistic. A tie between two states arbitrarily picks whichever `sort` returns first (unstable sort behavior).

---

### 4.5 Strength & Friction

**File**: `src/components/insights/FrictionAndStrengthDetail.tsx` (183 lines)  
**Position**: Full-width card  
**Data Location**: Client-side (direct Supabase queries + archetype engine)  
**AI Usage**: None (but uses coach insights from database)

#### Data Sources

```
profiles table             → component_scores, user_archetype (via prop)
daily_checkins table       → outcome (last 30 days)
user_coach_insights table  → insight_content, insight_type (last 10)
```

#### Calculation

**Archetype Determination** (line 46-61):

If `profileBaseline.componentScores` exists, calls `determineArchetype(scores)` from `userArchetypeEngine.ts`:

```typescript
// userArchetypeEngine.ts logic:
avgScore = (q2_energy_regulation + q3_focus_recovery + q4_energy_renewal) / 3

if avgScore >= 80 → 'natural_regulator' (strengthArea: 'Comprehensive Self-Regulation')
if q3 >= 75 && q5 >= 75 → 'strategic_pauser' (strengthArea: 'Focus Recovery & Composure')
if q2 <= 50 && q4 >= 70 → 'high_octane_performer' (strengthArea: 'Energy Renewal')
else → 'awareness_builder' (strengthArea: 'Growth Awareness')
```

**Friction Frequency** (lines 72-78):

```typescript
const lowStates = checkIns.filter(c => 
  ['drained', 'overwhelmed', 'scattered'].includes(c.outcome?.toLowerCase() || '')
);
frictionPct = Math.round((lowStates.length / totalCheckins) * 100);
```

**Coach Insight Matching** (lines 80-101):

Searches last 10 `user_coach_insights` records for keyword matches:
- **Strength keywords**: 'strength', 'strong', 'excel', 'good at', 'natural', 'talent', 'composure', 'resilient'
- **Friction keywords**: 'struggle', 'challenge', 'difficult', 'pattern', 'tends to', 'watch for', 'avoid', 'friction'

First matching insight is displayed as a coach quote.

#### Correctness Assessment

⚠️ **Partially correct**. The archetype determination works but:
- If `componentScores` doesn't exist but `userArchetype` does, the fallback (line 50-61) creates a minimal archetype with hardcoded `strengthArea: 'Self-Regulation'` and `growthArea: 'Energy Management'` regardless of actual archetype type
- The keyword matching for coach insights is very basic — "I feel strong today" would match the "strength" keyword and show as a strength insight even if it's contextually about physical strength

#### Qualitative AI Opportunity

This is a prime candidate for AI-generated narrative: *"As a Strategic Pauser, your composure under pressure is your superpower. However, your check-ins show 35% low-state days this month, suggesting your energy regulation needs attention before high-stakes events."*

---

### 4.6 Cause-Effect Patterns

**File**: `src/components/insights/CauseEffectInsights.tsx` (227 lines)  
**Position**: Full-width card  
**Data Location**: Client-side (direct Supabase queries)  
**AI Usage**: None

#### Data Sources

```
behavior_logs table    → behavior_type, created_at (last 30 days)
daily_checkins table   → checkin_date, outcome (last 30 days)
sanctuary_events table → content_id, category, timestamp (completed, last 30 days)
```

All three fetched in parallel via `Promise.all` (lines 60-77).

#### Calculation: Two Correlation Types

**Type 1: Behavior → Outcome** (lines 83-123)

```
For each behavior_log:
  1. Get behavior date
  2. Find all check-ins where diff = 0 or 1 days (same day or next day)
  3. Group by (behavior_type → outcome_state) and count occurrences
  4. For each behavior_type:
     - total = sum of all outcome counts
     - confidence = maxCount / total
     - Filter: total >= 2 AND confidence >= 0.5
```

**Type 2: Practice Category → Next-Day Outcome** (lines 126-162)

```
For each completed sanctuary_event:
  1. Get practice date
  2. Find check-in on NEXT DAY (exact match, not same day)
  3. Group by (category → next_day_outcome) and count
  4. Same filter: total >= 2 AND confidence >= 0.5
```

#### Output Format

```
"When you [Confronted] in events, you tend to check in [Focused] 85% of the time (4 occurrences)"
"When you complete [Pause] practices, you tend to check in [Steady] 67% of the time (3 occurrences)"
```

Sorted by confidence descending, then occurrences. Max 6 patterns shown.

#### Correctness Assessment

✅ **Mostly correct**. However:
- The temporal window for behaviors (0-1 days) means a behavior on Monday could correlate with BOTH Monday and Tuesday check-ins, potentially double-counting
- Practice correlations only look at next-day (not same-day), which means an evening practice won't correlate with that day's morning check-in
- No deduplication: if a user does 3 practices on the same day, each creates a separate correlation with the next day's check-in

#### Qualitative AI Opportunity

AI could explain the mechanism: *"Your pattern of checking in Focused after Confronting suggests healthy engagement. Confrontation activates your regulatory systems, and your post-event processing is effective."*

---

### 4.7 Theme Patterns

**File**: Inline in `Insights.tsx` (lines 776-833)  
**Position**: Full-width card, **only visible at tier `deepening` (4+) or `full` (7+)**  
**Data Location**: Edge function (`insights-semantic-analysis`)  
**AI Usage**: **Yes** — Gemini AI for coach theme extraction (production); keyword-based fallback (dev)

#### Data Source

In **production**, the `insights-semantic-analysis` edge function aggregates from:
```
daily_themes table          → theme_phrase, theme_driver
dialogue_messages table     → content (user messages from coach sessions)
sanctuary_events table      → category, tags (completed practices)
tiny_wins table            → win_content
daily_checkins table       → outcome, state_tags
```

In **DEV_MODE** (lines 452-588 of Insights.tsx), themes are extracted client-side:
- Coach messages: `extractThemesFromContent()` keyword matching
- Wins: same keyword matching
- Check-ins: outcome → theme mapping (`focused` → `focus`, `drained` → `energy`, etc.)

#### Calculation

**Theme Pattern Aggregation** (edge function lines 120-128):
```
For each daily_theme record:
  Group by theme_phrase → count occurrences
  Sort descending, take top 6
```

**Driver Summary**: Counts which driver (state, calendar+state, time+state) appears most.

#### Display

Renders theme phrases as pills: `"Steady under pressure" (3x)` with a "Most common driver" summary line.

#### 🔴 BUG: GEMINI_API_KEY Not Configured

The `insights-semantic-analysis` edge function (line 152) uses `GEMINI_API_KEY`:
```typescript
const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
```

This secret is **NOT in the configured secrets list**. The function has `LOVABLE_API_KEY` available but the code checks for `GEMINI_API_KEY`. This means:
- Coach theme extraction via AI **silently fails** in production
- The function falls through to algorithmic theme generation only
- No error is thrown — the code simply skips the AI block

**Fix**: Either add `GEMINI_API_KEY` to secrets, or refactor to use `LOVABLE_API_KEY` with the Lovable AI gateway (which the other edge functions already use).

---

### 4.8 Mind Map (Your Inner World)

**File**: `src/components/insights/InnerWorldBubbles.tsx` (486 lines)  
**Position**: Full-width card  
**Data Location**: Parent state (from `fetchSemanticAnalysis()`)  
**AI Usage**: **Indirect** — consumes AI-extracted themes from edge function

#### Data Flow

```
Insights.tsx fetches semanticAnalysis → passes unifiedThemes + themeRelationships
InnerWorldBubbles renders bubbles + SVG connection lines
Click handler calls fetchBubbleDetails() → insights-semantic-analysis edge fn (action: 'getBubbleDetails')
```

#### Bubble Sizing

```typescript
const getBubbleSize = (weight: number) => {
  const minSize = 64;   // px
  const maxSize = 110;  // px
  return minSize + (weight * (maxSize - minSize));
};
// weight is normalized: count / maxCount (0 to 1)
```

Max 12 bubbles displayed (line 119).

#### Connection Lines (SVG)

Connections are drawn between related themes using quadratic Bézier curves:
```typescript
// For each relationship pair:
path = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
// Opacity = 0.25 + strength * 0.25 (range: 0.25 to 0.5)
```

Positions are tracked via `ResizeObserver` and `getBoundingClientRect()`.

**Relationship sources**:
- **AI-generated**: Gemini extracts semantic relationships from coach messages
- **Algorithmic fallback**: Edge function matches against hardcoded semantic pairs (e.g., `stress↔grounding`, `overwhelm↔calm & regulate`)
- **DEV_MODE**: Client-side generates relationships based on shared data sources + semantic pair lookup (lines 540-578)

#### Bubble Click → Detail Modal

When clicked, the modal shows:
1. Theme name + mention count
2. Source breakdown (e.g., "3 coach, 2 wins, 1 check-in")
3. **Hardcoded insight** from `THEME_INSIGHTS` map (15 predefined themes, line 52-68)
4. Recent mentions (fetched from edge function)
5. "Explore with Coach" button → navigates to `/coach` with pre-filled prompt

#### Readiness Gate

```typescript
const mindMapReady = useMemo(() => {
  const coachSessions = semanticAnalysis?.unifiedThemes?.reduce(
    (sum, t) => sum + t.sources.coach, 0) || 0;
  const totalPoints = checkInCount + (tinyWinsInsights?.winsCount || 0) + coachSessions;
  return coachSessions >= 3 || 
         (checkInCount >= 5 && (tinyWinsInsights?.winsCount || 0) >= 2) ||
         totalPoints >= 5;
}, [semanticAnalysis, checkInCount, tinyWinsInsights]);
```

If not ready, shows: *"Your Mind Map builds from coach conversations, practices, and wins."*

#### Qualitative AI Opportunity

The current insights are hardcoded per theme keyword. AI could generate contextual insights: *"'Focus' and 'Energy' appear together in 4 of your coach conversations this week. This co-occurrence suggests you're working on sustaining attention through better energy management."*

---

### 4.9 Tiny Wins (Psychological Dimensions)

**File**: `src/components/insights/PsychologicalDimensionBubbles.tsx` (391 lines)  
**Position**: Full-width card  
**Data Location**: DEV: direct Supabase + client-side extraction | PROD: `tiny-wins-insights` edge fn  
**AI Usage**: **Yes** — Gemini AI for dimension extraction in production

#### Data Source

```
tiny_wins table → win_content, win_date, sentiment, primary_emotion, secondary_emotion, 
                   agency_type, regulation_level, growth_signal, analyzed_at
```

Last 14 days.

#### Dimension Extraction Pipeline

**Production flow** (edge function `tiny-wins-insights`):

```
1. Fetch wins where analyzed_at IS NULL
2. For each unanalyzed win:
   a. If LOVABLE_API_KEY exists → call Gemini AI with structured tool_choice:
      Extract: sentiment, primary_emotion, secondary_emotion, agency_type, 
               regulation_level, growth_signal
   b. Else → keyword-based extraction (DIMENSION_PATTERNS)
3. Update win record with extracted dimensions + analyzed_at timestamp
4. Re-fetch all wins and aggregate dimension counts
5. Return: { dimensions: [{dimension, value, count}], themes, summary, winsCount }
```

**DEV_MODE flow** (Insights.tsx lines 310-377):

```
1. Fetch wins with all dimension columns
2. For each win:
   a. If DB dimensions populated → use them directly
   b. Else → extractDimensionsFromText() client-side keyword matching
3. Aggregate dimension counts across all wins
```

#### Dimension Categories & Values

| Dimension | Possible Values | Extraction Method |
|-----------|----------------|-------------------|
| sentiment | positive, negative, mixed, neutral | Keywords or AI |
| emotion | joy, pride, relief, gratitude, confidence, hope, courage | Keywords or AI |
| agency | proactive, responsive, collaborative, supported | Keywords or AI |
| regulation | regulated, intentional, reactive | Keywords or AI |
| growth | learning, breakthrough, mastery, resilience, boundary, letting-go | Keywords or AI |

#### Bubble Visualization

```typescript
const getBubbleSize = (count: number, maxCount: number) => {
  const minSize = 48;
  const maxSize = 88;
  const ratio = maxCount > 1 ? count / maxCount : 1;
  return minSize + (ratio * (maxSize - minSize));
};
```

Max 12 bubbles. Color-coded by dimension type (emerald=sentiment, rose=emotion, sky=agency, violet=regulation, gold=growth).

#### Click → Detail Modal

Shows:
1. Dimension label + value
2. **Hardcoded psychological insight** from `DIMENSION_INSIGHTS` map (functions that generate text based on value and count)
3. Related wins (filtered to exclude generic content < 20 chars or matching `GENERIC_PATTERNS`)
4. "Explore with Coach" button

#### Correctness Assessment

✅ **Correct**. The pipeline properly:
- Avoids re-analyzing already-analyzed wins (`analyzed_at` check)
- Falls back gracefully from AI to keyword matching
- Stores dimensions back to DB so they don't need re-extraction
- Handles both client-side and server-side extraction consistently

#### Qualitative AI Enhancement

The hardcoded `DIMENSION_INSIGHTS` functions are good but static. AI could provide dynamic cross-dimension insights: *"Your wins show a strong pattern of proactive agency combined with pride. This suggests you thrive when you initiate action rather than respond — consider seeking more opportunities to lead initiatives."*

---

### 4.10 Energy Rhythm + Calendar Correlations

**Files**: 
- `src/components/insights/EnergyRhythm.tsx` (200 lines)
- `src/components/insights/CalendarStateCorrelations.tsx` (270 lines)  

**Position**: Full-width card (merged into single card)  
**Data Location**: Client-side  
**AI Usage**: None

#### Energy Rhythm — Data Source

```
daily_checkins table → checkin_date, outcome, created_at (last 7 days)
```

Passed as `checkInsWithTimestamp` prop from parent.

#### Energy Rhythm — Calculation

Builds a 3×7 heatmap grid (Morning/Afternoon/Evening × Mon-Sun):

```typescript
const TIME_WINDOWS = [
  { key: 'morning',   hours: [5,6,7,8,9,10,11] },
  { key: 'afternoon', hours: [12,13,14,15,16,17] },
  { key: 'evening',   hours: [18,19,20,21,22,23,0,1,2,3,4] }
];

// For each check-in:
1. Extract hour from timestamp
2. Map to time window
3. Map day-of-week (Sunday=6 for Mon-Sun ordering)
4. Place outcome in grid cell
// If multiple check-ins in same cell, keep most recent
```

Each filled cell gets a gradient background + glow effect based on state color.

#### Energy Rhythm — Correctness

⚠️ **Partially correct**:
- **Time zone issue**: Uses `new Date(checkIn.timestamp).getHours()` which depends on browser timezone. A user who checks in at 11pm EST will show as "Evening" but if their DB stores UTC, it might calculate as 4am next day ("Morning")
- **Multiple check-ins**: "Keep most recent" means earlier check-ins are silently discarded. User won't know they had a different state earlier in the same window

#### Calendar State Correlations — Data Source

```
calendar_connections table → id, is_active (checks if calendar connected)
daily_checkins table       → checkin_date, outcome (last 30 days)
calendar_events table      → title, start_time (last 30 days)
```

#### Calendar Correlations — Calculation

```typescript
// Hardcoded high-stakes keywords:
const keywords = [
  'board', 'quarterly', 'investor', 'pitch', 'review', 
  'presentation', 'interview', 'deadline', 'client', 'all-hands',
  'performance', 'budget', 'strategy', 'executive', 'stakeholder'
];

// For each check-in day:
1. Find calendar events on that day
2. For each event, check if title contains any keyword
3. If match: increment correlationMap[keyword][outcome]

// Filter: occurrences >= 3 AND confidence >= 0.5
// Note: threshold is 3 (not 2 like other cards)
```

#### Calendar Correlations — Correctness

⚠️ **Issues**:
- The keyword list is hardcoded and English-only
- Keywords match on substring: "deadline" would match "no deadline today"
- Multiple keywords in one event title each create separate correlations (e.g., "Executive Board Review" matches 'executive', 'board', and 'review')
- No normalization: "Board meeting" and "board prep" are both "board"

#### Qualitative AI Opportunity

Both could benefit from AI narrative: *"You consistently check in Scattered on days with Board events (3 of 4 times). On Presentation days, however, you're Focused 80% of the time — suggesting you may prepare more effectively for presentations than board meetings."*

---

## 5. Unused/Orphaned Components

These files exist in `src/components/insights/` but are **NOT imported or rendered** on the Insights page:

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| `AlignmentTimeline.tsx` | — | Timeline visualization | Orphaned |
| `CircadianGraph.tsx` | — | Circadian rhythm chart | Orphaned |
| `ContentTypeAnalysis.tsx` | — | Content engagement breakdown | Orphaned |
| `DecisionQualityChart.tsx` | 162 | Weekly quality/consistency bars | Orphaned |
| `ElementalMandala.tsx` | 115 | Fire/Earth/Water/Air balance | Orphaned (uses localStorage) |
| `EnergyDistributionChart.tsx` | — | Energy distribution | Orphaned |
| `EnergyGauge.tsx` | — | Gauge visualization | Orphaned |
| `EnergyRhythmCurve.tsx` | — | Curve visualization | Orphaned |
| `LuxuryProgressRing.tsx` | — | Animated ring | Orphaned |
| `LuxuryStateBar.tsx` | — | State bar component | Orphaned |
| `MentalFitnessScoreCard.tsx` | 348 | Score + archetype display | Imported but NOT rendered |
| `PracticeFocusBar.tsx` | — | Practice focus breakdown | Orphaned |
| `SemanticBubbles.tsx` | — | Older bubble implementation | Orphaned |
| `WeeklyRhythmHeatmap.tsx` | — | Older heatmap implementation | Orphaned |

**Note on MentalFitnessScoreCard**: While the component exists and is imported in some files, it is NOT rendered on the current `/insights` page layout. Its logic is entirely **localStorage-based** (see `mentalFitnessEngine.ts`) which makes it fundamentally broken for a multi-device, database-backed application.

---

## 6. AI vs Pure Logic Matrix

| Card | AI Model | Fallback | Trigger Condition |
|------|----------|----------|-------------------|
| **State Patterns** (observation text) | Gemini 3 Flash Preview via Lovable Gateway | `generateSimpleObservation()` — template-based | Production + LOVABLE_API_KEY present |
| **Tiny Wins** (dimension extraction) | Gemini 3 Flash Preview via Lovable Gateway | `extractDimensionsFromText()` — keyword matching | Production + LOVABLE_API_KEY + unanalyzed wins |
| **Semantic Analysis** (coach themes) | Gemini 1.5 Flash via Google API directly | No coach themes extracted (skipped) | Production + GEMINI_API_KEY present (🔴 NOT CONFIGURED) |
| **Semantic Analysis** (relationships) | Same as above | Algorithmic pair matching from hardcoded list | Same |
| Baseline Reference | None | N/A | — |
| Weekly Progress | None | N/A | — |
| Practice Effectiveness | None | N/A | — |
| Typical State | None | N/A | — |
| Strength & Friction | None | N/A | — |
| Cause-Effect | None | N/A | — |
| Energy Rhythm | None | N/A | — |
| Calendar Correlations | None | N/A | — |

### AI Model Usage Inconsistency

⚠️ The `insights-semantic-analysis` edge function uses the **direct Google Gemini API** (`generativelanguage.googleapis.com`), while the other two edge functions use the **Lovable AI Gateway** (`ai.gateway.lovable.dev`). This creates:
1. An extra API key dependency (`GEMINI_API_KEY`)
2. Different billing/quota tracking
3. Inconsistent error handling patterns

**Recommendation**: Migrate `insights-semantic-analysis` to use Lovable AI Gateway with `LOVABLE_API_KEY` (already configured).

---

## 7. Data Flow Architecture

### Database Tables Used by Insights

| Table | Cards That Read It | Read Via |
|-------|-------------------|----------|
| `profiles` | Baseline Reference, Strength & Friction | Direct Supabase |
| `daily_checkins` | State Patterns, Typical State, Cause-Effect, Energy Rhythm, Calendar Correlations, Practice Effectiveness, Strength & Friction, Semantic Analysis | Direct Supabase + Edge Fns |
| `sanctuary_events` | Practice Effectiveness, Cause-Effect, Semantic Analysis | Direct Supabase + Edge Fn |
| `sanctuary_content` | Practice Effectiveness | Direct Supabase |
| `tiny_wins` | Tiny Wins, Semantic Analysis | Direct Supabase + Edge Fn |
| `daily_ritual_completions` | Weekly Progress | Edge Fn |
| `behavior_logs` | Cause-Effect, Behavior-Outcome | Direct Supabase |
| `calendar_connections` | Calendar Correlations | Direct Supabase |
| `calendar_events` | Calendar Correlations | Direct Supabase |
| `user_coach_insights` | Strength & Friction | Direct Supabase |
| `dialogue_sessions` | Semantic Analysis (Mind Map) | Direct Supabase + Edge Fn |
| `dialogue_messages` | Semantic Analysis (Mind Map) | Direct Supabase + Edge Fn |
| `daily_themes` | Theme Patterns | Edge Fn |

### Tables Written To (by insights-related edge functions)

| Table | Edge Function | Write Operation |
|-------|--------------|-----------------|
| `tiny_wins` | `tiny-wins-insights` | UPDATE: sets dimension columns + `analyzed_at` |

### Data That Feeds INTO Insights (from other app areas)

| Data Point | Created By | App Area |
|-----------|-----------|----------|
| Check-in outcomes | Daily Check-in flow | `/daily-checkin` |
| Sanctuary events | Practice completion | Various practice players |
| Behavior logs | Post-event reflection | Behavior logging UI |
| Tiny wins | Coach Integrate flow | `/coach` (evening flow) |
| Calendar events | Calendar sync | Background sync function |
| Coach insights | Coach conversation analysis | `extract-coach-insights` edge fn |
| Daily themes | Theme generation during check-in | `daily-checkins` edge fn |
| Ritual completions | Practice tracking | Various practice players |
| Profile baseline | Onboarding | `/onboarding` |

---

## 8. Security Audit

### Client-Side Data Access

All 7 components that make direct Supabase queries use `user_id` filtering. Given the project's RLS architecture (deny-by-default with service role access via edge functions), these direct queries should theoretically be blocked by RLS in production.

**However**: The components use `DEV_MODE` to bypass this:
```typescript
const effectiveUserId = DEV_MODE ? DEV_USER.id : userId;
```

In production, these direct queries will use the authenticated user's ID. Whether they succeed depends on RLS policies for each table.

### Edge Function Authentication

All three insight edge functions verify the Auth0 token via `/userinfo` endpoint before proceeding. They use `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS.

### Exposed Logic

The following proprietary algorithms run client-side and are visible in browser DevTools:
1. Archetype determination thresholds (`userArchetypeEngine.ts`)
2. Mental Fitness Score formula (`mentalFitnessEngine.ts`)
3. Cause-Effect correlation logic
4. Keyword-based dimension extraction patterns
5. Theme extraction keyword lists
6. Calendar correlation keywords
7. Behavior-outcome correlation algorithm

---

## 9. Bug Report & Correctness Issues

### 🔴 Critical Bugs

**BUG-1: Archetype ID Mismatch**
- **Location**: `BaselineReferenceCard.tsx` line 18-24
- **Issue**: Archetype IDs don't match `userArchetypeEngine.ts` output
- **Impact**: Archetype label always shows "Your Profile" instead of actual archetype name
- **Fix**: Update `archetypeLabels` map to use correct IDs: `natural_regulator`, `strategic_pauser`, `high_octane_performer`, `awareness_builder`

**BUG-2: Mental Fitness Score Uses localStorage**
- **Location**: `mentalFitnessEngine.ts`
- **Issue**: Entire scoring engine reads from `localStorage` (`dailyRitualHistory`, `practiceHistory`, `recalibrateHistory`, `dailyCheckIn-*`)
- **Impact**: Score is device-specific, lost on cache clear, inconsistent across devices, disconnected from database
- **Fix**: Replace with `mental_fitness_scores` table or `mental-fitness-scores` edge function

**BUG-3: GEMINI_API_KEY Not Configured**
- **Location**: `insights-semantic-analysis/index.ts` line 152
- **Issue**: Uses `Deno.env.get('GEMINI_API_KEY')` but this secret doesn't exist
- **Impact**: Coach theme extraction via AI silently fails; only algorithmic fallback works
- **Fix**: Migrate to Lovable AI Gateway using `LOVABLE_API_KEY`

### 🟡 Medium Issues

**BUG-4: Practice Effectiveness Dead Code**
- **Location**: `PracticeEffectiveness.tsx` lines 109-111
- **Issue**: Second `else if` branch can never execute because first `if` already catches all positive outcomes
- **Impact**: No functional impact (dead code), but misleading to developers

**BUG-5: Energy Rhythm Timezone Sensitivity**
- **Location**: `EnergyRhythm.tsx` line 73
- **Issue**: `new Date(checkIn.timestamp).getHours()` uses browser timezone, but DB timestamps may be UTC
- **Impact**: Check-ins near midnight may appear in wrong time window

**BUG-6: Calendar Correlation Substring Matching**
- **Location**: `CalendarStateCorrelations.tsx` line 123
- **Issue**: `titleLower.includes(keyword)` can match partial words (e.g., "board" in "onboarding")
- **Impact**: False positive correlations

### 🟢 Low Issues

**BUG-7: State Distribution Sort Instability**
- **Location**: `Insights.tsx` line 145
- **Issue**: `sort()` without stable comparison for equal values

**BUG-8: Behavior-Outcome Temporal Double-Counting**
- **Location**: `CauseEffectInsights.tsx` lines 93-96
- **Issue**: 0-1 day window means same-day AND next-day check-ins both correlate

---

## 10. Redundancy Analysis

### Confirmed Redundancies

**1. BehaviorOutcomeCorrelations ≡ CauseEffectInsights (behavior subset)**

| Aspect | BehaviorOutcomeCorrelations | CauseEffectInsights |
|--------|---------------------------|-------------------|
| Data source | `behavior_logs` + `daily_checkins` | `behavior_logs` + `daily_checkins` + `sanctuary_events` |
| Algorithm | Same-day/next-day correlation | Same-day/next-day correlation |
| Threshold | ≥2 occurrences, ≥50% confidence | ≥2 occurrences, ≥50% confidence |
| Output | "When you [Behavior] → [State]" | "When you [Behavior/Practice] → [State]" |
| Difference | Only behavior→state | Adds practice→next-day-state |

**Verdict**: `BehaviorOutcomeCorrelations` is a strict subset of `CauseEffectInsights`. Both are imported and rendered on the page (lines 17 + 19, but only CauseEffectInsights is visually prominent). `BehaviorOutcomeCorrelations` is rendered but not visible in the current layout — checking the page rendering... Actually on closer inspection, `BehaviorOutcomeCorrelations` IS imported (line 17) but **never rendered** in the JSX. It's a dead import. **It should be removed.**

**2. ElementalMandala and DecisionQualityChart — Orphaned Legacy**

Both use `localStorage` (`practiceHistory`) and are not rendered. They represent an older data model that's been superseded by database-backed analytics. **Safe to delete.**

**3. Theme Patterns vs Mind Map**

Theme Patterns shows `daily_themes` phrases. Mind Map shows unified themes from ALL sources including daily themes. The Mind Map subsumes Theme Patterns content. However, Theme Patterns provides a specific view (exact phrases used by the system) that's distinct from the AI-extracted keywords in the Mind Map.

**Verdict**: Keep both — they serve different purposes. Theme Patterns = "What the system said", Mind Map = "What you talked about across all touchpoints".

### Cards That Could Be Merged

| Merge Candidate | Reason |
|----------------|--------|
| Typical State + State Distribution bar | Both derive from the same `statePatterns.distribution` data |
| Practice Effectiveness + Cause-Effect | Both answer "what works for me" — effectiveness is a specific case of cause-effect |

---

## 11. Recommendations

### Priority 1 — Fix Critical Bugs

1. **Fix archetype ID mismatch** in `BaselineReferenceCard.tsx` — update label map to match engine IDs  
2. **Migrate `insights-semantic-analysis`** to use Lovable AI Gateway instead of direct Gemini API  
3. **Replace `mentalFitnessEngine.ts` localStorage usage** with database-backed `mental_fitness_scores` table (or remove the card until migrated)  

### Priority 2 — Data Integrity

4. **Add word-boundary matching** for calendar correlation keywords: use regex `\b${keyword}\b` instead of `includes()`  
5. **Fix timezone handling** in Energy Rhythm: normalize timestamps to user's timezone or use the `checkin_date` field (which is already date-only)  
6. **Remove dead code** in PracticeEffectiveness (unreachable else-if branch)  

### Priority 3 — Architecture

7. **Remove `BehaviorOutcomeCorrelations` import** — dead import, logic already covered by CauseEffectInsights  
8. **Delete 14 orphaned component files** to reduce maintenance burden  
9. **Move correlation logic server-side** to protect proprietary algorithms (CauseEffectInsights, PracticeEffectiveness, CalendarStateCorrelations)  

### Priority 4 — AI Enhancement Opportunities

10. **Add AI narrative to Strength & Friction**: Generate contextual insight combining archetype + check-in patterns + coach feedback  
11. **Add AI narrative to Cause-Effect**: Explain WHY certain patterns emerge, not just THAT they exist  
12. **Add AI narrative to Energy Rhythm**: Identify peak performance windows and recovery patterns  
13. **Replace hardcoded THEME_INSIGHTS** with dynamic AI generation in InnerWorldBubbles click modal  
14. **Add cross-card AI synthesis**: A "Weekly Summary" insight that connects patterns across all cards  

### Priority 5 — Data Pipeline Ensuring

To ensure the Insights page tracks correctly, verify these data pipelines are working:

| Pipeline | Check Method | Expected |
|----------|-------------|----------|
| Daily check-ins saving | Complete a check-in → query `daily_checkins` | New row with outcome, energy_balance |
| Ritual completions tracking | Complete a practice → query `daily_ritual_completions` | Updated boolean fields |
| Sanctuary events recording | Complete any practice → query `sanctuary_events` | New row with event_type='completed' |
| Tiny wins capturing | Complete evening Integrate flow → query `tiny_wins` | New row with win_content |
| Behavior logs saving | Log a behavior → query `behavior_logs` | New row with behavior_type |
| Coach insights extraction | Complete coach conversation → query `user_coach_insights` | New insights extracted |
| Calendar sync working | Connect calendar → query `calendar_events` | Synced events appearing |
| Daily themes generating | Complete check-in → query `daily_themes` | Theme phrase generated |

---

## 12. Appendix: Edge Function Reference

### `state-patterns-insights`

- **Auth**: Auth0 token → `/userinfo` verification  
- **Input**: `{ days: 7 }`  
- **Output**: `{ distribution, observation, checkInCount, userArchetype }`  
- **AI**: Gemini 3 Flash Preview via Lovable Gateway (observation text)  
- **Fallback**: `generateSimpleObservation()` template  
- **Tables**: `daily_checkins`, `profiles`  

### `tiny-wins-insights`

- **Auth**: Auth0 token → `/userinfo` verification  
- **Input**: `{ days: 14 }`  
- **Output**: `{ dimensions, themes, summary, winsCount, sourceBreakdown }`  
- **AI**: Gemini 3 Flash Preview via Lovable Gateway (dimension extraction per win)  
- **Fallback**: `extractDimensionsFromText()` keyword matching  
- **Tables**: `tiny_wins` (READ + UPDATE)  
- **Side effect**: Updates win records with extracted dimensions  

### `insights-semantic-analysis`

- **Auth**: Auth0 token → hardcoded Auth0 domain verification  
- **Input**: `{ days: 7, action: 'analyze' | 'getBubbleDetails', keyword? }`  
- **Output (analyze)**: `{ themePatterns, unifiedThemes, themeRelationships }`  
- **Output (getBubbleDetails)**: `{ keyword, totalCount, recentMentions }`  
- **AI**: Gemini 1.5 Flash via direct Google API (🔴 uses unconfigured GEMINI_API_KEY)  
- **Fallback**: Only algorithmic theme aggregation; no AI themes extracted  
- **Tables**: `daily_themes`, `dialogue_sessions`, `dialogue_messages`, `sanctuary_events`, `tiny_wins`, `daily_checkins`  

---

*End of Report*
