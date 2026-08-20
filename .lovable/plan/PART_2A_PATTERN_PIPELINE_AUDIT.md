# Part 2A — Pattern Pipeline Audit

This document describes the current data sources, algorithms, and text-generation paths that produce the "Performance Patterns" section on `/insights`. No implementation decisions are made here; it is a read-out for sign-off before Part 2B–E UI changes.

---

## 1. Where the patterns come from

There are **two independent pipelines** that feed the Performance Patterns area:

| Pipeline | Source file | Output field | Data used |
|----------|-------------|--------------|-----------|
| **A. Mind Rhythm Patterns** | `supabase/functions/performance-rhythm-insights/index.ts` | `mindRhythmPatterns` | `daily_checkins` (4 mind dims) + `wearable_data` (HRV, sleep score, duration, efficiency) |
| **B. Performance Lift / Baseline Patterns** | `supabase/functions/cause-effect-engine/index.ts` | `signal_summary.performance_lift` | `wearable_data.hr_samples`, `calendar_events`, `inner_readiness_scores`, `daily_checkins` |

Both are **deterministic**. There is **no LLM** and **no prompt** generating the pattern sentences. Text is assembled from fixed templates server-side.

---

## 2. Pipeline A — Mind Rhythm Patterns

### 2.1 Input data

`performance-rhythm-insights` fetches the last 30 days of:

- `daily_checkins`: `outcome`, `clarity_level`, `emotion_level`, `pressure_level`, `regulation_level`, `checkin_date`, `time_window`
- `wearable_data`: `hrv`, `resting_heart_rate`, `sleep_score`, `total_sleep_minutes`, `sleep_efficiency`, `summary_date`

### 2.2 What gets mined

For each of the 4 mind dimensions and 4 wearable dimensions, the function builds a daily series and runs one statistical miner (`mineSeries`). Each miner looks for **seven kinds of findings**:

| Finding kind | What it means | Example text |
|--------------|---------------|--------------|
| `peak-window` | One time-of-day (morning/afternoon/evening) has a materially higher positive rate than the others | "Afternoons are your peak Clarity window — 80% vs 40% in the evening" |
| `low-window` | One time-of-day has a materially lower positive rate | (emitted but currently ranked lower) |
| `peak-day` | One day-of-week has a materially higher positive rate | "Tuesdays run sharpest on Clarity (75%); Fridays drop to 25%" |
| `low-day` | One day-of-week has a materially lower positive rate | "Fridays slip on Clarity — 25% vs your 75% on Tuesdays" |
| `cell-peak` | A specific day × time window is the strongest cell | "Tuesday afternoons are your sharpest Clarity window — 80% across 4 check-ins" |
| `consecutive-neg` | ≥3 consecutive same-day-of-week values in the negative band | "3 Fridays in a row you've shown up clouded on Clarity — last on Aug 14" |
| `consecutive-pos` | ≥3 consecutive same-day-of-week values in the positive band | "3 Fridays in a row you've shown up clear on Clarity — through Aug 14" |

### 2.3 Bands (what counts as positive / negative)

| Dimension | Positive band | Negative band | Notes |
|-----------|---------------|---------------|-------|
| Clarity | `clarity_level >= 4` | `clarity_level <= 2` | |
| Emotion | `emotion_level >= 4` | `emotion_level <= 2` | |
| Pressure | `pressure_level <= 2` | `pressure_level >= 4` | **Inverted** — low pressure is good |
| Regulation | `regulation_level >= 4` | `regulation_level <= 2` | |
| HRV | `hrv >= baseline` | `hrv <= baseline × 0.90` | Baseline = mean of last 30 days |
| Sleep Score | `sleep_score >= 75` | `sleep_score <= 60` | |
| Sleep Duration | `total_sleep_minutes >= 420` (7h) | `total_sleep_minutes <= 360` (6h) | |
| Sleep Efficiency | `sleep_efficiency >= 85` | `sleep_efficiency <= 75` | |

### 2.4 Thresholds for surfacing a finding

| Finding kind | Threshold |
|--------------|-----------|
| `peak-window` / `low-window` | ≥2 time buckets with ≥3 observations each; best − worst ≥ 20 percentage points; best ≥ 50% |
| `peak-day` / `low-day` | ≥2 days with ≥2 observations each; best − worst ≥ 30 percentage points |
| `cell-peak` | cell has ≥2 observations; cell positive rate − overall mean positive rate ≥ 30 percentage points |
| `consecutive-neg` / `consecutive-pos` | ≥3 consecutive same-DOW values in the same band |

### 2.5 Ranking and diversity guard

After mining, every finding gets a `priorityScore`:

```
priorityScore = KIND_WEIGHT[kind] + (confidence × 0.3) + DIMENSION_BONUS[dimension]
```

Kind weights:

```text
cell-peak       1.00  (day × time intersection)
peak-day        0.90
low-day         0.85
peak-window     0.85
low-window      0.80
consecutive-neg 0.70  (active risk)
consecutive-pos 0.30  (celebratory, non-actionable)
```

Dimension bonuses:

```text
clarity         +0.15
regulation      +0.12
hrv             +0.13
sleep_score     +0.11
sleep_duration  +0.11
emotion         +0.10
pressure        +0.08
sleep_efficiency +0.09
```

The top-3 list is then filtered by a diversity guard:
- ≤2 findings per dimension
- ≤2 findings per kind

This is why a user may not see three "day-of-week" findings even if the data supports them.

### 2.6 What is returned

```json
{
  "mindRhythmPatterns": {
    "topThree": [ /* up to 3 RhythmFinding */ ],
    "all": [ /* all findings, ranked */ ]
  }
}
```

Each `RhythmFinding` contains:

```ts
{
  kind: 'peak-window' | 'low-window' | 'peak-day' | 'low-day' | 'cell-peak' | 'consecutive-neg' | 'consecutive-pos',
  dimension: 'clarity' | 'emotion' | 'pressure' | 'regulation' | 'hrv' | 'sleep_score' | 'sleep_duration' | 'sleep_efficiency',
  text: string,        // app-facing sentence
  longText: string,    // weekly-email version
  confidence: number,  // 0–1
  observations: number,
  priorityScore: number
}
```

### 2.7 What this pipeline is NOT

- It does **not** use calendar events.
- It does **not** use behavior logs.
- It does **not** use JIT preferences.
- It does **not** use dialogue sessions.
- It does **not** use an LLM.

It is a pure time-series pattern miner over check-in and wearable bands.

---

## 3. Pipeline B — Performance Lift / Baseline Patterns

### 3.1 Source

`cause-effect-engine` runs nightly and writes into `causality_findings.signal_summary.performance_lift`. `performance-rhythm-insights` reads the latest row and returns it as `performanceLift`.

### 3.2 What gets computed

| Field | Data used | What it means |
|-------|-----------|---------------|
| `hr_event_lift` | `wearable_data.hr_samples` inside `calendar_events` windows vs resting baseline | Per event subtype: how much peak HR rises and how much same-day readiness lifts/drops |
| `category_lift` | Rollup of `hr_event_lift` to A–H categories | Per A–H category: mean HR delta and readiness lift |
| `subcategory_lift` | Rollup of `hr_event_lift` to subcategory | Secondary breakdown for categories with ≥2 subtypes |
| `sleep_to_peak` | Sleep score ≥ P70 → next-day PRS | How much better next-day readiness is after best-sleep nights |
| `rhr_recovery_window` | Well-recovered mornings (RHR ≤ baseline − 1σ) | Which time window has the highest lift on recovered days |
| `recovery_streak_to_peak` | Low-RHR streaks → top-quartile PRS days | Mean streak length of low-RHR days before a peak day |

### 3.3 Confidence rules

```text
strong   : n ≥ 5 AND |Δ%| ≥ 15
emerging : n ≥ 3 AND |Δ%| ≥ 10
```

Anything below emerging is dropped.

### 3.4 What the current UI renders from this

`buildBaselineLiftLines()` turns the lift object into plain-text sentences:

- Sleep → Peak line
- Recovery → Best Window line
- Recovery streak line
- Thriving categories line (positive `compositeLift`)
- Draining categories line (negative `compositeLift`)

These are **not** patterns in the rhythm-miner sense; they are **baseline/causality findings** derived from wearable + calendar + readiness data.

---

## 4. Other pattern-like blocks on the card

| Block | Source | What it actually is |
|-------|--------|---------------------|
| **Best Readiness Window** | `performance-rhythm-insights` | Highest average composite readiness cell across day × window; pure stat |
| **Calendar Pattern** | `performance-rhythm-insights` | Keyword-matched event types correlated with same-day readiness; deterministic string |
| **Cause-Effect Insight** | `performance-rhythm-insights` | Fallback paths (A–F) for event/behavior/JIT correlations; deterministic string |
| **GATE_REASON_COPY / "Awaiting…"** | `cause-effect-engine` diagnostics | Data-honest explanation for why a lift block is null |

---

## 5. The "stats vs patterns" distinction

The user's observation is correct: much of what currently appears under Performance Patterns is **statistical summaries**, not **actionable patterns**. Here is the breakdown:

### Stats (descriptive, no time/sequence structure)

- Average readiness by event type (`calendarInsight`)
- Best readiness window (`bestReadinessWindow`)
- Sleep → next-day readiness lift (`sleep_to_peak`)
- Recovery → best window lift (`rhr_recovery_window`)
- Recovery streak length (`recovery_streak_to_peak`)
- Category lift / drain bars (`category_lift`)

### Patterns (time/sequence structure)

- Peak / low time-of-day window (`peak-window`, `low-window`)
- Peak / low day-of-week (`peak-day`, `low-day`)
- Specific day × time cell peak (`cell-peak`)
- Consecutive same-DOW runs (`consecutive-neg`, `consecutive-pos`)
- Event-window HR causality (`hr_event_lift`, `category_lift`)

The current UI mixes both under one heading. Part 2B–E proposes separating them into **Check-in patterns** (tab-scoped rhythm findings) and **Baseline patterns** (wearable/calendar causality summaries).

---

## 6. Current rendering path

1. `PerformanceRhythmCard.tsx` fetches from `performance-rhythm-insights`.
2. It renders `LevelTrendCalendar` for the active tab (Clarity/Emotion/Pressure/Regulation).
3. It passes `data.mindRhythmPatterns?.all` and `data.performanceLift` into `PatternAnalysisSection`.
4. `PatternAnalysisSection` splits findings into:
   - **Check-in patterns**: `dimension ∈ {clarity, emotion, pressure, regulation}`, scoped to active tab
   - **Baseline patterns**: wearable dimensions + `bestWindowLabel` + `calendarInsight` + `liftLines`
5. It deduplicates per `dimension:direction` and caps check-in lines at 3, baseline lines at 2.

### Known current issue

Because `PatternAnalysisSection` lives **outside** the tab switcher in the current code, all four tabs were previously showing identical text. The recent change scopes check-in patterns to the active dimension, but the underlying data source (`mindRhythmPatterns.all`) still contains the same ranked list for every tab; only the filter changes.

---

## 7. What the redesign (Part 2B–E) would change

This section is for visibility only; implementation waits for sign-off.

| Part | Change |
|------|--------|
| 2B | Remove the `CategoryBar` chart and the emerald "Sharpest Window" card from the UI |
| 2C | Collapse "Event Categories Where You Thrive" and "Your Sharpest Window" into plain-text baseline lines |
| 2D | Make check-in patterns tab-scoped (one dimension per tab) with a fallback to all dimensions when empty |
| 2E | Split the section into **Check-in patterns** and **Baseline patterns**, removing redundant/placeholder text |

No edge-function changes are required for 2B–E; the data contract already supports the split.

---

## 8. Sign-off questions

Before implementing Part 2B–E, please confirm:

1. Is the split into **Check-in patterns** (tab-scoped) and **Baseline patterns** the right structure?
2. Should wearable rhythm findings (HRV, sleep score, duration, efficiency) appear under **Baseline patterns** or be removed from this card entirely?
3. Should `calendarInsight` and `causeEffectInsight` remain under **Baseline patterns**, or move to a separate card?
4. Is the current server-side template-generated text acceptable, or do you want any sentence styles changed?
