# Your Self Mastery Patterns — Full Technical Documentation

> **Card Title:** Your Self Mastery Patterns  
> **Location:** `/insights` page, first card  
> **Component:** `src/components/insights/LeadershipPatternsCard.tsx`  
> **Edge Function:** `supabase/functions/state-patterns-insights/index.ts`

---

## 1. Purpose

This card provides the **longitudinal pattern read** for senior executives. It is not what today's check-in surfaces — it is what has been *consistently true* across 30 days of coach sessions, compass themes, and inner readiness scores. A C-suite leader cannot see this pattern themselves without the aggregation. This card shows it to them.

---

## 2. Architecture

```
┌──────────────────────┐      ┌──────────────────────────────────┐
│  LeadershipPatterns   │      │  state-patterns-insights         │
│  Card.tsx (Client)    │─────▶│  Edge Function (Server)          │
│                       │      │                                  │
│  DEV_MODE: direct DB  │      │  Auth0 token → userInfo → userId │
│  PROD: edge function  │      │  Parallel DB queries             │
│                       │◀─────│  AI observation (Gemini)         │
│  Display-ready render │      │  Returns display-ready JSON      │
└──────────────────────┘      └──────────────────────────────────┘
```

### Data Flow

1. **Client** sends request with Auth0 bearer token (production) or queries DB directly (DEV_MODE).
2. **Edge function** validates the token against Auth0 `/userinfo`, extracts `userId` (`sub` claim).
3. **Parallel database queries** fetch profiles, check-ins, themes, and coach insights.
4. **Server-side calculations** produce all metrics, scores, archetype resolution, and trend analysis.
5. **AI observation** is generated via Lovable AI gateway (Gemini 2.5 Flash Lite) with structured output.
6. **Response** is a single JSON object — the client is a pure renderer with zero scoring logic.

### Security

- All calculation logic lives server-side in the edge function.
- Client receives display-ready values only.
- No scoring logic, archetype thresholds, or keyword lists are exposed to the client.
- Auth0 token validation ensures user can only access their own data.
- Supabase service role key is used server-side for database access.

---

## 3. Data Sources

| Source Table | Fields Used | Time Range | Purpose |
|---|---|---|---|
| `profiles` | `user_archetype`, `component_scores` | Current row | Baseline archetype + onboarding dimension scores |
| `daily_checkins` | `checkin_date`, `outcome`, `energy_balance`, `clarity_level`, `confidence_level` | Last 30 days | State distribution, friction, composite trend, current dimension scores |
| `daily_themes` | `theme_phrase`, `theme_driver` | Last 30 days | Recurring compass themes |
| `user_coach_insights` | `insight_content`, `insight_type`, `created_at` | Last 10 entries | Coach strength/friction pattern matching |

---

## 4. Calculations

### 4.1 Archetype Resolution (v2 Unified System)

#### The Five Archetypes

| Priority | Archetype | ID | Condition | Lean On | Watch For |
|---|---|---|---|---|---|
| 1 | The Grounded Master | `grounded-leader` | ER ≥ 65 AND EN ≥ 55 | Recalibration | Renewal depth |
| 2 | The Resilient Performer | `resilient-performer` | EN ≥ 65 AND ER ≥ 50 | Renewal | Clarity under load |
| 3 | The Clear Thinker | `clear-thinker` | FR ≥ 65 AND ER ≥ 45 | Clarity | Recalibration speed |
| 4 | The Intensity Driver | `intensity-driver` | ER ≥ 60 AND FR < 50 | Recalibration | Clarity balance |
| 5 | The Adaptive Navigator | `adaptive-navigator` | Default (fallback) | Flexibility | Recalibration depth |

**Evaluation order matters.** The first condition met in this priority sequence determines the assignment. This is identical to the onboarding scoring engine.

#### Score Key Mapping

The three component scores are stored in `profiles.component_scores` (JSONB) using v2 keys, with legacy fallback:

| Dimension Label | v2 Key | Legacy Key | Variable |
|---|---|---|---|
| Recalibration | `energyRegulation` | `q2_energy_regulation` | ER |
| Clarity | `focusRecovery` | `q3_focus_recovery` | FR |
| Renewal | `energyRenewal` | `q4_energy_renewal` | EN |

**Resolution logic (server-side):**

```typescript
const er = componentScores.energyRegulation ?? componentScores.q2_energy_regulation ?? 50;
const fr = componentScores.focusRecovery ?? componentScores.q3_focus_recovery ?? 50;
const en = componentScores.energyRenewal ?? componentScores.q4_energy_renewal ?? 50;
```

If `component_scores` is null, the function falls back to resolving from the `user_archetype` string ID using a mapping table that covers both v2 IDs (`grounded-leader`, etc.) and legacy IDs (`natural_regulator`, `strategic_pauser`, etc.).

#### Legacy ID Mapping

| Legacy ID | Maps To |
|---|---|
| `natural_regulator` | `grounded-leader` (Grounded Master) |
| `strategic_pauser` | `clear-thinker` (Clear Thinker) |
| `high_octane_performer` | `resilient-performer` (Resilient Performer) |
| `awareness_builder` | `intensity-driver` (Intensity Driver) |
| `grounded_master` | `grounded-leader` (Grounded Master) |
| `balanced_navigator` | `adaptive-navigator` (Adaptive Navigator) |

---

### 4.2 Archetype Evolution Detection

The card tracks whether a user's operating archetype has **shifted** from their onboarding baseline.

#### Baseline Archetype

- Source: `profiles.component_scores` (set at onboarding, never changes)
- The three dimension scores (ER, FR, EN) are extracted and run through the 5-archetype cascade
- Result: `baselineArchetypeTitle` (e.g., "The Adaptive Navigator")

#### Current Archetype

- Source: Last 7 days of `daily_checkins`
- Requires: ≥ 7 total check-ins AND at least one value each for `energy_balance`, `clarity_level`, `confidence_level` in the last 7 days
- Calculation:
  - `currentER` = average of `energy_balance` over last 7 days
  - `currentFR` = average of `clarity_level` over last 7 days  
  - `currentEN` = average of `confidence_level` over last 7 days
- These averages are run through the **same** 5-archetype priority cascade
- Result: `currentArchetypeTitle` (e.g., "The Grounded Master")

#### Evolution Flag

```typescript
archetypeEvolved = baselineArchetypeTitle !== currentArchetypeTitle
```

When `true`, the card displays: `"[Baseline Archetype] → [Current Archetype]"`

---

### 4.3 Three-Dimension Progress (Score Deltas)

Shows how the user's three core dimensions have evolved from onboarding to present.

#### Baseline Scores

Extracted from `profiles.component_scores`:

```typescript
baselineScores = {
  recalibration: Math.round(energyRegulation),
  clarity: Math.round(focusRecovery),
  renewal: Math.round(energyRenewal)
}
```

#### Current Scores

Computed from the last 7 days of `daily_checkins` (only when ≥ 7 total check-ins exist):

```typescript
currentScores = {
  recalibration: Math.round(avg(energy_balance, last 7 days)),
  clarity: Math.round(avg(clarity_level, last 7 days)),
  renewal: Math.round(avg(confidence_level, last 7 days))
}
```

#### Check-in Field → Dimension Mapping

| Check-in Field | Dimension | Onboarding Key |
|---|---|---|
| `energy_balance` | Recalibration | `energyRegulation` |
| `clarity_level` | Clarity | `focusRecovery` |
| `confidence_level` | Renewal | `energyRenewal` |

#### Score Deltas

```typescript
scoreDeltas = {
  recalibration: currentScores.recalibration - baselineScores.recalibration,
  clarity: currentScores.clarity - baselineScores.clarity,
  renewal: currentScores.renewal - baselineScores.renewal
}
```

**Display rules:**
- Positive delta → green text with `+` prefix
- Negative delta → red text
- Zero delta → neutral/muted text
- Current scores only shown when ≥ 7 total check-ins exist
- Below 7 check-ins: shows baseline scores only with "Current scores build after 7 check-ins" note

---

### 4.4 State Distribution (30 days)

Counts each check-in outcome across the last 30 days:

```typescript
distribution = { focused: 0, steady: 0, scattered: 0, drained: 0, overwhelmed: 0 }
checkIns.forEach(c => {
  const outcome = c.outcome.toLowerCase();
  if (outcome in distribution) distribution[outcome]++;
});
```

#### Most Frequent State (Typical State)

```typescript
typicalState = Object.entries(distribution)
  .sort((a, b) => b[1] - a[1])[0]  // highest count
```

Displayed as a supporting line, not a headline element.

---

### 4.5 Composite Score Trend

Uses `energy_balance` from `daily_checkins` as a proxy composite score.

#### 30-Day Average

```typescript
compositeAvg30 = Math.round(
  sum(all energy_balance values in 30 days) / count
)
```

#### 7-Day Trend Direction

Compares the average of the last 7 days vs the average of days 8–14:

```typescript
recentAvg = avg(energy_balance, last 7 days)
priorAvg = avg(energy_balance, days 8-14)
delta = recentAvg - priorAvg

if (delta > 5)  → "improving"
if (delta < -5) → "declining"
otherwise       → "stable"
```

---

### 4.6 Friction Frequency

Measures how often the user enters low-performance states.

```typescript
lowStates = checkIns.filter(c => 
  ["drained", "overwhelmed", "scattered"].includes(c.outcome.toLowerCase())
)

frictionPct = Math.round((lowStates.length / totalCheckins) * 100)
```

**Qualitative labels:**

| Range | Label |
|---|---|
| 0–25% | Low friction |
| 26–50% | Moderate friction |
| 51–100% | High friction pattern |

---

### 4.7 Recurring Compass Themes

Groups `daily_themes` by `theme_phrase`, counts occurrences, and returns the top 3.

```typescript
themeCounts = Map<theme_phrase, count>
recurringThemes = themeCounts
  .sortByCountDescending()
  .slice(0, 3)
  .map(([phrase, count]) => ({ phrase, count }))
```

These feed both the card display and the AI observation prompt.

---

### 4.8 Coach Insight Pattern Matching

Keyword search across the last 10 `user_coach_insights`:

**Strength keywords:** `strength`, `strong`, `excel`, `composure`, `resilient`, `clarity`, `conviction`, `grounded`

**Friction keywords:** `struggle`, `challenge`, `pattern`, `watch for`, `friction`, `tendency`, `recurring`, `avoidance`

**Logic:**
- Iterate through insights (newest first)
- Find the first insight containing any strength keyword → `coachStrength` (direct quote)
- Find the first insight containing any friction keyword → `coachFriction` (direct quote)
- Stop early if both found

---

### 4.9 AI Observation

Generated by the `state-patterns-insights` edge function via the Lovable AI gateway.

**Model:** `google/gemini-2.5-flash-lite`

**Inputs passed to prompt:**
- Top 3 recurring themes with occurrence counts
- Friction frequency label and percentage
- Composite score trend direction and 30-day average
- Coach insight excerpts (strength + friction)

**System prompt:**
> You are a pattern analyst for a senior executive's leadership development system. Your job is to name the ONE pattern most worth paying attention to. One sentence. Direct. Speak to the leader. No generic language. No advice — just name what you see.

**User prompt:**
> Over the past 30 days:
> - Recurring themes: [themes]
> - Friction frequency: [label] ([pct]%)
> - Composite score trend: [direction] (avg: [avg])
> - Coach observations: [excerpts]
> 
> Name the pattern.

**Structured output:** Uses function calling (`emit_observation`) to enforce single-sentence output.

**Activation threshold:** Requires ≥ 5 check-ins to trigger AI observation.

**Fallback:** If AI call fails or < 5 check-ins, uses `generateSimpleObservation()`:

```typescript
function generateSimpleObservation(trend, frictionLabel, frictionPct, typicalState, totalCheckins) {
  if (totalCheckins < 3) return null;
  
  const trendPhrase = trend === "improving" 
    ? "Your readiness has been trending upward this week"
    : trend === "declining"
      ? "Your readiness has been trending downward this week"
      : "Your readiness has been stable this week";

  if (frictionPct > 50) return `${trendPhrase}, but friction states have appeared in more than half...`;
  if (frictionPct > 25) return `${trendPhrase}, with moderate friction appearing in about a quarter...`;
  return `${trendPhrase}, with low friction across your check-ins — your regulation is holding.`;
}
```

---

## 5. Response Payload

The edge function returns a single `{ data: { ... } }` object:

```typescript
{
  data: {
    // Archetype
    userArchetype: string | null,          // Raw archetype ID from profiles
    archetypeTitle: string,                // Display title (e.g., "The Grounded Master")
    strengthArea: string,                  // "Lean on" label (e.g., "Recalibration")
    growthArea: string,                    // "Watch for" label (e.g., "Renewal depth")

    // State distribution
    typicalState: string | null,           // Most frequent outcome (30 days)
    distribution: Record<string, number>,  // Count per state

    // Composite trend
    compositeAvg30: number,                // 30-day energy_balance average
    trendDirection: "improving" | "stable" | "declining",

    // Friction
    frictionPct: number,                   // Percentage of low-state check-ins
    frictionLabel: string,                 // Qualitative label

    // Themes
    recurringThemes: { phrase: string; count: number }[],  // Top 3

    // Coach insights
    coachStrength: string | null,          // Direct quote (strength match)
    coachFriction: string | null,          // Direct quote (friction match)

    // AI
    aiObservation: string | null,          // One-sentence pattern observation

    // Metadata
    checkInCount: number,                  // Total check-ins in 30-day window

    // Dimension Progress (NEW)
    baselineScores: { recalibration: number; clarity: number; renewal: number } | null,
    currentScores: { recalibration: number; clarity: number; renewal: number } | null,
    baselineArchetypeTitle: string | null,
    currentArchetypeTitle: string | null,
    archetypeEvolved: boolean,
    scoreDeltas: { recalibration: number; clarity: number; renewal: number } | null,
  }
}
```

---

## 6. Card Display Structure

The card renders elements in this order:

1. **Header:** "Your Self Mastery Patterns" with info modal tooltip
2. **AI Observation** — One-sentence headline insight (gradient box with sparkle icon). Shown when ≥ 3 check-ins.
3. **Archetype Line** — Either:
   - Evolution: `"[Baseline] → [Current]"` (when archetype has shifted)
   - Static: Current archetype title (when unchanged)
4. **Three-Dimension Progress** — Baseline vs current scores for Recalibration, Clarity, Renewal with deltas. Shows "Your Starting Point" with baseline only when < 7 check-ins.
5. **30-Day Inner Readiness Average** — Composite score with trend icon (↑ improving / → stable / ↓ declining)
6. **Most Frequent State** — Typical check-in outcome over 30 days
7. **Friction Frequency** — Percentage with color-coded qualitative label
8. **Lean On** (Strength) — Dimension label + coach quote (green card with shield icon)
9. **Watch For** (Friction) — Growth area label + coach quote (amber card with warning icon)
10. **Recurring Themes** — Top 3 compass themes as styled pills with occurrence counts
11. **Progressive Messages:**
    - 0 check-ins: "Complete your first check-in to start mapping your patterns."
    - 1–4 check-ins: "[N] check-in(s) logged. Patterns become clearer with each one."
12. **Data Source Note** — "Based on [N] check-in(s) over the last 30 days"

---

## 7. Progressive Unlock Thresholds

| Check-in Count | What Activates |
|---|---|
| 0 | Card shows archetype + baseline scores + "complete your first check-in" message |
| 1–2 | State distribution, friction, typical state, archetype details |
| 3–4 | AI observation (fallback template), composite trend |
| 5–6 | AI observation (Gemini-powered) |
| 7+ | Current dimension scores, archetype evolution detection, full delta display |

---

## 8. DEV_MODE Behavior

When `DEV_MODE` is enabled, the component:
- Bypasses the edge function entirely
- Queries the database directly using the `DEV_USER.id`
- Runs the same archetype cascade and score calculations client-side via `devResolveArchetype()`
- Generates a template-based AI observation (no AI call)
- Produces the same `LeadershipPatternsData` interface for consistent rendering

This ensures development testing works without Auth0 authentication or edge function deployment.

---

## 9. Files

| File | Role |
|---|---|
| `src/components/insights/LeadershipPatternsCard.tsx` | Client component (renderer + DEV_MODE logic) |
| `supabase/functions/state-patterns-insights/index.ts` | Server-side edge function (all production calculations) |
| `src/utils/innerWorldArchetypes.ts` | Archetype display metadata (titles, descriptions, legacy ID map) |
| `src/utils/innerWorldScoring.ts` | Component score types and dimension labels |
| `docs/self-mastery-patterns-card.md` | This documentation |
