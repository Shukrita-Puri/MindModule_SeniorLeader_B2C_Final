# Insights Page — Full Technical Audit Report

**Date**: February 25, 2026  
**Scope**: `/insights` route — all cards, data sources, calculation logic, AI usage, edge functions, progressive unlock, upstream/downstream connections  
**Primary File**: `src/pages/Insights.tsx` (890 lines)  
**Component Directory**: `src/components/insights/` (18 files)  
**Edge Functions**: 4 (`state-patterns-insights`, `tiny-wins-insights`, `insights-semantic-analysis`, `performance-rhythm-insights`)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Page Architecture Overview](#2-page-architecture-overview)
3. [Progressive Unlock System](#3-progressive-unlock-system)
4. [Card-by-Card Deep Dive](#4-card-by-card-deep-dive)
   - 4.1 [Your Self Mastery Patterns (LeadershipPatternsCard)](#41-your-self-mastery-patterns)
   - 4.2 [Your Momentum (Tiny Wins)](#42-your-momentum)
   - 4.3 [Your Readiness Rhythm (PerformanceRhythmCard)](#43-your-readiness-rhythm)
   - 4.4 [Your Mind Map (InnerWorldBubbles)](#44-your-mind-map)
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

The Insights page (`/insights`) renders **4 active cards** in a vertically-scrolled layout titled "Your Inner World." Data flows from **12+ database tables** through **4 edge functions** (production) or **direct Supabase queries** (DEV_MODE). AI is used in **3 pipelines**: Self Mastery Patterns observation, Tiny Wins dimension extraction, and Semantic Analysis theme/relationship extraction.

### Current Card Inventory (Render Order)

| # | Card Title | Component | Data Source |
|---|-----------|-----------|-------------|
| 1 | Your Self Mastery Patterns | `LeadershipPatternsCard.tsx` | `state-patterns-insights` edge fn (prod) / direct DB (dev) |
| 2 | Your Momentum | Inline in `Insights.tsx` + `PsychologicalDimensionBubbles.tsx` | `tiny-wins-insights` edge fn (prod) / direct DB (dev) |
| 3 | Your Readiness Rhythm | `PerformanceRhythmCard.tsx` | `performance-rhythm-insights` edge fn (prod) / direct DB (dev) |
| 4 | Your Mind Map | `InnerWorldBubbles.tsx` | `insights-semantic-analysis` edge fn (prod) / direct DB (dev) |

### Previously Removed Cards (No Longer Rendered)

The following cards from the prior audit report are **no longer present** on the page:
- ~~Baseline Reference Card~~ (archetype data merged into LeadershipPatternsCard)
- ~~Weekly Progress Streak~~ (moved to homepage via InsightProgressCard)
- ~~Practice Effectiveness~~ (component exists, **not rendered** on page)
- ~~Typical State~~ (merged into LeadershipPatternsCard as `typicalState`)
- ~~Strength & Friction~~ (merged into LeadershipPatternsCard as Lean On / Watch For)
- ~~Cause-Effect Patterns~~ (merged into PerformanceRhythmCard as cause-effect insight)
- ~~Theme Patterns~~ (merged into LeadershipPatternsCard as Recurring Themes)
- ~~Energy Rhythm heatmap~~ (merged into PerformanceRhythmCard)
- ~~Calendar Correlations~~ (merged into PerformanceRhythmCard as Calendar Pattern)
- ~~Behavior-Outcome Correlations~~ (merged into PerformanceRhythmCard as cause-effect)

### Critical Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | `state-patterns-insights` queries `wearable_data` table — **table does not exist in schema** | 🔴 Critical | Query silently fails (returns empty) |
| 2 | `PracticeEffectiveness.tsx` component exists but is **not rendered** on page — dead component | 🟡 Medium | No impact on user |
| 3 | `PerformanceRhythmCard` DEV_MODE queries `dialogue_messages` without `user_id` filter — fetches **all users' messages** | 🔴 Critical | Data leak in dev mode; prod uses service role with user scoping |
| 4 | Archetype IDs in `BaselineReferenceCard` mismatch engine IDs | 🟡 Medium | Component no longer rendered (legacy) |
| 5 | `insights-semantic-analysis` now uses `LOVABLE_API_KEY` (fixed from prior audit) | ✅ Fixed | Was using `GEMINI_API_KEY` |
| 6 | LeadershipPatternsCard DEV_MODE uses basic keyword matching for coach insights vs production's explicit `insight_type` query | 🟡 Medium | Dev/prod logic divergence |
| 7 | 14+ component files in `src/components/insights/` are orphaned | 🟢 Low | Maintenance burden only |

---

## 2. Page Architecture Overview

### File Structure

```
src/pages/Insights.tsx                               — Page orchestrator (890 lines)
src/components/insights/
  ├── LeadershipPatternsCard.tsx (438 lines)          — Card 1: Self Mastery Patterns
  ├── PerformanceRhythmCard.tsx (633 lines)           — Card 3: Readiness Rhythm
  ├── InnerWorldBubbles.tsx (404 lines)               — Card 4: Mind Map bubble viz
  ├── PsychologicalDimensionBubbles.tsx (391 lines)   — Card 2: Tiny Wins dimensions
  ├── InsightInfoModal.tsx                            — Info (?) modal for each card
  ├── LuxuryInsightCard.tsx                           — Glass-morphism card wrapper
  ├── ProgressiveUnlockMessage.tsx                    — Lock/unlock progress indicator
  └── [11 orphaned files — see §5]

supabase/functions/
  ├── state-patterns-insights/index.ts (561 lines)    — Card 1 production backend
  ├── tiny-wins-insights/index.ts (427 lines)         — Card 2 production backend
  ├── performance-rhythm-insights/index.ts (327 lines)— Card 3 production backend
  └── insights-semantic-analysis/index.ts (707 lines) — Card 4 production backend
```

### Data Fetching Flow (Insights.tsx mounts)

```
Insights.tsx mounts → user?.id triggers 5 parallel fetches:
  ├── fetchInsightsData()         → direct Supabase: daily_checkins + sanctuary_events (7 days)
  │                                  Sets: weekData, checkInsWithTimestamp, practiceData, checkInStreak
  ├── fetchTinyWinsInsights()     → DEV: direct DB | PROD: tiny-wins-insights edge fn
  │                                  Sets: tinyWinsInsights, tinyWinsContent
  ├── fetchStatePatterns()        → DEV: direct DB | PROD: state-patterns-insights edge fn
  │                                  Sets: statePatterns (distribution, observation, checkInCount)
  ├── fetchSemanticAnalysis()     → DEV: direct DB | PROD: insights-semantic-analysis edge fn
  │                                  Sets: semanticAnalysis (unifiedThemes, themeRelationships, aiObservation)
  └── fetchProfileBaseline()     → direct Supabase: profiles table
                                    Sets: profileBaseline
```

**Note**: `LeadershipPatternsCard` and `PerformanceRhythmCard` are **self-fetching components** — they receive only `userId` as prop and run their own data queries internally.

### Component Data Passing

| Component | Props Received | Self-Fetching? |
|-----------|---------------|----------------|
| LeadershipPatternsCard | `userId` | ✅ Yes — runs own queries (DEV: direct DB, PROD: `state-patterns-insights`) |
| Your Momentum (inline) | Uses parent state: `tinyWinsInsights`, `tinyWinsContent` | No |
| PsychologicalDimensionBubbles | `data`, `relatedWins`, `emptyMessage` | No |
| PerformanceRhythmCard | `userId` | ✅ Yes — runs 7 parallel queries (DEV) or `performance-rhythm-insights` (PROD) |
| InnerWorldBubbles | `items`, `relationships`, `onNodeSummary` | No (but click handler calls back to parent) |

---

## 3. Progressive Unlock System

### Page-Level Tier (Insights.tsx)

Based on `statePatterns.checkInCount` (7-day count from `state-patterns-insights`):

```typescript
type InsightsTier = 'baseline' | 'early' | 'summary' | 'deepening' | 'full';

if (checkInCount >= 7) return 'full';
if (checkInCount >= 4) return 'deepening';
if (checkInCount >= 3) return 'summary';
if (checkInCount >= 1) return 'early';
return 'baseline';
```

**Current usage**: The `insightsTier` variable is **computed but not used for card visibility** in the current layout. All 4 cards render regardless of tier. The tier was used in the previous layout to gate Theme Patterns (required `deepening`).

### Card-Level Progressive Disclosure

Each card implements its **own internal progressive unlock**:

#### Card 1: LeadershipPatternsCard (Self Mastery Patterns)

| Element | Unlock Condition | Source |
|---------|-----------------|--------|
| AI Observation | `checkInCount >= 5` (prod: AI) or `checkInCount >= 3` (dev: template) | `state-patterns-insights` |
| Current Scores + Deltas | `checkInCount >= 7` AND `clarity_level` + `confidence_level` data available | Computed from felt-state signals |
| Archetype Evolution | Same as Current Scores + baseline archetype ≠ current archetype | Archetype cascade comparison |
| Recurring Themes | Any themes in `daily_themes` table | Direct `daily_themes` query |
| Coach Strength (Lean On) | `user_coach_insights` with `insight_type = 'strength'` exists | Edge fn: explicit query, then keyword fallback |
| Coach Friction (Watch For) | `user_coach_insights` with `insight_type = 'growth_area'` exists; else `coachSessionCount >= 3` | Edge fn: explicit query, then keyword fallback |
| Progressive message (bottom) | `checkInCount == 0`: "Complete your first check-in" | Always rendered conditionally |
| Progressive message (bottom) | `checkInCount > 0 && < 5`: "X check-ins logged. Patterns become clearer with each one." | Always rendered conditionally |

#### Card 2: Your Momentum (Tiny Wins)

| Element | Unlock Condition | Source |
|---------|-----------------|--------|
| Win text list (1-4 wins) | `winsCount >= 1 && winsCount < 5` AND dimensions exist | `tiny-wins-insights` |
| Dimension bubble chart | `winsCount >= 5` AND dimensions exist | `PsychologicalDimensionBubbles` component |
| AI momentum observation | `winsCount >= 10` | `tiny-wins-insights` edge fn (AI-generated) |
| Pattern line summary | `winsCount >= 5` | `tinyWinsInsights.patternLine` |
| Progressive incentive | Dynamic: "Capture first win" → "Log X more" → "At 10 wins, deeper patterns appear" | `getWinsProgressMessage()` |

#### Card 3: PerformanceRhythmCard (Readiness Rhythm)

| Element | Unlock Condition | Source |
|---------|-----------------|--------|
| Progressive "complete X more" | `checkInCount < 7` | Internal |
| 3×7 Heatmap grid | `checkInCount >= 7` | Grid built from check-ins + `inner_readiness_scores` |
| Best Readiness Window | `checkInCount >= 7` + `inner_readiness_scores` with ≥2 per cell | Composite score average per cell |
| Calendar Pattern insight | `checkInCount >= 10` + calendar connected + ≥3 occurrences of same event type | Calendar events × readiness scores correlation |
| Cause-Effect insight | `checkInCount >= 10` + `behaviorLogCount >= 5` | Behavior → outcome correlation |
| How You Show Up (Presence) | `checkInCount >= 15` + (≥2 high-stakes events OR ≥3 coach sessions) | Multi-signal presence score |
| Unlock incentive messages | `checkInCount >= 7 && checkInCount < 15` + missing insights | Dynamic messaging |
| "Connect calendar" prompt | `checkInCount >= 10` + no calendar connected | Static prompt |

#### Card 4: Your Mind Map

| Element | Unlock Condition | Source |
|---------|-----------------|--------|
| Full bubble visualization | `mindMapReady` = true | See formula below |
| "Keep engaging" message | `mindMapReady` = false | Static |
| AI observation above bubbles | `semanticAnalysis.aiObservation` exists | `insights-semantic-analysis` edge fn |
| Node click → summary modal | Always (when visible) | `fetchNodeSummary()` → edge fn or DEV fallback |

**Mind Map Readiness Formula**:
```typescript
const mindMapReady = coachSessions >= 3 
  || (checkInCount >= 5 && winsCount >= 2) 
  || totalPoints >= 5;
// where totalPoints = checkInCount + winsCount + coachSessions
```

---

## 4. Card-by-Card Deep Dive

---

### 4.1 Your Self Mastery Patterns

**File**: `src/components/insights/LeadershipPatternsCard.tsx` (438 lines)  
**Edge Function**: `state-patterns-insights/index.ts` (561 lines)  
**Position**: First card on page

#### Data Sources (Production — Edge Function)

The `state-patterns-insights` edge function runs **12 parallel queries**:

| Query | Table | Columns | Filter |
|-------|-------|---------|--------|
| 1 | `profiles` | `user_archetype, component_scores` | `id = userId` |
| 2 | `daily_checkins` | `checkin_date, outcome, energy_balance, clarity_level, confidence_level, created_at` | `user_id`, last 30 days |
| 3 | `daily_themes` | `theme_phrase, theme_driver` | `user_id`, last 30 days |
| 4 | `user_coach_insights` | `insight_content, created_at, insight_type` | `user_id`, last 10 |
| 5 | `sanctuary_events` | `category, event_type, timestamp, context_data` | `user_id`, last 30 days |
| 6 | `daily_ritual_completions` | `session_period, completion_status, ritual_date` | `user_id`, last 30 days |
| 7 | `tiny_wins` | `win_date` | `user_id`, last 30 days |
| 8 | `wearable_data` | `hrv, summary_date` | `user_id`, last 30 days |
| 9 | `dialogue_sessions` | `id` | `user_id`, last 30 days |
| 10 | `calendar_connections` | `id` | `user_id`, active |
| 11 | `behavior_logs` | `behavior_type, created_at` | `user_id`, last 30 days |
| 12 | `inner_readiness_scores` | `composite_score, energy_tier, full_context_statement, divergence_flag, layers_active, score_date` | `user_id`, last 30 days |

Plus a conditional 13th query: `dialogue_messages.content` for coach sessions (if any exist).

**🔴 BUG**: Query 8 references `wearable_data` table which **does not exist in the current schema** (`src/integrations/supabase/types.ts`). The query silently returns empty data, causing all HRV-based signals to use neutral defaults (50).

#### Calculation: Multi-Signal Evolved Dimension Scores (Production)

The edge function computes **3 evolved dimension scores** using a weighted signal model:

**Recalibration Score** (replaces raw `energy_balance`):

| Signal | Weight | Data Source | Availability Condition |
|--------|--------|-------------|----------------------|
| Baseline (onboarding) | 0.30 | `profiles.component_scores.energyRegulation` | Always |
| Pause practices in low state | 0.15 | `sanctuary_events` (category=pause) × `daily_checkins` (low outcome) | ≥3 pause-in-low events |
| Pre-event session completion | 0.10 | `daily_ritual_completions` (session_period=pre-event, status=full) | ≥2 pre-event sessions |
| HRV trend | 0.10 | `wearable_data.hrv` | ≥14 HRV data points **(🔴 never available — table missing)** |
| Coach regulation keywords | 0.15 | `dialogue_messages` scanned for positive/negative regulation patterns | ≥1 coach session |
| Felt state (energy_balance avg) | 0.20 | `daily_checkins.energy_balance` last 7 days | ≥3 recent data points |

*Penalty*: -10 if ≥3 consecutive depleted/managing states.

**Clarity Score**:

| Signal | Weight | Data Source | Availability |
|--------|--------|-------------|--------------|
| Baseline | 0.30 | `profiles.component_scores.focusRecovery` | Always |
| Flow practices under load | 0.15 | `sanctuary_events` (category=flow) | ≥3 flow practices + calendar connected |
| Coach clarity keywords | 0.15 | `dialogue_messages` scanned for clarity patterns | ≥1 coach session |
| Clarity theme recurrence penalty | 0.10 | `daily_themes` matching clarity patterns | ≥10 check-ins total |
| Felt state (clarity_level avg) | 0.30 | `daily_checkins.clarity_level` last 7 days | ≥3 recent data points |

*Penalty*: -10 if scattered count ≥5 AND behavior logs ≥5.

**Renewal Score**:

| Signal | Weight | Data Source | Availability |
|--------|--------|-------------|--------------|
| Baseline | 0.30 | `profiles.component_scores.energyRenewal` | Always |
| Renergise practices in depleted state | 0.15 | `sanctuary_events` (category=renergise) × `daily_checkins` (depleted outcome) | ≥3 renergise-in-depleted events |
| Evening session completion rate | 0.15 | `daily_ritual_completions` (session_period=evening) | ≥10 evening sessions |
| Tiny wins frequency | 0.10 | `tiny_wins` count | ≥5 wins |
| HRV recovery rate | 0.10 | Same as HRV trend **(🔴 never available)** | ≥14 HRV data points |
| Coach renewal keywords | 0.10 | `dialogue_messages` scanned for renewal patterns | ≥1 coach session |
| Felt state (confidence_level avg) | 0.10 | `daily_checkins.confidence_level` last 7 days | ≥3 recent data points |

**Weight Redistribution**: When a signal is unavailable, its weight is redistributed proportionally across available signals using `computeWeightedScore()`.

#### Calculation: Archetype Resolution

5-tier cascade based on dimension scores:

```
1. Grounded Master:      energyReg >= 65 AND energyRenewal >= 55
2. Resilient Performer:   energyRenewal >= 65 AND energyReg >= 50
3. Clear Thinker:         focusRecovery >= 65 AND energyReg >= 45
4. Intensity Driver:      energyReg >= 60 AND focusRecovery < 50
5. Adaptive Navigator:    (default fallback)
```

Each archetype has: `id`, `title`, `leanOn` (strength text), `watchFor` (growth area text).

**Legacy Mapping**: The edge function includes a `LEGACY_MAP` translating old onboarding archetype IDs (`natural_regulator`, `strategic_pauser`, etc.) to new v2 IDs.

#### Calculation: Coach Strength / Friction (Production)

**Priority 1**: Explicit `user_coach_insights` with `insight_type = 'strength'` (for Lean On) or `insight_type = 'growth_area'` (for Watch For). Queries `is_active = true`, latest first.

**Priority 2 (Fallback)**: Keyword regex scan across last 10 `user_coach_insights.insight_content`:
- Strength: `/strength|strong|excel|composure|resilient|clarity|conviction|grounded|held|showed up|brought|capacity|resource/i`
- Friction: `/struggle|challenge|pattern|watch for|friction|tendency|recurring|avoidance|escalated|reactive|lost|slipping|cost/i`

**🟡 DEV_MODE Divergence**: DEV_MODE only uses the keyword fallback, skipping the explicit `insight_type` query. This means dev behavior doesn't match production behavior.

#### Calculation: Friction & Trend

**Friction**: `frictionPct = lowStates / totalCheckins × 100` where `lowStates` = outcomes in `{drained, overwhelmed, scattered}`.

**Trend**: Compares friction% of last 7 days vs prior 7 days. If difference ≥10pp → `improving`; if ≤-10pp → `declining`; else `stable`. Falls back to `energy_balance` average comparison if friction data insufficient.

#### AI Observation (Production)

- **Trigger**: `LOVABLE_API_KEY` exists AND `totalCheckins >= 5`
- **Model**: `google/gemini-2.5-flash-lite` via Lovable AI Gateway
- **Prompt**: System prompt asks AI to "name the ONE pattern most worth their attention right now" based on archetype, dimension shifts, friction, themes, and coach feedback
- **Tool use**: `emit_observation` structured output (single sentence)
- **Fallback**: `generateFallbackObservation()` — template-based, uses dimension deltas and friction data

#### Display Layout

```
┌───────────────────────────────────────────────┐
│  YOUR SELF MASTERY PATTERNS                   │
├───────────────────────────────────────────────┤
│  [AI Observation — gradient box]               │
│                                                │
│  YOUR DIMENSIONS                               │
│  The [Archetype Title] → [Evolved Title]       │
│  ┌─────────────────────────────────────────┐  │
│  │ Recalibration   50 → 62 (+12) ↗        │  │
│  │ Clarity          45 → 48 (+3)  →        │  │
│  │ Renewal          55 → 60 (+5)  ↗        │  │
│  └─────────────────────────────────────────┘  │
│                                                │
│  WHAT YOUR PATTERNS REVEAL                     │
│  Friction: 35% (Moderate friction) ↗           │
│  Recurring Themes: "steady under pressure" (3×)│
│                                                │
│  YOUR INNER EDGE                               │
│  🛡 Lean On: [coach strength or archetype text]│
│  ⚠ Watch For: [coach friction or archetype]    │
│                                                │
│  Based on 15 check-ins, 3 coach sessions...    │
└───────────────────────────────────────────────┘
```

#### Upstream Data Dependencies

| Data Source | Created By | App Area | Working? |
|------------|-----------|----------|----------|
| `profiles.component_scores` | Onboarding flow | `/onboarding` | ✅ Yes |
| `daily_checkins` | Daily Check-In | `/daily-checkin` → `daily-checkins` edge fn | ✅ Yes |
| `daily_themes` | Check-in processing | `daily-checkins` edge fn (theme generation) | ✅ Yes |
| `user_coach_insights` | Coach conversation analysis | `extract-coach-insights` edge fn | ✅ Yes |
| `sanctuary_events` | Practice completion | Practice player components | ✅ Yes |
| `daily_ritual_completions` | Ritual tracking | Practice players + `daily-rituals` edge fn | ✅ Yes |
| `tiny_wins` | Coach Integrate flow | `store-tiny-win` edge fn | ✅ Yes |
| `wearable_data` | Oura sync | `sync-oura` edge fn | 🔴 **Table doesn't exist in schema** |
| `dialogue_sessions` / `dialogue_messages` | Coach conversations | `dialogue-session-manage` + `dialogue-engine` | ✅ Yes |
| `calendar_connections` | Calendar setup | `calendar-auth` edge fn | ✅ Yes |
| `behavior_logs` | Post-event reflection | Behavior logging UI | ✅ Yes |
| `inner_readiness_scores` | Check-in processing | `compute-inner-readiness` edge fn | ✅ Yes |

#### Downstream Consumers

None — this card is display-only.

---

### 4.2 Your Momentum

**File**: Inline in `Insights.tsx` (lines 746-836) + `PsychologicalDimensionBubbles.tsx` (391 lines)  
**Edge Function**: `tiny-wins-insights/index.ts` (427 lines)  
**Position**: Second card on page

#### Data Source

```
tiny_wins table → win_content, win_date, sentiment, primary_emotion, secondary_emotion,
                   agency_type, regulation_level, growth_signal, analyzed_at
```

Last 14 days.

#### Calculation: Dimension Extraction Pipeline

**Production flow** (edge function `tiny-wins-insights`):

```
1. Auth: verify Auth0 JWT
2. Fetch all wins from last {days} days
3. Separate: unanalyzed (analyzed_at IS NULL) vs already-analyzed
4. For each unanalyzed win:
   a. If LOVABLE_API_KEY exists → Gemini 2.5 Flash Lite via Lovable Gateway:
      Tool call: extract_dimensions → {sentiment, primary_emotion, secondary_emotion, 
                                        agency_type, regulation_level, growth_signal}
   b. Else → keyword matching (DIMENSION_PATTERNS)
5. UPDATE each win with extracted dimensions + analyzed_at = now()
6. Aggregate dimension counts across ALL wins (analyzed + newly analyzed)
7. Generate summary text, identify themes, create display labels
8. Return: { dimensions, themes, summary, winsCount, observation, patternLine }
```

**DEV_MODE flow** (Insights.tsx lines 308-376):

```
1. Direct Supabase query: tiny_wins with all dimension columns
2. If DB dimensions populated → use directly (no re-extraction)
3. Aggregate counts: emotion, agency, regulation, growth (sentiment excluded from display)
4. Generate inline observation from top emotion + top growth signal
```

#### Dimension Categories & Values

| Dimension | Display Label | Possible Values | Extraction |
|-----------|--------------|-----------------|------------|
| emotion | "What you felt" | joy, pride, relief, gratitude, confidence, hope, courage | AI or keywords |
| agency | "How you showed up" | proactive, responsive, collaborative, supported | AI or keywords |
| regulation | "How you led yourself" | regulated, intentional, reactive | AI or keywords |
| growth | "What it built" | learning, breakthrough, mastery, resilience, boundary, letting-go | AI or keywords |
| sentiment | *(excluded from display)* | positive, negative, mixed, neutral | AI or keywords |

#### Edge Function: Dimension Insights (Server-Side)

The `tiny-wins-insights` edge function includes a comprehensive `DIMENSION_INSIGHTS` map with psychological explanations for each dimension value (e.g., "Pride anchors accomplishment in your nervous system..."). These are returned per-dimension to the client and displayed in the bubble click modal.

#### Bubble Visualization

```typescript
const getBubbleSize = (count, maxCount) => {
  const minSize = 48, maxSize = 88;
  const ratio = maxCount > 1 ? count / maxCount : 1;
  return minSize + (ratio * (maxSize - minSize));
};
```

Max 12 bubbles. Color-coded: emerald=emotion, rose=emotion(alt), sky=agency, violet=regulation, gold=growth.

#### Click → Detail Modal

Shows:
1. Dimension label + value
2. Hardcoded psychological insight from `DIMENSION_INSIGHTS` 
3. Related wins (filtered: exclude < 20 chars or matching generic patterns)
4. "Explore with Coach" button → navigates to `/coach`

#### Upstream Data Dependencies

| Data Source | Created By | Working? |
|------------|-----------|----------|
| `tiny_wins.win_content` | `store-tiny-win` edge fn (coach Integrate flow) | ✅ Yes |
| `tiny_wins.{dimension columns}` | `tiny-wins-insights` edge fn (writes back) | ✅ Yes |

#### Downstream Consumers

- `tiny_wins` table is also read by `insights-semantic-analysis` for Mind Map themes
- Win counts feed into `state-patterns-insights` renewal signal

---

### 4.3 Your Readiness Rhythm

**File**: `src/components/insights/PerformanceRhythmCard.tsx` (633 lines)  
**Edge Function**: `performance-rhythm-insights/index.ts` (327 lines)  
**Position**: Third card on page

#### Data Sources (DEV_MODE — 7 parallel queries)

| Query | Table | Purpose |
|-------|-------|---------|
| 1 | `daily_checkins` | Outcomes + energy balance for heatmap |
| 2 | `calendar_connections` | Check if calendar is connected |
| 3 | `calendar_events` | Event titles for calendar correlations |
| 4 | `behavior_logs` | Behavior types for cause-effect |
| 5 | `inner_readiness_scores` | Composite scores for heatmap overlay + divergence |
| 6 | `daily_ritual_completions` | Pre-event session tracking for presence |
| 7 | `dialogue_messages` | Coach presence keywords **(🔴 no user_id filter in DEV_MODE)** |

**Production**: Single call to `performance-rhythm-insights` edge fn which runs equivalent server-side queries with proper user scoping.

#### Calculation: 3×7 Heatmap Grid

```
Time Windows:   Morning (5-11), Afternoon (12-16), Evening (17-4)
Day Mapping:    Mon=0, Tue=1, ... Sun=6

For each check-in:
  1. Extract hour from created_at timestamp
  2. Map to time window (0-2)
  3. Map day-of-week to Mon-Sun index (0-6)
  4. Place outcome in grid[timeWindow][dayIndex]
  5. If multiple check-ins in same cell → keep most recent
```

**Composite Score Overlay**: `inner_readiness_scores` are averaged per cell (30-day window). Displayed as small number inside each filled cell.

**Divergence Flag**: If `|compositeScore - expectedScore(outcome)| >= 20`, the cell gets a `⚠️` badge. Expected scores: `focused=75, steady=60, scattered=45, drained=30, overwhelmed=25`.

#### Calculation: Calendar Pattern (Element 1B)

```typescript
// Only shown when: checkInCount >= 10 AND calendar connected
EVENT_TYPE_KEYWORDS = {
  board: ['board', 'board meeting', ...],
  investor: ['investor', 'vc', 'funding', 'pitch'],
  quarterly: ['quarterly', 'qbr', 'q1'...],
  // ... 10 categories total
};

For each calendar event:
  1. Match title against keyword categories
  2. Find same-day inner_readiness_score
  3. Group by event type: collect composite scores
  4. Filter: ≥3 occurrences of same type
  5. Find most draining (lowest avg < 50) or most energizing (highest avg > 65)
  6. Generate insight sentence
```

#### Calculation: Cause-Effect (Element 1C)

```typescript
// Only shown when: checkInCount >= 10 AND behaviorLogCount >= 5
For each behavior_log:
  1. Find check-ins within 0-1 day window
  2. Group by behavior_type → outcome
  3. Calculate confidence = count / total for that behavior
  4. Filter: count >= 2 AND confidence >= 0.5
  5. Show highest confidence pattern
```

#### Calculation: How You Show Up — Presence Score (Element 1A)

**Only shown when**: `checkInCount >= 15` AND (≥2 high-stakes calendar events OR ≥3 coach sessions)

Multi-signal composite (0-100):

| Signal | Max Points | Calculation |
|--------|-----------|-------------|
| Pre-event sessions | 30 | `min(30, preEventSessionsCompleted × 10)` |
| Low readiness + high stakes | 20 | `min(20, lowReadinessHighStakes × 5)` |
| Coach presence keywords | ±30 | Positive/negative keyword scan in dialogue messages |
| Energized after high-stakes | 15 | `min(15, energizedAfterHighStakes × 5)` |

**Presence Labels**:
- ≥70: "You show up when it matters"
- ≥50: "Your presence holds under pressure"
- ≥30: "Your presence varies with your state"
- <30: "State is affecting your presence"

**Presence Insight**: The strongest signal generates a narrative sentence.

#### Upstream Data Dependencies

| Data Source | Created By | Working? |
|------------|-----------|----------|
| `daily_checkins` | Daily Check-In | ✅ Yes |
| `calendar_connections` | Calendar auth | ✅ Yes |
| `calendar_events` | `sync-calendar` edge fn | ✅ Yes (if connected) |
| `behavior_logs` | Post-event reflection | ✅ Yes |
| `inner_readiness_scores` | `compute-inner-readiness` edge fn | ✅ Yes |
| `daily_ritual_completions` | Practice completion | ✅ Yes |
| `dialogue_messages` | Coach conversations | ✅ Yes |

---

### 4.4 Your Mind Map

**File**: `src/components/insights/InnerWorldBubbles.tsx` (404 lines)  
**Edge Function**: `insights-semantic-analysis/index.ts` (707 lines)  
**Position**: Fourth card on page

#### Data Sources (Production — Edge Function)

The `insights-semantic-analysis` edge function aggregates themes from **7 data sources**:

| # | Source | Table | Theme Extraction Method |
|---|--------|-------|------------------------|
| 1 | Daily Themes | `daily_themes` | Direct `theme_phrase` count |
| 2 | Coach Conversations | `dialogue_messages` (user messages) | **AI** (Gemini 2.5 Flash Lite) or keyword fallback |
| 3 | Practice Events | `sanctuary_events` | Category → theme mapping (pause→"calm & regulate", flow→"focus & presence", power→"energy renewal") + tag extraction |
| 4 | Tiny Wins | `tiny_wins` | Keyword scan (21 keywords: confidence, calm, focus, etc.) |
| 5 | Check-in Outcomes | `daily_checkins` | Outcome → theme mapping (focused→"high focus", drained→"energy drain", etc.) + state_tags |
| 6 | Coach Session Summaries | `coach_session_summaries` | `key_topics` (×1 weight) + `recurring_themes` (×2 weight) |
| 7 | Coach Pattern Observations | `coach_pattern_observations` | `pattern_description` first 3 words (×observation_count), active only, ≥2 observations |

#### Theme Aggregation

All themes are merged into a single `themeMap<string, {count, sources}>`:
- Normalized to lowercase
- Minimum length: 2 characters
- Capped at **8 unified themes** (sorted by total count)
- Weight = count / maxCount (0 to 1)

#### Relationship Extraction

**AI Path** (if `LOVABLE_API_KEY` exists + coach messages > 50 chars):
- Gemini extracts 2-4 relationships with types: "often co-occur", "tension between", "feeds into", "grounded by"
- Prompt includes up to 3000 chars of coach conversation text

**Algorithmic Fallback** (if AI fails or no coach data):
- Matches themes against 14 hardcoded known pairs (e.g., `stress↔grounding`, `overwhelm↔calm & regulate`)
- Uses `RELATIONSHIP_TYPE_MAP` for type assignment
- Capped at 8 relationships

#### AI Observation

If ≥2 unified themes exist:
1. **AI** (Gemini 2.5 Flash Lite): "What do [top 5 themes] collectively reveal about this leader's inner world? Two sentences max."
2. **Fallback**: `generateAlgorithmicObservation()` — template: "Your inner world is currently shaped by [theme1] and [theme2], surfacing most in your [top source]."

#### Node Click → Summary (V2)

When user clicks a bubble:
1. `fetchNodeSummary(keyword)` is called
2. **DEV_MODE**: Generates algorithmic summary from parent `semanticAnalysis` state
3. **Production**: Calls `insights-semantic-analysis` with `action: 'getNodeSummary'`
   - Reuses `getBubbleDetails()` to gather source excerpts
   - If `LOVABLE_API_KEY`: AI generates 3-5 sentence synthesis
   - Fallback: Template-based summary

#### Bubble Visualization

```typescript
const getBubbleSize = (weight: number) => {
  const minSize = 64, maxSize = 110;
  return minSize + (weight * (maxSize - minSize));
};
```

Max 12 bubbles. Staggered cascade layout. Taupe color scheme. SVG Bézier curve connections between related themes.

#### Upstream Data Dependencies

| Data Source | Created By | Working? |
|------------|-----------|----------|
| `daily_themes` | `daily-checkins` edge fn | ✅ Yes |
| `dialogue_sessions` / `dialogue_messages` | Coach conversation engine | ✅ Yes |
| `sanctuary_events` | Practice players | ✅ Yes |
| `tiny_wins` | `store-tiny-win` edge fn | ✅ Yes |
| `daily_checkins` | Daily Check-In | ✅ Yes |
| `coach_session_summaries` | `generate-coach-summary` edge fn | ✅ Yes |
| `coach_pattern_observations` | `detect-recurring-patterns` edge fn | ✅ Yes |

---

## 5. Unused/Orphaned Components

These files exist in `src/components/insights/` but are **NOT imported or rendered** on the Insights page:

| File | Lines | Original Purpose | Status |
|------|-------|-----------------|--------|
| `BaselineReferenceCard.tsx` | ~117 | Onboarding baseline display | **Orphaned** — logic merged into LeadershipPatternsCard |
| `BehaviorOutcomeCorrelations.tsx` | ~200 | Behavior→State correlations | **Orphaned** — logic merged into PerformanceRhythmCard |
| `CalendarStateCorrelations.tsx` | ~270 | Calendar→State correlations | **Orphaned** — logic merged into PerformanceRhythmCard |
| `CauseEffectInsights.tsx` | ~227 | "When X, you tend to Y" patterns | **Orphaned** — logic merged into PerformanceRhythmCard |
| `EnergyRhythm.tsx` | ~200 | Time-of-day × day-of-week heatmap | **Orphaned** — logic merged into PerformanceRhythmCard |
| `EnergyRhythmCurve.tsx` | — | Curve visualization | **Orphaned** |
| `FrictionAndStrengthDetail.tsx` | ~183 | Archetype strength/growth areas | **Orphaned** — logic merged into LeadershipPatternsCard |
| `LuxuryProgressRing.tsx` | — | Animated ring | **Orphaned** |
| `PracticeEffectiveness.tsx` | 183 | Top restorer practice | **Orphaned** — imported in file but NOT rendered in JSX |
| `SemanticBubbles.tsx` | 47 | Older bubble implementation | **Orphaned** |
| `WeeklyRhythmHeatmap.tsx` | — | Older heatmap implementation | **Orphaned** |

**Recommendation**: Delete all orphaned files to reduce maintenance burden. The `PracticeEffectiveness` logic could be valuable if re-integrated into a card.

---

## 6. AI vs Pure Logic Matrix

| Card | AI Model | Gateway | Fallback | Trigger Condition |
|------|----------|---------|----------|-------------------|
| **Self Mastery Patterns** (observation) | Gemini 2.5 Flash Lite | Lovable AI Gateway | Template from dimension deltas + friction | `LOVABLE_API_KEY` + ≥5 check-ins |
| **Tiny Wins** (dimension extraction) | Gemini 2.5 Flash Lite | Lovable AI Gateway | Keyword matching (`DIMENSION_PATTERNS`) | `LOVABLE_API_KEY` + unanalyzed wins exist |
| **Mind Map** (coach theme extraction) | Gemini 2.5 Flash Lite | Lovable AI Gateway | No coach themes extracted (skipped) | `LOVABLE_API_KEY` + coach messages > 50 chars |
| **Mind Map** (theme relationships) | Same as above | Same | Algorithmic pair matching from `RELATIONSHIP_TYPE_MAP` | Same |
| **Mind Map** (AI observation) | Gemini 2.5 Flash Lite | Lovable AI Gateway | `generateAlgorithmicObservation()` template | `LOVABLE_API_KEY` + ≥2 themes |
| **Mind Map** (node summary) | Gemini 2.5 Flash Lite | Lovable AI Gateway | Template summary from data | `LOVABLE_API_KEY` + on click |
| Readiness Rhythm | None | — | All algorithmic | — |

**✅ Fixed from prior audit**: `insights-semantic-analysis` now uses `LOVABLE_API_KEY` via Lovable AI Gateway (previously used unconfigured `GEMINI_API_KEY` via direct Google API).

---

## 7. Data Flow Architecture

### Database Tables Read by Insights

| Table | Cards That Read It | Read Via |
|-------|-------------------|----------|
| `profiles` | Card 1 (Self Mastery) | Edge fn (prod) / Direct (dev) |
| `daily_checkins` | Cards 1, 2, 3, 4 | Edge fns + Direct |
| `daily_themes` | Cards 1, 4 | Edge fns + Direct |
| `user_coach_insights` | Card 1 | Edge fn (prod) / Direct (dev) |
| `sanctuary_events` | Cards 1, 4 | Edge fn |
| `daily_ritual_completions` | Cards 1, 3 | Edge fn + Direct |
| `tiny_wins` | Cards 1, 2, 4 | Edge fn + Direct |
| `dialogue_sessions` | Cards 1, 3, 4 | Edge fn + Direct |
| `dialogue_messages` | Cards 1, 3, 4 | Edge fn + Direct |
| `calendar_connections` | Cards 1, 3 | Edge fn + Direct |
| `calendar_events` | Card 3 | Edge fn + Direct |
| `behavior_logs` | Cards 1, 3 | Edge fn + Direct |
| `inner_readiness_scores` | Cards 1, 3 | Edge fn + Direct |
| `coach_session_summaries` | Card 4 | Edge fn |
| `coach_pattern_observations` | Card 4 | Edge fn |
| `wearable_data` | Card 1 | Edge fn **(🔴 table doesn't exist)** |

### Tables Written To

| Table | Edge Function | Write Operation |
|-------|--------------|-----------------|
| `tiny_wins` | `tiny-wins-insights` | UPDATE: sets dimension columns + `analyzed_at` |

### Data Pipeline Health Summary

| Pipeline | Source → Table | Used By Cards | Status |
|----------|---------------|---------------|--------|
| Daily check-ins | DailyCheckIn → `daily_checkins` | 1, 2, 3, 4 | ✅ Working |
| Check-in themes | `daily-checkins` edge fn → `daily_themes` | 1, 4 | ✅ Working |
| Inner readiness | `compute-inner-readiness` → `inner_readiness_scores` | 1, 3 | ✅ Working |
| Ritual completions | Practice players → `daily_ritual_completions` | 1, 3 | ✅ Working |
| Sanctuary events | Practice players → `sanctuary_events` | 1, 4 | ✅ Working |
| Tiny wins | Coach Integrate → `tiny_wins` | 1, 2, 4 | ✅ Working |
| Win dimensions | `tiny-wins-insights` → `tiny_wins` UPDATE | 2 | ✅ Working |
| Coach sessions | Coach flow → `dialogue_sessions` + `dialogue_messages` | 1, 3, 4 | ✅ Working |
| Coach summaries | `generate-coach-summary` → `coach_session_summaries` | 4 | ✅ Working |
| Coach patterns | `detect-recurring-patterns` → `coach_pattern_observations` | 4 | ✅ Working |
| Coach insights | `extract-coach-insights` → `user_coach_insights` | 1 | ✅ Working |
| Behavior logs | Behavior logging UI → `behavior_logs` | 1, 3 | ✅ Working |
| Calendar events | `sync-calendar` → `calendar_events` | 3 | ✅ Working (if connected) |
| Wearable data | `sync-oura` → `wearable_data` | 1 | 🔴 **Table missing from schema** |

---

## 8. Security Audit

### Production (Edge Functions)

All 4 edge functions:
- Verify Auth0 JWT via shared `verifyAuth0JWT()` module
- Use `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS
- Scope all queries to verified `userId`

**✅ Secure**: User can only access their own data.

### DEV_MODE

- All direct Supabase queries use `DEV_USER.id` (`'dev-user-123'`)
- RLS policies include `DEV_MODE` rules allowing `dev-user-123` access
- **🔴 PerformanceRhythmCard DEV_MODE**: `dialogue_messages` query has NO `user_id` filter — fetches all users' messages (line 123-126)

### Exposed Client-Side Logic

In DEV_MODE, these algorithms run client-side (visible in browser DevTools):
1. Theme extraction keyword lists (`THEME_KEYWORDS`)
2. Dimension extraction logic (DEV fallback)
3. Semantic pair relationships
4. Archetype cascade thresholds (DEV version)

In production, all proprietary logic is server-side in edge functions. ✅

---

## 9. Bug Report & Correctness Issues

### 🔴 Critical

**BUG-1: `wearable_data` Table Missing**
- **Location**: `state-patterns-insights/index.ts` line 129
- **Issue**: Queries `wearable_data` table which doesn't exist in database schema
- **Impact**: HRV signals (weight 0.10 each for Recalibration and Renewal) always unavailable; weights redistributed to other signals. No error thrown — query returns empty.
- **Fix**: Either create the table or remove the query and adjust signal weights

**BUG-2: PerformanceRhythmCard DEV_MODE Dialogue Leak**
- **Location**: `PerformanceRhythmCard.tsx` line 123-126
- **Issue**: `dialogue_messages` query has `.limit(200)` but no `.eq('user_id', ...)` filter
- **Impact**: In DEV_MODE, fetches messages from ALL users. Could expose other users' coach conversations in presence calculation.
- **Fix**: Add user_id filter via session join or direct filter

### 🟡 Medium

**BUG-3: DEV_MODE Coach Insight Logic Divergence**
- **Location**: `LeadershipPatternsCard.tsx` lines 120-129 vs `state-patterns-insights/index.ts` lines 214-248
- **Issue**: DEV uses keyword matching only; production prioritizes explicit `insight_type` queries
- **Impact**: Dev testing doesn't reflect production behavior for Lean On / Watch For

**BUG-4: Practice Effectiveness Dead Component**
- **Location**: `src/components/insights/PracticeEffectiveness.tsx`
- **Issue**: Component file exists and is imported (`line 17` of Insights.tsx) but never rendered in JSX
- **Impact**: Dead import increases bundle size; component logic (Practice ROI) is not surfaced to users

**BUG-5: Heatmap Timezone Sensitivity**
- **Location**: `PerformanceRhythmCard.tsx` line 149-151
- **Issue**: `new Date(ci.created_at).getHours()` uses browser timezone. If DB stores UTC, a 11pm EST check-in becomes 4am UTC ("Morning" instead of "Evening")
- **Impact**: Check-ins near midnight may appear in wrong time window

### 🟢 Low

**BUG-6: Flow Practice Score Not Calendar-Gated**
- **Location**: `state-patterns-insights/index.ts` lines 317-321
- **Issue**: `flowUnderLoad` counts ALL flow practices, not just those under calendar pressure (comment says "approximate"). The availability condition requires `hasCalendar` but the score itself doesn't.
- **Impact**: Slight overcount of clarity signal

**BUG-7: Pattern Description Truncation**
- **Location**: `insights-semantic-analysis/index.ts` lines 368-372
- **Issue**: `pattern_description` first 3 words used as theme; if description is "The user frequently" → theme becomes "The user frequently"
- **Impact**: Low-quality themes from short pattern descriptions

---

## 10. Redundancy Analysis

### Confirmed Redundancies

**1. 11 Orphaned Component Files**

See §5. All original card logic has been consolidated into 4 mega-cards. The old files remain as dead code.

**2. Duplicate Cause-Effect Logic**

Cause-Effect patterns are computed in TWO places:
- `PerformanceRhythmCard.tsx` lines 258-289 (DEV_MODE)
- `performance-rhythm-insights/index.ts` (production)

Both implement identical behavior→outcome correlation with same thresholds (≥2 count, ≥50% confidence). This is expected (dev mirrors prod) but the code is fully duplicated rather than shared.

**3. Duplicate Archetype Resolution**

Archetype cascade logic appears in:
- `state-patterns-insights/index.ts` lines 19-29
- `LeadershipPatternsCard.tsx` lines 60-66
- `src/utils/userArchetypeEngine.ts` (LEGACY — different IDs)

The first two are in sync. The third uses legacy IDs and is not consumed by the Insights page.

**4. Theme Extraction in Multiple Places**

Theme keyword extraction runs in:
- `Insights.tsx` lines 22-49 (`THEME_KEYWORDS` — DEV_MODE Mind Map)
- `insights-semantic-analysis/index.ts` lines 306-320 (win keyword scan)
- Both use different keyword sets for different purposes — not truly redundant, but confusing.

### Cards That Could Be Merged

All 10 original cards have already been consolidated into 4 mega-cards. No further merging recommended at this time.

---

## 11. Recommendations

### Priority 1 — Fix Critical Bugs

1. **Fix `wearable_data` table reference** in `state-patterns-insights`: Either create the table (if Oura integration writes to it) or remove queries + adjust signal weights to properly redistribute
2. **Add user_id filter** to `PerformanceRhythmCard.tsx` DEV_MODE `dialogue_messages` query

### Priority 2 — Data Integrity

3. **Align DEV_MODE coach insight logic** with production (add explicit `insight_type` query in `LeadershipPatternsCard.tsx`)
4. **Fix timezone handling** in PerformanceRhythmCard heatmap — use `checkin_date` + `time_of_day` from `inner_readiness_scores` instead of parsing `created_at`
5. **Remove `PracticeEffectiveness` import** from `Insights.tsx` (dead import)

### Priority 3 — Cleanup

6. **Delete 11 orphaned component files** in `src/components/insights/`:
   - `BaselineReferenceCard.tsx`, `BehaviorOutcomeCorrelations.tsx`, `CalendarStateCorrelations.tsx`, `CauseEffectInsights.tsx`, `EnergyRhythm.tsx`, `EnergyRhythmCurve.tsx`, `FrictionAndStrengthDetail.tsx`, `LuxuryProgressRing.tsx`, `PracticeEffectiveness.tsx`, `SemanticBubbles.tsx`, `WeeklyRhythmHeatmap.tsx`
7. **Remove unused `insightsTier` computation** from Insights.tsx (or re-purpose for page-level progressive unlock)

### Priority 4 — Architecture

8. **Extract shared constants** (archetype cascade, state colors, time windows) into a shared config file
9. **Add error toasts** — currently all fetch failures are silently logged to console
10. **Consider Practice ROI re-integration** — the PracticeEffectiveness logic (which practice → improved next-day state) is valuable and not surfaced anywhere in the current layout

### Priority 5 — AI Enhancement

11. **Cross-card AI synthesis**: A "Weekly Summary" insight that connects patterns across all 4 cards
12. **Dynamic dimension insights**: Replace hardcoded `DIMENSION_INSIGHTS` with contextual AI generation
13. **Presence insight refinement**: Current presence keywords ("showed up well", "held the room") are simplistic; AI could score presence more nuancedly from coach transcripts

---

## 12. Appendix: Edge Function Reference

### `state-patterns-insights` (Card 1)

| Property | Value |
|----------|-------|
| **File** | `supabase/functions/state-patterns-insights/index.ts` (561 lines) |
| **Auth** | Auth0 JWT via `verifyAuth0JWT()` |
| **Input** | No body required |
| **Tables Read** | `profiles`, `daily_checkins`, `daily_themes`, `user_coach_insights`, `sanctuary_events`, `daily_ritual_completions`, `tiny_wins`, `wearable_data` (🔴), `dialogue_sessions`, `dialogue_messages`, `calendar_connections`, `behavior_logs`, `inner_readiness_scores` |
| **Tables Written** | None |
| **AI** | Gemini 2.5 Flash Lite via Lovable Gateway (observation — tool_choice) |
| **Fallback** | `generateFallbackObservation()` template |
| **Output** | `{ data: LeadershipPatternsData }` — archetype, scores, deltas, friction, trend, themes, coach insights, observation |

### `tiny-wins-insights` (Card 2)

| Property | Value |
|----------|-------|
| **File** | `supabase/functions/tiny-wins-insights/index.ts` (427 lines) |
| **Auth** | Auth0 JWT via `verifyAuth0JWT()` |
| **Input** | `{ days: 14 }` |
| **Tables Read** | `tiny_wins` |
| **Tables Written** | `tiny_wins` (UPDATE: dimension columns + `analyzed_at`) |
| **AI** | Gemini 2.5 Flash Lite via Lovable Gateway (dimension extraction per win — tool_choice) |
| **Fallback** | Keyword matching (`DIMENSION_PATTERNS`) |
| **Output** | `{ data: { dimensions, themes, summary, winsCount, observation, patternLine } }` |
| **Side Effect** | Updates each unanalyzed win with extracted dimensions |

### `performance-rhythm-insights` (Card 3)

| Property | Value |
|----------|-------|
| **File** | `supabase/functions/performance-rhythm-insights/index.ts` (327 lines) |
| **Auth** | Auth0 JWT via `verifyAuth0JWT()` |
| **Input** | No body required |
| **Tables Read** | `daily_checkins`, `calendar_connections`, `calendar_events`, `behavior_logs`, `inner_readiness_scores`, `daily_ritual_completions`, `dialogue_sessions`, `dialogue_messages` |
| **Tables Written** | None |
| **AI** | None |
| **Output** | `{ presenceScore, presenceLabel, presenceInsight, calendarInsight, causeEffectInsight, grid, bestReadinessWindow, checkInCount, behaviorLogCount, hasCalendar, dataSourceNote }` |

### `insights-semantic-analysis` (Card 4)

| Property | Value |
|----------|-------|
| **File** | `supabase/functions/insights-semantic-analysis/index.ts` (707 lines) |
| **Auth** | Auth0 JWT via `verifyAuth0JWT()` |
| **Input** | `{ days: 7, action: 'analyze' | 'getNodeSummary' | 'getBubbleDetails', keyword? }` |
| **Tables Read** | `daily_themes`, `dialogue_sessions`, `dialogue_messages`, `sanctuary_events`, `tiny_wins`, `daily_checkins`, `coach_session_summaries`, `coach_pattern_observations` |
| **Tables Written** | None |
| **AI** | Gemini 2.5 Flash Lite via Lovable Gateway (theme extraction, relationships, observation, node summaries) |
| **Fallback** | Algorithmic pair matching + `generateAlgorithmicObservation()` template |
| **Output (analyze)** | `{ data: { themePatterns, unifiedThemes, themeRelationships, aiObservation } }` |
| **Output (getNodeSummary)** | `{ data: { keyword, totalCount, sources, recentDate, aiSummary, connectedThemes } }` |
| **Output (getBubbleDetails)** | `{ data: { keyword, totalCount, recentMentions } }` |

---

*End of Report*
