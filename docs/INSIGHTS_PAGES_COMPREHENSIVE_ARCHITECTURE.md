# Insights Pages — Comprehensive Architecture Document

> Last updated: 2026-04-12
> Primary page: `src/pages/Insights.tsx` (1,061 lines)
> Edge Functions: `state-patterns-insights` (688 lines), `insights-semantic-analysis` (708 lines), `performance-rhythm-insights` (927 lines), `tiny-wins-insights` (435 lines), `generate-energy-insight` (121 lines), `generate-dashboard-insight` (84 lines)

---

## 1. System Purpose

The Insights page is a **30-day intelligence dashboard** that synthesises signals from check-ins, coaching sessions, practices, calendar, wearable data, and tiny wins into actionable leadership patterns. It surfaces:
- State distribution and friction trends
- Archetype-aware leadership patterns (strengths, growth areas, lean-on/watch-for)
- Inner world theme mapping (semantic bubbles with AI-detected relationships)
- Psychological dimension analysis (from tiny wins)
- Performance rhythm heatmaps (day × time-of-day correlations)
- Practice effectiveness metrics
- Calendar-state and behavior-outcome correlations

---

## 2. Architecture Overview

```text
┌───────────────────────────────────────────────────────────────┐
│                    Insights.tsx (Page)                         │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ Progressive   │  │ Leadership   │  │ Inner World      │    │
│  │ Unlock Msg    │  │ Patterns     │  │ Bubbles          │    │
│  └──────────────┘  └──────────────┘  └──────────────────┘    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ Performance  │  │ Psychological│  │ Practice          │    │
│  │ Rhythm Card  │  │ Dimensions   │  │ Effectiveness     │    │
│  └──────────────┘  └──────────────┘  └──────────────────┘    │
│  ┌──────────────┐  ┌──────────────┐                           │
│  │ Cause-Effect │  │ Calendar-    │                           │
│  │ Insights     │  │ State Corr.  │                           │
│  └──────────────┘  └──────────────┘                           │
│                                                               │
│  Data Loading: 4 parallel edge function calls on mount        │
│  + Direct Supabase queries for correlations                   │
└───────────────────────────────────────────────────────────────┘
           │              │              │              │
           ▼              ▼              ▼              ▼
    state-patterns   insights-      performance-   tiny-wins-
    -insights       semantic-      rhythm-        insights
                    analysis       insights
```

---

## 3. Data Loading Flow

On mount, the page fires **4 parallel edge function calls** + direct Supabase queries:

```typescript
await Promise.all([
  fetchStatePatterns(),        // state-patterns-insights
  fetchSemanticAnalysis(),     // insights-semantic-analysis
  fetchPerformanceRhythm(),    // performance-rhythm-insights
  fetchTinyWinsInsights(),     // tiny-wins-insights
]);
```

Each call uses the Auth0 JWT from `getAuthToken()` and the project's edge function URL.

---

## 4. Edge Function: `state-patterns-insights` (688 lines)

### 4.1 Purpose
Central intelligence engine for state distribution, archetype analysis, friction detection, coach insights, and multi-signal leadership patterns.

### 4.2 Upstream Data (12 parallel queries)

| Table | What It Provides |
|-------|------------------|
| `profiles` | `user_archetype`, `component_scores`, `mental_fitness_baseline`, `growth_priority` |
| `daily_checkins` | 30-day outcomes, energy_balance, clarity_level, confidence_level, state_tags |
| `daily_themes` | Theme phrases and drivers |
| `user_coach_insights` | Explicit strength/growth_area insights (active, latest 10) |
| `sanctuary_events` | Practice completions with categories |
| `daily_ritual_completions` | Ritual completion status by period |
| `tiny_wins` | Win dates for engagement tracking |
| `wearable_data` | HRV data for 30 days |
| `dialogue_sessions` | Coach session count |
| `calendar_connections` | Whether calendar is connected |
| `behavior_logs` | Behavior types logged |
| `inner_readiness_scores` | Composite scores, energy tiers, context statements |

**Secondary queries** (dependent):
- `dialogue_messages` — User messages from coach sessions (for keyword scanning)
- `user_coach_insights` — Explicit strength and growth_area type insights

### 4.3 Archetype Resolution

Uses same cascade as onboarding but with legacy mapping support:

```typescript
const LEGACY_MAP = {
  natural_regulator: "grounded-leader",
  strategic_pauser: "clear-thinker",
  high_octane_performer: "resilient-performer",
  awareness_builder: "intensity-driver",
  grounded_master: "grounded-leader",
  balanced_navigator: "adaptive-navigator",
};
```

Each archetype includes:
- `title` — Display name
- `leanOn` — Strength statement
- `watchFor` — Risk statement

### 4.4 Core Calculations

#### State Distribution
```
distribution = { focused: N, steady: N, scattered: N, drained: N, overwhelmed: N }
typicalState = most frequent state
```

#### Friction Frequency
```
frictionPct = (lowStateDays / totalDays) × 100
Labels: ≤25% → "Low friction", ≤50% → "Moderate friction", ≤75% → "High friction pattern", >75% → "Sustained friction"
```

#### Friction Trend (7-day vs prior 7-day)
```
If recentFriction - priorFriction ≥ 10% → "declining"
If priorFriction - recentFriction ≥ 10% → "improving"
Else → "stable"
Fallback: energy_balance average comparison (threshold: ±5)
```

#### Coach Insight Extraction
1. **Explicit** (priority): Query `user_coach_insights` for `insight_type = 'strength'` and `'growth_area'`
2. **Keyword scan** (fallback): Scan coach messages for strength/friction keywords

#### Keyword Scanning (Coach Dialogue)
```
REG_POSITIVE = /stayed grounded|regulation held|maintained composure|.../
REG_NEGATIVE = /escalated|lost composure|reacted quickly|.../
CLARITY_POSITIVE = /cut through clearly|sharp thinking|decisive|.../
CLARITY_NEGATIVE = /lost in the weeds|analysis paralysis|foggy|.../
RENEWAL_POSITIVE = /recovering well|building reserves|restored|.../
RENEWAL_NEGATIVE = /running on empty|not restoring|depleted|.../

Score per regex: +5 for positive, -5 for negative (capped at ±15)
```

#### Weighted Score Computation
```typescript
function computeWeightedScore(signals: Signal[]): number {
  // Redistributes weights among available signals only
  const available = signals.filter(s => s.available);
  const totalWeight = available.reduce((sum, s) => sum + s.weight, 0);
  return available.reduce((sum, s) => sum + s.value * (s.weight / totalWeight), 0);
}
```

### 4.5 LLM Usage

Uses `callClaudeText` (Claude Haiku) for generating the AI observation based on aggregated data. Falls back to algorithmic observation if AI unavailable.

### 4.6 Response Payload

```typescript
{
  distribution: Record<string, number>,
  observation: string | null,
  checkInCount: number,
  weekData: DayData[],
  archetype: { id, title, leanOn, watchFor },
  baselineScores: { recalibration, clarity, renewal },
  frictionFrequency: { percentage, label, trendDirection },
  coachStrength: string | null,
  coachFriction: string | null,
  recurringThemes: { phrase, count }[],
  leadershipPatterns: LeadershipPatternsData,
  hasWearable: boolean,
  hasCalendar: boolean,
}
```

---

## 5. Edge Function: `insights-semantic-analysis` (708 lines)

### 5.1 Purpose
Unified theme aggregation from all data sources + AI-powered relationship detection.

### 5.2 Actions
- `analyze` (default) — Full semantic analysis
- `getBubbleDetails` — Legacy: details for a specific keyword
- `getNodeSummary` — V2: AI-summarised node with connected themes

### 5.3 Unified Theme Aggregation

Themes are merged from **4 sources** with source tracking:

| Source | Table | Extraction Method |
|--------|-------|-------------------|
| Coach | `dialogue_messages` (user messages) | LLM extraction (Claude Haiku): 5-8 themes + relationships |
| Practice | `sanctuary_events` | Category mapping: pause/regulate → "calm & regulate", flow/focus → "focus & presence" |
| Wins | `tiny_wins` | Keyword extraction from win text |
| Check-ins | `daily_checkins.state_tags` | Direct tag inclusion |
| Themes | `daily_themes` | Theme phrases with drivers |

### 5.4 LLM Prompt (Theme Extraction from Coach Conversations)

```
Analyze these coaching conversation excerpts and:
1. Extract the 5-8 most important themes or topics the user discussed
2. Identify 2-4 meaningful relationships between themes with relationship types

Return ONLY valid JSON:
{
  "keywords": [{"keyword": "decision fatigue", "count": 3}],
  "relationships": [{"from": "stress", "to": "grounding", "strength": 0.8, "type": "grounded by"}]
}

Relationship types must be one of: "often co-occur", "tension between", "feeds into", "grounded by"
```

### 5.5 Hardcoded Relationship Types
```typescript
const RELATIONSHIP_TYPE_MAP = {
  'stress|grounding': 'grounded by',
  'decision fatigue|clarity': 'feeds into',
  'energy drain|energy renewal': 'tension between',
  'focus|clarity': 'often co-occur',
  // ... 18 total mappings
};
```

### 5.6 Response: `SemanticAnalysisResponse`
```typescript
{
  themePatterns: { phrase, count, driver }[],
  unifiedThemes: { theme, totalCount, weight, sources: { coach, practice, wins, checkins } }[],
  themeRelationships: { from, to, strength, type }[],
  aiObservation: string,
}
```

---

## 6. Edge Function: `performance-rhythm-insights` (927 lines)

### 6.1 Purpose
Generates the performance rhythm heatmap (Day × Time window) with calendar-state correlations and high-stakes event impact analysis.

### 6.2 Upstream Data (9 parallel queries)

| Table | Purpose |
|-------|---------|
| `daily_checkins` | State outcomes by date/time |
| `calendar_connections` | Whether calendar is active |
| `calendar_events` | Event titles for correlation |
| `behavior_logs` | Behavior type patterns |
| `inner_readiness_scores` | Composite scores for heatmap |
| `daily_ritual_completions` | Practice completion patterns |
| `dialogue_sessions` | Coach session dates |
| `jit_preferences` | JIT skip/engage patterns |
| `wearable_data` | HRV patterns by day |

### 6.3 Heatmap Construction

**Grid**: 7 days (Mon-Sun) × 3 time windows (Morning 5-11, Afternoon 12-16, Evening 17-4)

Each cell contains:
- `outcome` — most common check-in state for that slot
- `compositeScore` — average inner readiness composite
- `divergence` — flag if check-in and readiness disagree

### 6.4 High-Stakes Event Classification

```typescript
const EVENT_TYPE_KEYWORDS = {
  board: ["board", "board meeting", ...],
  investor: ["investor", "vc", "funding", "pitch"],
  quarterly: ["quarterly", "qbr", "q1", ...],
  strategic: ["strategy", "strategic planning", "offsite"],
  client: ["client", "customer", "demo"],
  performance_review: ["performance review", "annual review"],
  all_hands: ["all hands", "town hall"],
  media: ["interview", "podcast", "media"],
  deadline: ["deadline", "urgent", "due"],
  presentation: ["presentation", "speaking", "conference"],
};
```

### 6.5 Response Payload
```typescript
{
  heatmap: HeatmapCell[][],     // 7×3 grid
  dayLabels: string[],
  timeLabels: string[],
  calendarCorrelations: { eventType, typicalState, occurrences, confidence }[],
  behaviorCorrelations: { behaviorType, typicalState, occurrences, confidence }[],
  hasCalendar: boolean,
  hasWearable: boolean,
  totalDataPoints: number,
}
```

---

## 7. Edge Function: `tiny-wins-insights` (435 lines)

### 7.1 Purpose
Analyses tiny wins to extract psychological dimensions, sentiment, and growth patterns.

### 7.2 Psychological Dimension Patterns

```typescript
const DIMENSION_PATTERNS = {
  sentiment: { positive: [...], negative: [...], mixed: [...] },
  emotion: { joy, pride, relief, gratitude, confidence, hope, courage },
  agency: { proactive, responsive, collaborative, supported },
  regulation: { regulated, intentional, reactive },
  growth: { learning, breakthrough, mastery, resilience, boundary, 'letting-go' },
};
```

### 7.3 Display Labels (C-Suite Language)
```typescript
{
  emotion: "What you felt",
  agency: "How you showed up",
  regulation: "How you led yourself",
  growth: "What it built",
}
```

### 7.4 Per-Dimension Insight Text
Each dimension×value combination has a bespoke insight paragraph explaining the leadership significance. Example:
> **Pride**: "Pride anchors accomplishment in your nervous system. This emotional marker strengthens your internal sense of competence–a key driver of Resilience when facing future challenges."

### 7.5 LLM Usage
Uses Claude Haiku with `callClaudeWithTools` for structured extraction when keyword matching is insufficient.

### 7.6 Response
```typescript
{
  themes: string[],
  dimensions: { dimension, value, count, displayLabel, insight }[],
  observation: string | null,
  patternLine: string | null,
  summary: string | null,
  winsCount: number,
}
```

---

## 8. Client-Side Components

| Component | File | Data Source | What It Renders |
|-----------|------|------------|-----------------|
| `ProgressiveUnlockMessage` | `insights/ProgressiveUnlockMessage.tsx` | Check-in count | Data sufficiency message (needs ≥3 check-ins) |
| `LeadershipPatternsCard` | `insights/LeadershipPatternsCard.tsx` | `state-patterns-insights` | Archetype, baseline scores, lean-on/watch-for, friction %, coach insights |
| `InnerWorldBubbles` | `insights/InnerWorldBubbles.tsx` | `insights-semantic-analysis` | Interactive bubble chart with theme relationships |
| `PsychologicalDimensionBubbles` | `insights/PsychologicalDimensionBubbles.tsx` | `tiny-wins-insights` | Dimension bubbles (emotion, agency, regulation, growth) |
| `PerformanceRhythmCard` | `insights/PerformanceRhythmCard.tsx` | `performance-rhythm-insights` | 7×3 heatmap with day/time patterns |
| `PracticeEffectiveness` | `insights/PracticeEffectiveness.tsx` | Direct Supabase query | Practice category completion rates |
| `CauseEffectInsights` | `insights/CauseEffectInsights.tsx` | Direct Supabase query | "When [trigger], you tend to [state]" patterns |
| `CalendarStateCorrelations` | `insights/CalendarStateCorrelations.tsx` | Direct Supabase query | "Board meetings correlate with overwhelmed 85%" |
| `BehaviorOutcomeCorrelations` | `insights/BehaviorOutcomeCorrelations.tsx` | Direct Supabase query | "When you Confronted, you checked in Focused 70%" |
| `EnergyRhythm` | `insights/EnergyRhythm.tsx` | Direct from check-ins | Rhythm curve visualisation |
| `EnergyRhythmCurve` | `insights/EnergyRhythmCurve.tsx` | Direct from check-ins | SVG energy curve |
| `LuxuryInsightCard` | `insights/LuxuryInsightCard.tsx` | Various | Premium-styled insight wrapper |
| `BaselineReferenceCard` | `insights/BaselineReferenceCard.tsx` | Profile data | Onboarding baseline reference |
| `InsightInfoModal` | `insights/InsightInfoModal.tsx` | — | Info modal for insight explanations |
| `LockedInsightSection` | `insights/LockedInsightSection.tsx` | — | Locked state for insufficient data |
| `WeeklyRhythmHeatmap` | `insights/WeeklyRhythmHeatmap.tsx` | Check-in data | Day-of-week × time heatmap |
| `FrictionAndStrengthDetail` | `insights/FrictionAndStrengthDetail.tsx` | State patterns | Friction/strength detail panels |
| `SemanticBubbles` | `insights/SemanticBubbles.tsx` | Semantic analysis | Theme bubble visualisation |

---

## 9. Database Tables (Read)

| Table | Used By | Purpose |
|-------|---------|---------|
| `daily_checkins` | All edge functions | State outcomes, energy balance, clarity, confidence |
| `daily_themes` | state-patterns, semantic | Theme phrases |
| `profiles` | state-patterns | Archetype, baseline, growth_priority |
| `dialogue_sessions` | state-patterns, semantic | Coach session IDs |
| `dialogue_messages` | state-patterns, semantic | User messages for theme extraction |
| `user_coach_insights` | state-patterns | Explicit strength/growth_area insights |
| `sanctuary_events` | state-patterns, semantic | Practice completions |
| `daily_ritual_completions` | state-patterns, perf-rhythm | Ritual completion |
| `tiny_wins` | state-patterns, tiny-wins | Win text and dates |
| `wearable_data` | state-patterns, perf-rhythm | HRV data |
| `calendar_connections` | state-patterns, perf-rhythm | Calendar active flag |
| `calendar_events` | perf-rhythm | Event titles for correlation |
| `behavior_logs` | state-patterns, perf-rhythm | Behavior patterns |
| `inner_readiness_scores` | state-patterns, perf-rhythm | Composite scores, tiers |
| `jit_preferences` | perf-rhythm | JIT skip/engage patterns |
| `practice_sessions` | Direct query | Practice effectiveness |

---

## 10. Progressive Unlock System

The Insights page uses a progressive unlock model based on data sufficiency:

| Data Level | What Unlocks |
|-----------|-------------|
| 0 check-ins | "Start checking in to unlock insights" |
| 1-2 check-ins | Basic state distribution |
| 3+ check-ins | Full state patterns, friction analysis |
| 5+ check-ins | Performance rhythm heatmap |
| 7+ check-ins | Trends and correlations |
| 1+ coach sessions | Coach insights (strength/friction) |
| 1+ tiny wins | Psychological dimensions |
| Calendar connected | Calendar-state correlations |
| Wearable connected | HRV-based recovery patterns |

---

## 11. Deep Link Integration (from Smart Nudges)

The Insights page accepts `highlight` query params from push notifications:

```typescript
const [searchParams] = useSearchParams();
const highlight = searchParams.get('highlight');
```

Supported highlights: `consecutive_low`, `recovery_deficit`, `calendar_correlation`

These trigger auto-scrolling to the relevant section and a pulse animation.

---

## 12. Secrets Required

| Secret | Used By | Purpose |
|--------|---------|---------|
| `ANTHROPIC_API_KEY` | semantic-analysis, state-patterns, tiny-wins | AI theme extraction, observations |
| `SUPABASE_URL` | All edge functions | Database access |
| `SUPABASE_SERVICE_ROLE_KEY` | All edge functions | Admin DB access |

---

## 13. Feature Flags / Configuration

| Flag | Location | Effect |
|------|----------|--------|
| `DEV_MODE` | `src/config/devMode.ts` | Uses hardcoded dev user for testing |
| `days` param | Edge function request body | Analysis window (default: 30) |
| `hasCalendar` / `hasWearable` | Response flags | Controls UI section visibility |

---

## 14. LLM Models Used

| Edge Function | Model | Purpose |
|---------------|-------|---------|
| `insights-semantic-analysis` | `claude-haiku-3-5-20241022` | Theme extraction from coach conversations |
| `insights-semantic-analysis` | `claude-haiku-3-5-20241022` | Node summary generation |
| `state-patterns-insights` | `claude-haiku-3-5-20241022` | AI observation generation |
| `tiny-wins-insights` | `claude-haiku-3-5-20241022` | Structured dimension extraction |
| `generate-energy-insight` | `claude-haiku-3-5-20241022` | Energy insight copy |
| `generate-dashboard-insight` | `claude-haiku-3-5-20241022` | Dashboard insight copy |

---

## 15. Performance Considerations

- All edge functions use `Promise.all()` for parallel database queries
- `state-patterns-insights` includes step timers for monitoring: `[state-patterns-insights] ⏱ auth: Xms`, `parallel-queries: Xms`, `coach-queries: Xms`
- Theme extraction truncates coach conversation content at 3,000 characters
- AI calls have implicit timeouts via Anthropic client
- AI failures fall through to algorithmic/keyword-based fallbacks

---

## 16. Relationship to Other Systems

### Upstream (Data Producers)
- **Daily Check-in** → `daily_checkins`, `daily_themes`
- **Self-Mastery Coach** → `dialogue_sessions`, `dialogue_messages`, `user_coach_insights`, `coach_pattern_observations`
- **Practices/Rituals** → `sanctuary_events`, `daily_ritual_completions`, `practice_sessions`
- **Tiny Wins** → `tiny_wins`
- **Calendar Sync** → `calendar_events`, `calendar_connections`
- **Wearable Sync** → `wearable_data`
- **Inner Readiness Engine** → `inner_readiness_scores`
- **Behavior Logging** → `behavior_logs`
- **Onboarding** → `profiles` (archetype, baseline scores)

### Downstream (Data Consumers)
- The Insights page is a **read-only consumer** — it does not write to any tables
- Deep link highlights from Smart Nudges direct users to specific sections
- Performance Readiness Brief references some of the same patterns for real-time use
