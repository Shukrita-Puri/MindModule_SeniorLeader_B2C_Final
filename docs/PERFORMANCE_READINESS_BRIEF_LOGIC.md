# Performance Readiness Brief – Complete Technical Documentation

> **Last updated**: 2026-04-13
> **Edge functions**: `compute-inner-readiness`, `compute-outer-readiness`
> **Client component**: `src/components/home/DecisionReadinessBrief.tsx`

---

## Table of Contents

1. [Purpose & Architecture](#1-purpose--architecture)
2. [Upstream Data Sources](#2-upstream-data-sources)
3. [Connected Database Tables](#3-connected-database-tables)
4. [Inner Readiness Scoring (compute-inner-readiness)](#4-inner-readiness-scoring)
5. [Outer Readiness / Compass (compute-outer-readiness)](#5-outer-readiness--compass)
6. [LLM Synthesis Prompt](#6-llm-synthesis-prompt)
7. [Signal Pill Logic & Calculations](#7-signal-pill-logic--calculations)
8. [Lean On / Watch For Logic](#8-lean-on--watch-for-logic)
9. [Phase (Directive Phrase) Logic](#9-phase-directive-phrase-logic)
10. [Body Copy Logic](#10-body-copy-logic)
11. [Source Labels](#11-source-labels)
12. [DB Column Audit](#12-db-column-audit)
13. [Known Issues & Gaps](#13-known-issues--gaps)

---

## 1. Purpose & Architecture

The **Performance Readiness Brief** is a unified dashboard card that answers:
- **"What is my readiness right now?"** (score, tier, signal chips)
- **"What should I do about it?"** (phase directive, body copy)
- **"What should I lean on / watch for?"** (personalised tactical insights)

### Architecture Flow

```
┌─────────────────────┐     ┌──────────────────────────────┐
│ Client (PRB Card)   │────▶│ computeEnergyState() client  │
│ DecisionReadiness   │     │ → fetches DB for check-in,   │
│ Brief.tsx           │     │   wearable, scores            │
└────────┬────────────┘     └──────────────────────────────┘
         │
         │ Sends: tier, score, clarity, confidence, checkInOutcome, timezoneOffset
         ▼
┌────────────────────────────────────────────────────────────┐
│ compute-outer-readiness (Edge Function, ~3300 lines)       │
│                                                            │
│ 1. Server-side calendar metrics (today + tomorrow)         │
│ 2. Wearable data fetch + 30-day baseline deviations        │
│ 3. Coach insights, memories, commitments, breakthroughs    │
│ 4. Archetype from profiles                                 │
│ 5. Recent check-ins (7-day patterns)                       │
│ 6. Enrichment queries (40+ signals)                        │
│ 7. Signal Triage → top 5 signals                           │
│ 8. Temporal Triangulation (Immediate/Tactical/Strategic)   │
│ 9. LLM synthesis (Gemini 2.5 Flash, 6s timeout)           │
│ 10. Deterministic fallback templates                       │
│                                                            │
│ Returns: phrase, bodyText, leanOn, watchFor, signal data,  │
│          deviations, baselines, calendar state, etc.        │
└────────────────────────────────────────────────────────────┘
```

### Downstream Consumers

| Consumer | What it uses |
|----------|-------------|
| PRB Card (home) | phrase, bodyText, leanOn, watchFor, signal chips, score, tier |
| Mastery Plan | stateAlreadyUsed[], compassAlreadyUsed[] (no-repeat relay) |
| Coach sessions | leanOn, watchFor for session context |
| JIT nudges | coachInsightAge, nextHighStakesEvent |

---

## 2. Upstream Data Sources

### 2.1 Client-Provided (Request Body)

| Field | Source | Type | Description |
|-------|--------|------|-------------|
| `innerReadinessTier` | `computeEnergyState()` | `depleted\|managing\|strong\|peak` | Pre-computed tier |
| `innerReadinessScore` | `computeEnergyState()` | `0-100` | Composite readiness score |
| `clarityLevel` | Today's check-in | `1-5 \| null` | Cognitive clarity |
| `confidenceLevel` | Today's check-in | `1-5 \| null` | Decision confidence |
| `checkInOutcome` | Today's check-in | `string \| null` | e.g., "steady", "drained", "focused" |
| `timezoneOffset` | `Date.getTimezoneOffset()` | `number` | Minutes offset from UTC |

### 2.2 Server-Fetched (Inside Edge Function)

| Signal | DB Table | Columns Used | Description |
|--------|----------|-------------|-------------|
| Calendar events (today) | `calendar_events` | `start_time, end_time, is_organizer, attendees_count, is_recurring, title` | Gated on `calendar_connections.is_active` |
| Calendar events (tomorrow) | `calendar_events` | Same | Fetched for evening periods (≥18:00) |
| Wearable (latest day) | `wearable_data` | `hrv, resting_heart_rate, sleep_score, total_sleep_minutes, source` | Most recent row |
| Wearable (30-day baseline) | `wearable_data` | `hrv, sleep_score, resting_heart_rate, total_sleep_minutes, source` | Last 30 rows for deviation |
| Wearable (7-day trend) | `wearable_data` | `hrv, summary_date` | HRV trend direction |
| Coach insights | `user_coach_insights` | `insight_type, insight_content, created_at` | Active strength + growth_area |
| Coach memories | `coach_memory_index` | `memory_content, memory_type, pattern_area, key_themes, importance_score` | Importance ≥ 5 |
| Coach commitments | `coach_accountability_tracker` | `commitment_text, status, meta_skill, pattern_area` | Status = 'pending' |
| Coach breakthroughs | `coach_breakthrough_moments` | `breakthrough_content, breakthrough_type, meta_skill, impact_score` | Impact ≥ 3 |
| Coach session recency | `coach_session_summaries` | `created_at, session_id` | Most recent session |
| Archetype | `profiles` | `user_archetype` | Onboarding-derived archetype |
| Recent check-ins | `daily_checkins` | `checkin_date, outcome, clarity_level, confidence_level, energy_balance` | Last 7 days |
| DOW check-ins | `daily_checkins` | `outcome, energy_balance, checkin_date` | Last 60 days for DOW patterns |
| Practice completions | `sanctuary_events` | `id, content_id` | Event_type = 'completed', last 7 days |
| Coach patterns | `coach_pattern_observations` | `pattern_description` | Active, last 7 days |
| Practice effectiveness | `sanctuary_events` | `content_id, effectiveness_rating` | Top-rated practices |
| Next event | `calendar_events` | `title, start_time` | Next upcoming event |
| Holiday detection | `profiles` | `timezone` | Maps to country for static holiday lookup |

---

## 3. Connected Database Tables

### 3.1 `wearable_data` – Primary Wearable Store

| Column | Type | Used By PRB | Read | Write | Notes |
|--------|------|-------------|------|-------|-------|
| `id` | uuid | — | — | — | PK |
| `user_id` | text | ✅ | ✅ | ✅ | User FK |
| `summary_date` | date | ✅ | ✅ | ✅ | Daily key |
| `source` | text | ✅ | ✅ | ✅ | e.g., 'apple-healthkit', 'oura' |
| `hrv` | numeric | ✅ | ✅ | ✅ | HRV RMSSD in ms |
| `resting_heart_rate` | integer | ✅ | ✅ | ✅ | RHR in bpm |
| `sleep_score` | integer | ✅ | ✅ | ✅ | 0-100 sleep quality score |
| `total_sleep_minutes` | integer | ✅ | ✅ | ✅ | Total sleep duration |
| `deep_sleep_minutes` | integer | — | — | ✅ | Deep sleep stage |
| `rem_sleep_minutes` | integer | — | — | ✅ | REM stage |
| `steps` | integer | — | — | ✅ | Daily steps |
| `active_calories` | integer | — | — | ✅ | Active energy |
| `hrv_samples` | jsonb | — | — | ✅ | Raw HRV samples |
| `raw_data` | jsonb | — | — | ✅ | Full raw payload |

**⚠️ NOTE**: The column is `source` NOT `data_source`. The column is `hrv` NOT `hrv_rmssd`.

### 3.2 `calendar_events` – Calendar Store

| Column | Type | Used By PRB | Notes |
|--------|------|-------------|-------|
| `user_id` | text | ✅ | User FK |
| `start_time` | timestamptz | ✅ | Event start (UTC) |
| `end_time` | timestamptz | ✅ | Event end (UTC) |
| `title` | text | ✅ | Used for high-stakes detection |
| `is_organizer` | boolean | ✅ | Pressure scoring (+2) |
| `attendees_count` | integer | ✅ | Pressure scoring (+1/+3) |
| `is_recurring` | boolean | ✅ | Non-recurring = +1 pressure |

### 3.3 `daily_checkins` – Check-in Store

| Column | Type | Used By PRB | Notes |
|--------|------|-------------|-------|
| `user_id` | text | ✅ | |
| `checkin_date` | date | ✅ | |
| `outcome` | text | ✅ | drained/overwhelmed/scattered/steady/focused |
| `clarity_level` | integer | ✅ | 1-5 scale |
| `confidence_level` | integer | ✅ | 1-5 scale |
| `energy_balance` | integer | ✅ | 0-100, mapped to tier |

### 3.4 `user_coach_insights` – Coach Intelligence

| Column | Type | Used By PRB | Notes |
|--------|------|-------------|-------|
| `insight_type` | text | ✅ | 'strength' or 'growth_area' |
| `insight_content` | text | ✅ | The actual insight text |
| `is_active` | boolean | ✅ | Active insights only |
| `created_at` | timestamptz | ✅ | Age determines priority tier |

### 3.5 `profiles` – User Profile

| Column | Type | Used By PRB | Notes |
|--------|------|-------------|-------|
| `user_archetype` | text | ✅ | Maps to archetype×tier matrix |
| `timezone` | text | ✅ | Holiday detection |

### 3.6 `oura_daily_data` – ⚠️ TABLE DOES NOT EXIST

The `sync-oura` edge function writes to `oura_daily_data` (line 104 of sync-oura/index.ts), but this table does not exist in the database. Oura data sync is non-functional.

---

## 4. Inner Readiness Scoring

**Edge function**: `compute-inner-readiness`

### 4.1 Input Signals

| Signal | Score Range | Source |
|--------|-----------|--------|
| Felt State | 0-100 | Check-in outcome mapped: drained=20, overwhelmed=25, scattered=35, steady=55, focused=80 |
| Internal Readiness (C×C) | 0-80 | `(clarity + confidence) × 8` |
| Circadian | ~35-65 | Time-of-day ± day-of-week adjustments |
| Wearable (HRV) | 0-100 | HRV vs 30-day baseline: >+15% → 80, <-15% → 20, else 50 |

### 4.2 Weighting Modes

| Mode | Condition | Wearable | Felt | C×C | Circadian |
|------|-----------|----------|------|-----|-----------|
| **No Wearable** | No wearable data | — | 40% | 45% | 15% |
| **Aligned** | Felt ≈ Wearable (gap ≤ 30) | 35% | 25% | 30% | 10% |
| **Masked High** | Felt > Wearable (gap > 30) | 40% | ~25% | ~25% | 10% |
| **Recovery Underway** | Wearable > Felt (gap > 30) | 35% | ~27.5% | ~27.5% | 10% |

**Baseline confidence scaling**: Wearable weight is scaled by data maturity:
- `low` (1-2 days): × 0.6
- `medium` (3-6 days): × 0.85
- `high` (7+ days): × 1.0

### 4.3 Tier Mapping

| Score | Tier | Sub-Tiers |
|-------|------|-----------|
| 0-39 | `depleted` | very-low (≤15), low (≤25), low-mid (≤35) |
| 40-59 | `managing` | mid (≤55) |
| 60-74 | `strong` | mid-high (≤65), high (≤75) |
| 75-100 | `peak` | very-high (>75) |

### 4.4 Divergence Detection

| Flag | Condition | Implication |
|------|-----------|-------------|
| `ALIGNED` | \|felt - wearable\| ≤ 30 | Body and mind agree |
| `MASKED_HIGH` | felt - wearable > 30 | User feels better than body shows |
| `RECOVERY_UNDERWAY` | wearable - felt > 30 | Body recovering faster than perceived |

### 4.5 Context Statement (3-Layer Assembly)

**Layer 1 – Base Statement**: 15 combinations of outcome × time-of-day (morning/afternoon/evening). Falls back to tier-based statements when no check-in.

**Layer 2 – Clarity × Confidence Modifier**: 12 patterns detect divergent cognitive signals (e.g., "High clarity with low confidence"). Time-of-day aware (evening has distinct modifiers).

**Layer 3 – HRV Context**: Always-on when wearable is present. Shows HRV deviation % vs baseline with data-density-aware labeling ("your 30-day baseline" vs "5 days of HRV data").

---

## 5. Outer Readiness / Compass (compute-outer-readiness)

### 5.1 Calendar Metrics

**Load Calculation**:
- 4+ events → `high`
- 3 events + avg gap < 20min → `high`
- 3 events → `medium`
- < 3 events → `low`

**Pressure Scoring** (per-event weights, summed):

| Factor | Points |
|--------|--------|
| Organizer | +2 |
| Attendees > 5 | +3 |
| Attendees > 2 | +1 |
| Duration > 60min | +2 |
| Duration ≥ 30min | +1 |
| Non-recurring | +1 |
| Prime time (9-12, 14-16) | +1 |
| Back-to-back gap < 5min | +3 |
| Back-to-back gap < 15min | +2 |
| Density boost (3+ meetings, total gap < 30min) | +3 |
| Intensity multiplier (>50% non-recurring + organizer) | × 1.5 |

**Thresholds**: ≥ 6 = `high`, ≥ 3 = `medium`

Past events carry half weight. Future events carry full weight.

**High-Stakes Detection**:
- Non-recurring AND (attendees > 5 OR organizer + attendees > 2 OR duration > 60min)
- Excludes: personal blocks (regex), all-day blockers (>4h, ≤1 attendee)

**Meeting Count** (filtered): Excludes personal blocks and all-day blockers for user-facing text.

### 5.2 Wearable Context

| Signal | Threshold | Source |
|--------|-----------|--------|
| `hrvElevated` | HRV < 30ms (absolute) | Latest `wearable_data.hrv` |
| `poorSleep` | sleep_score < 60 OR total_sleep_minutes < 360 (6h hard floor) | Latest `wearable_data` |
| `rhrElevated` | RHR deviation > +10% vs 30-day baseline | Deviation-based (not absolute) |

**Apple Health correction**: `total_sleep_minutes × 0.85` for "in-bed" vs "asleep" adjustment.

### 5.3 4-Tier Wearable Calibration Model

| Tier | Days Connected | Label | Thresholds |
|------|---------------|-------|------------|
| 0 (None) | 0 | Prompt to connect | — |
| 1 (Absolute) | 1-2 | "establishing baseline" | Population norms (HRV < 20ms = RED) |
| 2 (Partial) | 3-6 | "early reading" | Short-term deviation |
| 3 (Full) | 7+ | Full qualifiers | 30-day personal baseline |

---

## 6. LLM Synthesis Prompt

### 6.1 System Prompt

```
You are a performance intelligence system briefing a C-suite leader.
Voice: trusted chief of staff. Precise. Never generic. Never fluffy.

Produce two things:
1. PHRASE: 3-6 words. Crisp directive earned by their data.
2. BODY: One sentence, max 15 words. **Bold** the key action.

Core rule: if triangulation data is provided, the body MUST connect at least two
time horizons — what is true now AND what pattern or goal this connects to. This
is what makes the brief feel like it knows the leader.

Rules (no exceptions):
- Reference at least one specific signal provided
- No wellness words ever: relax, mindful, breathe, calm, wellness, self-care,
  journey, practice, routine, nourish, recharge
- No affirmations, no softening, no encouragement
- C-suite register only: direct, precise, data-referenced
- Wearable data > felt state when they diverge
- Never say "readiness"
- Never repeat the phrase in the body
- JIT event within 90 mins: orient entirely around it
- If calendar load is 'none': do not reference meetings or scheduling
- If signals are insufficient for specificity: output null

Output ONLY valid JSON: {"phrase": "...", "bodyText": "..."}
```

### 6.2 User Prompt (Dynamically Assembled)

Format: `{tier} · {score}/100 · {timeOfDay} · {dayName}`

Conditionally appended sections:

1. **Context Frame** (if applicable):
   - Sunday evening → "Preparing for the week ahead. Write forward, not reflective."
   - Day before rest → "Heading into rest. Frame as closure and release."
   - Monday morning → "Week is being set right now. Frame as intentional and forward."

2. **Key Signals** (top 5 from Signal Triage):
   ```
   Key signals for today:
   HIGH PRIORITY: Board Presentation in 45 mins
   Body signal: wearable shows load not yet registered (HRV -18% vs baseline)
   Coach commitment: Practice 2-minute centering before high-stakes meetings
   ```

3. **Temporal Triangulation** (when cross-horizon connection exists):
   ```
   Triangulation:
     Now: Board Presentation in 45 mins
     Pattern: HRV drops avg 15% before Board meetings — 4 occurrences
     Development: Pending coach commitment: Practice 2-minute centering
     Connection: immediate_tactical_strategic — All three horizons align
     Lead with: tactical
   ```

4. **Coach Strength** (if available)
5. **Archetype** (with lean on/watch for)

### 6.3 Signal Triage Rules (Priority Order)

| Rule | Signal | Condition |
|------|--------|-----------|
| 1 | JIT event < 90min | `nextHighStakesEvent.minutesUntil < 90` |
| 2 | Wearable divergence | `MASKED_HIGH` or `RECOVERY_UNDERWAY` |
| 3 | Personalisation | Coach commitment → Coach pattern → Consecutive low days → DOW comparison |
| 4 | Tomorrow context | Evening only: rest day, heavy load, or high-stakes |
| 5 | Week ahead | Sunday evening only |
| 6 | Physiological deviation | HRV deviation > 8%, or sleep hard floor |
| 7 | Score trajectory | Meaningful change vs yesterday (> 5 points) |
| 8 | Back-to-back density | Longest block ≥ 2hrs |

**Cap**: Maximum 5 signals sent to LLM.

### 6.4 Temporal Triangulation

| Horizon | Signal Source |
|---------|-------------|
| **Immediate** (now) | JIT event < 90min → Divergence mode → Depleted state → Check-in outcome |
| **Tactical** (patterns) | HRV×event correlation → Consecutive low days → DOW comparison → Friction trend → Score trajectory |
| **Strategic** (development) | Pending commitment → Coach growth area → Archetype watch for |

**Cross-horizon connections**:

| Connection | When | Framing |
|-----------|------|---------|
| `immediate_tactical_strategic` | All 3 horizons present | "All three horizons align — be specific." |
| `immediate_confirms_tactical` | Immediate + Tactical | "Today is confirming a pattern." |
| `tactical_connects_strategic` | Tactical + Strategic | "The pattern connects to their development goal." |
| `immediate_activates_strategic` | Immediate + Strategic | "Today's state activates their development area." |

### 6.5 Fallback (6-Second Timeout)

If LLM fails or times out, the system uses deterministic template-based `phrase` and `context` from the `getTheme()` function (tier × time-of-day × calendar pressure × load matrix).

---

## 7. Signal Pill Logic & Calculations

### 7.0 Signal Pill Priority (Canonical Contract)

Signal pills render in this fixed priority order. All states (green/amber/red) render — not only threshold-breakers.
Patterns are inlined as qualifiers on the relevant pill — there is NO separate pattern pill.

```text
1. Calendar pills (separate component, always first)
2. HRV pill (with inline wearable pattern if applicable)
3. Sleep pill (with inline score trajectory if applicable)
4. RHR / Heart pill (with inline wearable trend if applicable)
5. Mind pill — unified from Stage 1 (checkInOutcome) + Stage 2 (clarity × confidence)
   (with inline consecutive-low-day, DOW comparison, or score trajectory patterns)
```

Cap: maximum 6 signal chips visible (calendar is rendered separately above).

### 7.1 Chip Generation (`buildSignalChips()`)

Signal chips are generated client-side in `DecisionReadinessBrief.tsx` using data returned by `compute-outer-readiness`.

**Prompt Chips (missing data)**:
- `{ id: 'no-checkin', label: 'Check in to unlock your state' }` → Clickable → `/daily-check-in`
- `{ id: 'wearable-prompt', label: 'Connect wearable' }` → Clickable → `/connected-data`
- `{ id: 'calendar-prompt', label: 'Connect calendar' }` → Clickable → `/connected-data`

These appear independently: check-in prompt when no check-in, wearable prompt when `hasWearable === false`, calendar prompt when `calendarState === 'not_connected'`.

**Signal Chips (data present) — always render when data exists, even at baseline**:

| Chip ID | Condition | Front Label (Analysis) | Back Label (Evidence) | Color |
|---------|-----------|------------------------|----------------------|-------|
| **hrv** | `hrvValue != null` | "HRV below baseline" / "HRV dipped" / "HRV at baseline" / "HRV above baseline" / "HRV strong" + inline pattern qualifier | `{value}ms · {deviation}% vs {baseline}ms baseline` | RED: deviation < -15% or (absolute, < 20ms); AMBER: -5% to -15%; GREEN: ≥ -5% |
| **sleep** | `sleepDuration != null OR sleepScore != null` | "Short sleep" / "Sleep below baseline" / "Sleep at baseline" / "Solid sleep" + inline score trajectory | `{duration} · {deviation}% vs {baseline} baseline` | RED: < 360min (hard floor) or deviation < -15%; AMBER: -5% to -15%; GREEN: ≥ -5% |
| **rhr** | `rhrValue != null` | "RHR elevated" / "RHR above baseline" / "RHR at baseline" / "RHR low · recovered" + inline wearable trend | `{value}bpm · {deviation}% vs {baseline}bpm baseline` | RED: deviation > +20%; AMBER: +10% to +20%; GREEN: ≤ +10% |
| **mind** | `outcome OR clarityLevel OR confidenceLevel != null` | Unified: Stage 1 outcome + Stage 2 C×C (see §7.1a) + inline low-day/DOW/score patterns | `Sharpness: {outcome} · C:{clarity}/5 · Co:{confidence}/5` | Worst-of outcome tier and C×C tier |

**§7.1a Unified Mind Pill — Stage 1 (Outcome) + Stage 2 (Clarity × Confidence)**:

The Mind pill synthesizes both check-in stages into one label. Stage 1 provides the sharpness outcome (focused, steady, scattered, drained, overwhelmed). Stage 2 provides the clarity × confidence matrix.

**Front label examples** (Stage 1 · Stage 2):
- `Focused · sharp clarity` (outcome=focused, clarity≥4, confidence≥4)
- `Scattered · low clarity` (outcome=scattered, clarity≤2)
- `Steady · moderate mind` (outcome=steady, clarity=3, confidence=3)
- `Drained · low confidence` (outcome=drained, confidence≤2)
- `Overwhelmed · clarity low` (outcome=overwhelmed, clarity≤2)
- Falls back to C×C-only label if no outcome available (see matrix below)

**Back label**: `Sharpness: {outcome} · C:{x}/5 · Co:{y}/5`

**Color logic** (worst-of outcome tier and C×C tier):
- outcome in [overwhelmed, drained] OR (clarity≤2 AND confidence≤2) → **red**
- outcome=scattered OR clarity≤2 OR confidence≤2 → **amber**
- outcome in [focused, steady] AND clarity≥3 AND confidence≥3 → **green**

**C×C-only fallback matrix** (when no outcome available):

| Clarity | Confidence | Front Label | Color |
|---------|------------|-------------|-------|
| ≥ 4 | ≥ 4 | "Clarity sharp · high confidence" | green |
| ≥ 4 | ≤ 2 | "Clarity sharp · low confidence" | amber |
| ≤ 2 | ≥ 4 | "Low clarity · high confidence" | amber |
| ≤ 2 | ≤ 2 | "Low clarity · low confidence" | red |
| ≥ 4 | mid | "Clarity sharp" | green |
| mid | ≥ 4 | "High confidence" | green |
| ≤ 2 | mid | "Clarity low" | amber |
| mid | ≤ 2 | "Confidence low" | amber |
| mid | mid | "Mind moderate" | green |

**§7.1b Inline Pattern Qualifiers** (appended to relevant pill, no separate pattern chip):

Patterns are attached as `· qualifier` text on the most relevant signal pill:

| Pattern | Target Pill | Qualifier Example |
|---------|-------------|-------------------|
| `wearableTrend7d === 'declining'` | HRV (first priority) | `· trend declining` |
| `wearableTrend7d === 'improving'` | HRV (first priority) | `· trend improving` |
| `hrvEventCorrelation` exists | HRV | `· pattern detected` |
| `scoreTrajectory7d === 'declining'` | Sleep (or Mind if no wearable pills) | `· score declining` |
| `scoreTrajectory7d === 'improving'` | Sleep (or Mind if no wearable pills) | `· score trending up` |
| `consecutiveLowConfidence >= 3` | Mind | `· 3rd day` |
| `consecutiveLowClarity >= 3` | Mind | `· 3rd day low clarity` |
| `score < typicalDOWScore - 10` | Mind (qualifier) | `· below your usual Monday` |
| `score > typicalDOWScore + 10` | Mind (qualifier) | `· above your usual Monday` |

Each pattern is used at most once. Wearable patterns prefer HRV → Sleep → RHR. Score trajectory prefers Sleep → Mind.

### 7.2 Calibration-Aware Qualifiers

| Tier | Days | Qualifier |
|------|------|-----------|
| 1 (Absolute) | 1-2 | "· establishing baseline" |
| 2 (Partial) | 3-6 | "· early reading" |
| 3 (Full) | 7+ | "· unusual for you" (if notable deviation) |

### 7.3 Calendar Pills

| State | Display |
|-------|---------|
| `active` + events | `{meetingCount} meetings` + high-stakes event titles |
| `active` + no events | "Clear calendar" |
| `connected_no_events` | "No events today" |
| `not_connected` | "Connect calendar" (clickable → `/connected-data`) |

### 7.4 FlippableChip Behavior

- **Prompt chips** (`no-checkin`, `wearable-prompt`, `calendar-prompt`): Click triggers navigation (not flip)
- **Signal chips**: Tap toggles front (interpretation) ↔ back (raw metric) with 3D CSS flip animation
- Flip auto-resets after 4 seconds
- **No icon** on pills — the hint text below is sufficient affordance
- A helper line "Tap a pill to see the number behind it" appears when flippable chips are present
- **No duplicate summary line** — pills are the sole signal representation

---

## 8. Lean On / Watch For Logic

### 8.1 Priority Cascade

```
P-1: Wearable Sustained Deficit Override (feature-flagged OFF)
     → Fires on 2+ consecutive days HRV < -20% below baseline

P0a: Sunday evening (after 9pm)
     → getSundayEveningInsights() — tier × tomorrow-load matrix

P0b: Late evening weekdays/Saturday (after 9pm)
     → getEveningInsights() — recovery-focused content

P1a: Coach insights ≤ 3 days old ("recent")
     → "{coachStrength} (coach)" / "{coachGrowth} (coach)"

P1b: Coach insights 4-7 days old ("grace")
     → Same but with age label: "(coach, 5d ago)"
     → Suppressed if C×C contradicts coach insight

P2:  C×C Modifier (clarity × confidence)
     → 8 patterns, time-aware (see matrix below)

P3:  Partial coach + archetype/tier fill
     → Mix coach strength with archetype watchFor (or vice versa)

P4:  Archetype × Tier matrix
     → 5 archetypes × 4 tiers = 20 combinations

P5:  Tier fallback
     → Generic tier-based leanOn/watchFor
```

### 8.2 C×C Modifier Patterns (8 patterns)

| Pattern | Lean On | Watch For (Day) | Watch For (Evening) |
|---------|---------|-----------------|---------------------|
| Both low (C≤2, Co≤2) | Your self-honesty | Premature commitments | Forcing resolution tonight |
| Both high (C≥4, Co≥4) | Your alignment | Rigidity from conviction | Over-optimising what worked |
| High clarity + low confidence | Your clarity | Delaying action | Replaying doubt |
| Low clarity + high confidence | Your confidence | Moving without direction | Forcing clarity tonight |
| Low clarity only | Your discernment | Acting without anchor | Grinding open questions |
| Low confidence only | Your self-awareness | Projected confidence | Reviewing through doubt |
| High clarity only | Your direction | Crowding out perspectives | Replaying what held |
| High confidence only | Your conviction | Closing off inputs | Running past the close |

### 8.3 Archetype × Tier Matrix

| Archetype | Depleted | Managing | Strong | Peak |
|-----------|----------|----------|--------|------|
| **grounded-leader** | Lean: Stillness instinct / Watch: Absorbing others' energy | Lean: Rootedness / Watch: Quiet drain | Lean: Natural stability / Watch: Maintenance mode | Lean: Grounded precision / Watch: Tunnel focus |
| **resilient-performer** | Lean: Recovery wisdom / Watch: Performing resilience | Lean: Baseline reliability / Watch: Settling for operational | Lean: Performance window / Watch: Burning it early | Lean: Competitive edge / Watch: Spending peak too fast |
| **clear-thinker** | Lean: Economy of thought / Watch: Over-processing | Lean: Analytical clarity / Watch: Over-investing cognitively | Lean: Sharpest insights / Watch: Analysis past insight | Lean: Analytical precision / Watch: Complexity for own sake |
| **intensity-driver** | Lean: Rest-as-fuel wisdom / Watch: Forcing intensity on empty | Lean: Directed drive / Watch: Impatience with pace | Lean: Sustainable intensity / Watch: Outpacing the day | Lean: Full-force capability / Watch: Opening at full intensity |
| **adaptive-navigator** | Lean: Situational awareness / Watch: Adapting to others' demands | Lean: Flexibility / Watch: Staying adaptive vs holding firm | Lean: Strategic read / Watch: Over-navigating | Lean: Strategic agility / Watch: Complexity over decisiveness |

### 8.4 Context Enrichment Suffixes

After core Lean On/Watch For, situational suffixes are appended:

**Lean On Suffixes** (from `buildDaytimeLeanOnSuffix`):
- Morning + body strained + high-stakes: "A demanding day ahead is meeting that instinct – and your body is carrying strain into it."
- Morning + body strained: "Your body is carrying strain into today. That awareness is itself an advantage."
- Afternoon + body strained: "The morning tested that capacity – the afternoon will too."
- Evening + remaining events + strained: "The day isn't done – that instinct still serves you, and your body is signalling to pace what's left."

**Watch For Suffixes** (from `buildDaytimeWatchForSuffix`):
- Morning + body strained + high-stakes: "Spending your advantage before the day's biggest moments."
- Morning + poor sleep: "Opening at full intensity when your recovery was incomplete."
- Evening + remaining + strained: "Pushing through the remaining meetings when your body is already signalling the cost."

### 8.5 Coach Insight Age Tiers

| Tier | Days Old | Behavior |
|------|----------|----------|
| `recent` | 0-3 | Full authority, no age label |
| `grace` | 4-7 | Used with age label, suppressed if C×C contradicts |
| `contextual` | 8-14 | Used as context only alongside C×C |
| `historical` | 15-30 | Not used directly |
| `archived` | 31+ | Not used |

### 8.6 C×C Contradiction Detection

Coach insights are suppressed in `grace` tier if:
- Coach mentions "clarity/clear/direction/focus" AND clarity ≤ 2
- Coach mentions "confidence/conviction/certainty/trust in" AND confidence ≤ 2

---

## 9. Phase (Directive Phrase) Logic

### 9.1 Source Priority

1. **LLM-generated** (if successful within 6s timeout): 3-6 word directive
2. **Template fallback** (`getTheme()` function): Deterministic tier × time × calendar matrix

### 9.2 Template Matrix (4 tiers × 3 times × 8 pressure/load combos)

Each cell produces a `{ phrase, context, driver }`. Example entries:

| Tier | Time | Calendar | Phrase |
|------|------|----------|--------|
| depleted | morning | high pressure + high load | "One thing at a time." |
| depleted | evening | remaining meetings | "Protect what's left." |
| managing | afternoon | — | "Sustain the pace." |
| strong | morning | high-stakes | "Protect the window." |
| peak | morning | — | "Protect the peak." |
| peak | evening | Sunday, heavy Monday | "Protect it for Monday." |

### 9.3 Special Overrides

- **"Strength without clarity"**: When tier = strong/peak but clarity OR confidence ≤ 2 → phrase = "Strength without clarity."
- **Pattern override**: 3+ consecutive days same outcome → prepends pattern context
- **Same-day state shift**: ≥ 15 energy_balance drop/rise between today's check-ins → prepends shift context

### 9.4 Morning Theme Builder Priority Cascade

1. Poor sleep + high-stakes events → Tier-specific pacing
2. Good recovery + high-stakes events → Tier-specific protection
3. Poor sleep only → Sleep deficit
4. HRV elevated → HRV strain
5. RHR elevated only → RHR above baseline
6. High-stakes, no wearable → Tier-aware event prep
7. Dense calendar (4+), no wearable/stakes → Volume pacing
8. Default fallback → Tier-aware, demand-aware

### 9.5 Evening Theme Builder

**Branch A** (remaining meetings > 0):
- A-1: Remaining high-stakes → "Protect what's left." / "Finish at your best."
- A-2: Remaining + body strain → "Pace the remaining hours."
- A-3: Remaining, no strain → "Close with care."

**Branch B** (day done):
- P1: Heavy today + tomorrow stakes → "Ground before tomorrow." / "Restore for what matters."
- P2: Heavy today + body stressed → "Let the body close."
- P3: Light today + heavy tomorrow → "Ground before tomorrow." / "Arrive at your best."
- P4: Tomorrow high-stakes → Tier-aware tomorrow prep
- P5: Body stressed, no stakes → "Let the body close."
- P6: Today acknowledgment → Tier-aware close directive
- Default: Tier-aware soft close

---

## 10. Body Copy Logic

### 10.1 Source Priority

1. **LLM-generated `bodyText`**: Single sentence, max 15 words, **bold** key action
2. **Template `context`**: 1-3 sentences from `getTheme()`, enriched with:
   - `buildContextSuffix()`: Connects body signals to calendar demands
   - `buildAfternoonContext()`: Afternoon-specific accumulated strain
   - Sleep/RHR notes appended to evening contexts

### 10.2 Context Suffix Rules

- Never list event titles standalone — only when paired with strain or density
- Evening: retrospective framing ("You carried...")
- Morning/Afternoon: forward-looking framing ("A day anchored by...")
- Good recovery state: "Your body is well-recovered and ready for what's ahead."

---

## 11. Source Labels

| Source Key | Display Label |
|-----------|--------------|
| `coach-insights-recent` | "Coach" |
| `coach-insights-grace` | "Coach (Xd ago)" |
| `cc-modifier` | "Check-in" |
| `archetype-tier` | "Archetype" |
| `tier-fallback` | "Readiness" |
| `sunday-evening-override` | "Sunday" |
| `evening-recovery-override` | "Evening" |

---

## 12. DB Column Audit

### 12.1 `wearable_data` Column Mapping

| Edge Function Uses | Actual DB Column | Status |
|-------------------|-----------------|--------|
| `hrv` | `hrv` | ✅ Correct |
| `resting_heart_rate` | `resting_heart_rate` | ✅ Correct |
| `sleep_score` | `sleep_score` | ✅ Correct |
| `total_sleep_minutes` | `total_sleep_minutes` | ✅ Correct |
| `source` | `source` | ✅ Fixed (was `data_source`) |
| `hrv` (7d trend) | `hrv` | ✅ Fixed (was `hrv_rmssd`) |
| `summary_date` | `summary_date` | ✅ Correct |

### 12.2 `oura_daily_data` – Missing Table

The `sync-oura` edge function (line 104) inserts into `oura_daily_data` which does not exist. This means Oura ring sync is completely non-functional. Oura data is NOT flowing into the Performance Readiness Brief pipeline.

**Impact**: Users with Oura rings will have no wearable data in the system despite having an active `oura_connections` record.

### 12.3 `calendar_events` – Complete

All columns referenced by the edge function exist and are correctly named.

### 12.4 `daily_checkins` – Complete

All columns referenced exist and are correctly named.

### 12.5 `user_coach_insights` – Complete

All columns referenced exist and are correctly named.

---

## 13. Known Issues & Gaps

### 13.1 Critical

| Issue | Impact | Location |
|-------|--------|----------|
| ~~`data_source` column doesn't exist~~ | ~~Wearable source detection fails~~ | **FIXED → `source`** |
| ~~`hrv_rmssd` column doesn't exist~~ | ~~7-day HRV trend silently fails~~ | **FIXED → `hrv`** |
| `oura_daily_data` table missing | Oura sync completely broken (deprioritised) | `sync-oura/index.ts:104` |

### 13.2 Architecture Gaps

| Gap | Description |
|-----|-------------|
| No dedicated heart rate (HR) column | `wearable_data` has no `heart_rate` column. `hrElevated` is now **derived** from HRV baseline deviation: when HRV is >25% below personal 30-day baseline, sympathetic dominance is inferred. Initial absolute heuristic: HRV < 25ms. |
| ~~Wearable recovery trigger OFF~~ | **FIXED** — `ENABLE_WEARABLE_RECOVERY_TRIGGER = true`. Sustained HRV deficit detection (≥3 consecutive days <-20% below baseline) now active. |
| No LinkedIn analysis | Listed in priority cascade as future source |
| No LLM conversation analysis | Listed as future personal data source |

### 13.3 Enrichment Signal Coverage

| Signal | Status | Notes |
|--------|--------|-------|
| Yesterday score + trend | ✅ Working | |
| Back-to-back detection | ✅ Working | |
| Next event (any) | ✅ Working | |
| Practice completion rate | ✅ Working | Queries `sanctuary_events` |
| Coach session recency | ✅ Working | |
| Coach session impact delta | ✅ Working | Compares session day vs next day |
| 7-day avg + trajectory | ✅ Working | |
| Wearable 7d trend | ✅ Fixed | Was using wrong column `hrv_rmssd` |
| DOW typical outcome | ✅ Working | Needs 4+ data points for same DOW |
| HRV × event correlation | ✅ Fixed | Was using wrong column `hrv_rmssd` |
| Friction trend | ✅ Working | 7d vs previous 7d friction comparison |
| Pending commitment | ✅ Working | |
| Recent pattern | ✅ Working | |
| Most effective practice | ✅ Working | |
| Holiday detection | ✅ Working | Static lookup UK/US/UAE/SG/AU 2025-2026 |
| Week-ahead shape | ✅ Working | Sunday evening only |
| State shift (intra-day) | ✅ Working | ≥15 energy_balance change |
| Divergence mode | ✅ Working | MASKED_HIGH / RECOVERY_UNDERWAY |
| hrElevated (peak HR proxy) | ✅ Fixed | Derived from HRV deviation >25% below baseline |
| Wearable recovery trigger | ✅ Enabled | Sustained HRV deficit (≥3 days <-20%) triggers recovery override |
