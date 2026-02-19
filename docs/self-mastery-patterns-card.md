# Your Self Mastery Patterns — v4.0 Technical Documentation

> **Card Title:** Your Self Mastery Patterns  
> **Location:** `/insights` page, first card  
> **Component:** `src/components/insights/LeadershipPatternsCard.tsx`  
> **Edge Function:** `supabase/functions/state-patterns-insights/index.ts`

---

## 1. Purpose & Design Intent

This card shows the leader what is consistently true about how they operate — not what they reported today, but what the data reveals about their patterns over time. It is the longitudinal self-knowledge layer.

**Tone:** Self-mastery for humans who lead, not corporate performance tracking. The language acknowledges these are people under sustained pressure trying to lead well and live well simultaneously. Regulation matters in a board meeting and at the dinner table. Clarity matters in strategic decisions and personal choices. Renewal matters for sustained performance and for being present with family.

---

## 2. Card Structure — Four Sections

### Section 1: AI Observation
One sentence naming the most meaningful pattern visible in the data.

### Section 2: Your Dimensions
- Archetype (baseline → current, with evolution flag)
- Three dimension scores (baseline → current with deltas): Recalibration, Clarity, Renewal

### Section 3: What Your Patterns Reveal
- Friction frequency with trend direction
- Recurring compass themes (top 3)
- Coach observations (Lean On / Watch For)

### Section 4: Data Source Note
Transparent accounting of what data informed the insights.

---

## 3. Architecture

```
┌──────────────────────┐      ┌──────────────────────────────────┐
│  LeadershipPatterns   │      │  state-patterns-insights         │
│  Card.tsx (Client)    │─────▶│  Edge Function (Server)          │
│                       │      │                                  │
│  DEV_MODE: direct DB  │      │  Auth0 token → userInfo → userId │
│  PROD: edge function  │      │  12 parallel DB queries          │
│                       │◀─────│  Multi-signal scoring engine     │
│  Display-ready render │      │  AI observation (Gemini)         │
└──────────────────────┘      └──────────────────────────────────┘
```

All calculation logic lives server-side. Client receives display-ready values only.
No scoring weights, archetype thresholds, or keyword lists are exposed client-side.

---

## 4. Data Sources

| Table | Fields Used | Time Range | Purpose |
|---|---|---|---|
| `profiles` | `user_archetype`, `component_scores` | Current row | Baseline scores, archetype |
| `daily_checkins` | `outcome`, `energy_balance`, `clarity_level`, `confidence_level`, `checkin_date` | Last 30 days | State distribution, friction, felt state averages |
| `daily_themes` | `theme_phrase`, `theme_driver` | Last 30 days | Recurring compass themes |
| `user_coach_insights` | `insight_content`, `insight_type`, `created_at` | Last 10 entries | Lean On / Watch For keyword extraction |
| `dialogue_sessions` | `id` | Last 30 days | Coach session count + message retrieval |
| `dialogue_messages` | `content` | Last 30 days | Regulation/clarity/renewal keyword mining |
| `sanctuary_events` | `category`, `timestamp`, `context_data` | Last 30 days | Pause/Flow/Renergise practice counts |
| `daily_ritual_completions` | `session_period`, `completion_status`, `ritual_date` | Last 30 days | Evening + pre-event session rates |
| `tiny_wins` | `win_date` | Last 30 days | Tiny Wins frequency (renewal signal) |
| `oura_daily_data` | `hrv`, `summary_date` | Last 30 days | HRV trend + recovery rate |
| `oura_connections` | `is_active` | Current | `hasWearable` flag |
| `calendar_connections` | `is_active` | Current | `hasCalendar` flag |
| `behavior_logs` | `behavior_type`, `created_at` | Last 30 days | Scattered cause-effect penalty |

---

## 5. Evolved Score Calculation — Multi-Signal Resilient Model

Each dimension score is calculated from multiple data sources with dynamic weight redistribution when data is missing.

**Formula:** `evolvedScore = sum(availableSignals × normalizedWeights)`

Where unavailable signals' weights are redistributed proportionally to available signals.

### 5.1 Recalibration

| Signal | Weight | Min Data | How Calculated |
|---|---|---|---|
| Baseline | 30% | Always | `profiles.component_scores.energyRegulation` |
| Pause practices in low state | 15% | ≥3 in 30d | `sanctuary_events` where category='pause' AND same-day outcome was depleted/managing. Score = min(100, count×5) |
| Pre-event sessions | 10% | ≥2 in 30d | `daily_ritual_completions` where session_period='pre-event' AND status='full'. Score = min(100, count×5) |
| HRV trend | 10% | ≥14 readings | Compare avg HRV last 7d vs days 8-14. ≥5% improvement → 60, ≤-5% → 40, else 50 |
| Coach regulation observations | 15% | ≥1 session | Scan `dialogue_messages` for regulation keywords. Score = 50 + net(positive×5 − negative×5), capped ±15 |
| Felt state (energy_balance) | 20% | ≥3 in last 7d | avg(energy_balance, last 7 days) |
| **Penalty:** Consecutive low | −10 pts | ≥3 consecutive days in depleted/managing tier | |

**Regulation keywords:**
- Positive: "stayed grounded", "regulation held", "maintained composure", "didn't react", "caught it early", "stayed calm", "kept your center", "held steady"
- Negative: "escalated", "lost composure", "reacted quickly", "got pulled in", "snapped", "lost it", "couldn't regulate"

### 5.2 Clarity

| Signal | Weight | Min Data | How Calculated |
|---|---|---|---|
| Baseline | 30% | Always | `profiles.component_scores.focusRecovery` |
| Flow practices under load | 15% | ≥3 + calendar | `sanctuary_events` where category='flow'. Score = min(100, count×5) |
| Coach clarity observations | 15% | ≥1 session | Scan for clarity keywords. Score = 50 + net, capped ±15 |
| Clarity theme recurrence | 10% | ≥10 checkins | If clarity-related themes ≥5 → −5 penalty |
| Felt state (clarity_level) | 30% | ≥3 in last 7d | avg(clarity_level, last 7 days) |
| **Penalty:** Scattered cause-effect | −10 pts | ≥5 behavior_logs AND ≥5 scattered outcomes | |

**Clarity keywords:**
- Positive: "cut through clearly", "sharp thinking", "decisive", "saw it clearly", "clarity held", "focused", "clear-headed", "precision"
- Negative: "lost in the weeds", "analysis paralysis", "foggy", "couldn't decide", "overthinking", "fragmented", "scattered", "lost the thread"

### 5.3 Renewal

| Signal | Weight | Min Data | How Calculated |
|---|---|---|---|
| Baseline | 30% | Always | `profiles.component_scores.energyRenewal` |
| Renergise practices in depleted | 15% | ≥3 in 30d | `sanctuary_events` where category='renergise' AND same-day outcome was depleted. Score = min(100, count×5) |
| Evening session rate | 15% | ≥10 sessions | Full / total. ≥70% → 58, <30% → 42, else 50 |
| Tiny Wins frequency | 10% | ≥5 in 30d | min(10, count) × 10 |
| HRV recovery rate | 10% | ≥14 readings | Same as HRV trend (simplified) |
| Coach renewal observations | 10% | ≥1 session | Scan for renewal keywords. Score = 50 + net, capped ±15 |
| Felt state (confidence_level) | 10% | ≥3 in last 7d | avg(confidence_level, last 7 days) |

**Renewal keywords:**
- Positive: "recovering well", "building reserves", "restored", "recharged", "sustainable pace", "bounced back", "renewed", "replenished"
- Negative: "running on empty", "not restoring", "depleted", "burning out", "can't recover", "exhausted", "drained", "no reserves"

---

## 6. Archetype Cascade

| Priority | ID | Title | Condition | Lean On | Watch For |
|---|---|---|---|---|---|
| 1 | `grounded-leader` | The Grounded Master | ER≥65 AND EN≥55 | "Stability and presence — you lead from a centered place." | "Over-reliance on composure when renewal is needed." |
| 2 | `resilient-performer` | The Resilient Performer | EN≥65 AND ER≥50 | "Recovery capacity — you absorb impact and bounce back." | "Pushing through when regulation would serve you better." |
| 3 | `clear-thinker` | The Clear Thinker | FR≥65 AND ER≥45 | "Mental clarity — you cut through complexity with precision." | "Over-thinking when action or rest is what's needed." |
| 4 | `intensity-driver` | The Intensity Driver | ER≥60 AND FR<50 | "Directed force — you channel intensity into focused action." | "Intensity without clarity can fragment your focus." |
| 5 | `adaptive-navigator` | The Adaptive Navigator | Default | "Flexibility — you read the field and adjust in real time." | "Adapting constantly without anchoring can be depleting." |

---

## 7. Friction Frequency

| Range | Label |
|---|---|
| 0–25% | Low friction |
| 26–50% | Moderate friction |
| 51–75% | High friction pattern |
| 76–100% | Sustained friction |

**Trend:** Compare friction % last 7 days vs days 8-14. ≥10% improvement → "↗ improving", ≤-10% → "↘ declining", else "→ stable".

---

## 8. AI Observation

**Model:** `google/gemini-2.5-flash-lite`  
**Activation:** ≥5 check-ins  
**Structured output:** Tool calling (`emit_observation`)

**Inputs:** archetype evolution, dimension deltas, friction, themes, coach excerpts.

**Fallback (< 5 check-ins or AI unavailable):** Uses largest dimension delta to generate template observation.

---

## 9. Progressive Unlock

| Check-ins | What Displays |
|---|---|
| 0 | Archetype + baseline scores + "Complete your first check-in" |
| 1–6 | + Friction + themes + Lean On/Watch For. Baseline only. |
| 7–9 | + Current scores with deltas + AI observation (fallback) |
| 10+ | + AI observation (Gemini-powered) + archetype evolution |

---

## 10. Response Payload

```typescript
{
  data: {
    aiObservation: string | null,
    baselineArchetypeId: string,
    baselineArchetypeTitle: string,
    currentArchetypeId: string | null,
    currentArchetypeTitle: string | null,
    archetypeEvolved: boolean,
    archetypeLeanOn: string,
    archetypeWatchFor: string,
    baselineScores: { recalibration: number, clarity: number, renewal: number },
    currentScores: { recalibration: number, clarity: number, renewal: number } | null,
    scoreDeltas: { recalibration: number, clarity: number, renewal: number } | null,
    frictionPct: number,
    frictionLabel: string,
    trendDirection: "improving" | "stable" | "declining",
    typicalState: string | null,
    recurringThemes: { phrase: string, count: number }[],
    coachStrength: string | null,
    coachFriction: string | null,
    checkInCount: number,
    coachSessionCount: number,
    hasWearable: boolean,
    hasCalendar: boolean,
    dataSourceNote: string
  }
}
```

---

## 11. Files

| File | Role |
|---|---|
| `src/components/insights/LeadershipPatternsCard.tsx` | Client component (renderer + DEV_MODE) |
| `supabase/functions/state-patterns-insights/index.ts` | Server-side edge function (all scoring) |
| `src/utils/innerWorldArchetypes.ts` | Archetype display metadata |
| `docs/self-mastery-patterns-card.md` | This documentation |
