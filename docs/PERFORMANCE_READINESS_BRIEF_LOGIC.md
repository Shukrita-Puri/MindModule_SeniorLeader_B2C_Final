# Performance Readiness Brief – Complete Technical Documentation

> **Version**: v6.2
> **Last updated**: 2026-05-20
> **Edge functions**: `compute-inner-readiness`, `compute-outer-readiness`
> **Client component**: `src/components/home/DecisionReadinessBrief.tsx`
> **Persona**: *Chief of Staff for the Mind* — strategic register, wearable-first, never coaching imperatives
> **Canonical LLM prompt**: `docs/PERFORMANCE_READINESS_BRIEF_LLM_PROMPT.md` (v4.0 with lovable deltas)
> **CEO behaviour rules**: `_shared/ceo-behaviour/*` — catalogue in `docs/CEO_BEHAVIOUR_RULE_MAP.md`

### v6.2 Changes Summary (2026-05-20)

- **Prompt split out**: the v4 LLM prompt is now its own document — `docs/PERFORMANCE_READINESS_BRIEF_LLM_PROMPT.md`. This file describes runtime architecture, validators, pills, fallback, and the snapshot cache. Prompt text is no longer duplicated here.
- **§6.8 rewritten as a pointer**: CEO realities (veto risk, second wind, circadian, decision leakage, post-peak, personal friction, board-level outcome, advance prep, back-to-back, travel, weekend, PTO, conference, decision density, etc.) live exclusively in `_shared/ceo-behaviour/*`. The brief consumes them via `evaluate({ scope: "brief" })` and never re-implements a trigger.
- **New §1.3 — Where each piece of logic lives**: client / edge / `_shared/*` / LLM prompt / DB map.
- **New §15 — Module-extraction candidates**: concrete proposals to lift day-type overrides, deterministic theme matrix, body templates, C×C modifier, archetype×tier matrix, validators, pillar composition, lexicon, source labels, HRV×event correlation, and wearable calibration out of the edge function into `_shared/*` modules. **No code change yet — proposals only, awaiting user direction.**
- **New §16 — CEO-behaviour audit**: seven points where CEO-reality-shaped logic still sits inside `compute-outer-readiness`. Each is raised as a question, not silently moved.
- Patterns A–I (§6.11), day-type overrides (§6.10), and hard constraints (§6.9) now reference the canonical prompt doc rather than restating it. Differences (additional lovable validators, sustained-deficit J pattern) are flagged in the prompt doc.
- Cold-start coverage (Day 1 / Day 2–6 / Day 7) is fully described in the prompt doc §4 and no longer duplicated here.

### v6.1 Changes Summary (2026-04-21)

- **3-pillar Executive Pills**: The 6-chip system (Heart / Sleep / Mind-Sharpness / Clarity×Confidence) has been replaced by **three executive pillars** rendered as glass capsules: `COGNITIVE`, `PHYSIOLOGY`, `RESILIENCE`. Each pill composes multiple inputs through severity-aware median-of-tiers logic.
- **Four-Role Contract (§2.18.5)**: Phrase / Body / Lean On / Watch For are formally bound to distinct **jobs, data layers, and time horizons**. Each must add information the others did not.
- **Pillar-Vocabulary Map (§2.19.2)**: Phrase + first body sentence MUST contain ≥1 explicit pillar word. HRV is treated as Cognitive (primary) or Resilience (secondary) — never "Body".
- **3-Part Impact Mandate (§2.19)**: Body must triangulate Signal Evidence + Pillar Categorization + The Stake.
- **Body Copy Assessment Contract (§2.19.5)**: Pills own numbers; body owns synthesis. Five rules govern the sentence shape.
- **Snapshot cache (`brief_snapshots`)**: Server-side dedupe by `input_signature`; persists `briefSource: 'llm' | 'deterministic'` so a successful synthesis stays canonical for the day.
- **Telemetry**: `llmFallbackReason`, `llmAttempts`, validator rejection codes are written into the snapshot for diagnosis.
- **Response-assembly try/catch**: Final assembly is wrapped — a downstream error degrades to a soft 200 fallback, never a 500 that blanks the dashboard.
- **Two-tier LLM strategy**: Gemini 2.5 Flash (4s) → Claude Sonnet (6s). Worst case ~10s.
- **Strict V6.1 validators**: 25+ rules — wellness/tier/readiness blacklists, generic-trait blocklist, pattern-relevance gate, signal-substring-of-body gate, lexicon-cluster gate. **Any rejection drops the LLM brief and ships the deterministic template.**

---

## Table of Contents

1. [Purpose & Architecture](#1-purpose--architecture)
2. [Upstream Data Sources](#2-upstream-data-sources)
3. [Connected Database Tables](#3-connected-database-tables)
4. [Inner Readiness Scoring](#4-inner-readiness-scoring)
5. [Outer Readiness / Compass](#5-outer-readiness--compass)
6. [LLM Synthesis – Chief of Staff for the Mind (v6.1)](#6-llm-synthesis--chief-of-staff-for-the-mind-v61)
7. [Signal Pills v6 – 3 Executive Pillars](#7-signal-pills-v6--3-executive-pillars)
8. [Lean On / Watch For v6](#8-lean-on--watch-for-v6)
9. [Phrase Logic v6](#9-phrase-logic-v6)
10. [Body Copy Logic v6](#10-body-copy-logic-v6)
11. [LLM Resilience & Snapshot Cache](#11-llm-resilience--snapshot-cache)
12. [Source Labels](#12-source-labels)
13. [DB Column Audit](#13-db-column-audit)
14. [Known Issues & Gaps](#14-known-issues--gaps)
15. [Module-Extraction Candidates (v6.2 audit)](#15-module-extraction-candidates-v62-audit)
16. [CEO-Behaviour Audit — Logic Still Inside Edge Function](#16-ceo-behaviour-audit--logic-still-inside-edge-function)

---

## 1. Purpose & Architecture

The **Performance Readiness Brief** answers three questions for a senior leader, every check-in, in under 10 seconds of scanning:

- **"What is my readiness right now?"** → score, tier, three Signal Pills
- **"What does the day actually require, and what is the move?"** → Phrase + Body
- **"What can I lean on, and what should I watch for?"** → Lean On / Watch For (history- and pattern-grounded)

### 1.1 Architecture Flow

```
┌──────────────────────────┐    ┌─────────────────────────────────────┐
│ Client (PRB Card)        │───▶│ computeEnergyState() client          │
│ DecisionReadinessBrief   │    │ → DB read: check-in, wearable, score │
└──────────┬───────────────┘    └─────────────────────────────────────┘
           │ POST tier · score · clarity · confidence · checkInOutcome · timezoneOffset
           ▼
┌────────────────────────────────────────────────────────────────────┐
│ compute-outer-readiness (Edge Function · ~4087 lines)              │
│                                                                    │
│ 1.  Server-side calendar metrics (today + tomorrow + week-ahead)   │
│ 2.  Wearable fetch + 30-day baseline + deviations                  │
│ 3.  Coach intelligence (insights, memories, commitments, breakthr) │
│ 4.  Archetype + onboarding component scores                        │
│ 5.  Recent check-ins (7-day + 30-day patterns)                     │
│ 6.  40+ enrichment signals (HRV×event, friction, DOW, streaks)     │
│ 7.  Signal Triage → top 5 signals                                  │
│ 8.  Temporal Triangulation (Immediate · Tactical · Strategic)      │
│ 9.  ─── Snapshot Cache lookup (by input_signature) ────────────┐   │
│      │ HIT  → return cached phrase/body/leanOn/watchFor         │  │
│      └ MISS → continue                                          │  │
│ 10. LLM synthesis (Gemini 2.5 Flash 4s → Claude Sonnet 6s)        │
│       └─ validateV61Output: 25+ gates                              │
│ 11. Deterministic fallback templates (getTheme, getCcModifier)     │
│ 12. Snapshot upsert (fire-and-forget) + telemetry                  │
│ 13. Response assembly (try/catch → soft 200 on error)              │
│                                                                    │
│ Returns: phrase · context (body) · leanOn · watchFor · pills data  │
│          · briefSource · llmFallbackReason · wearableStatus · ...  │
└────────────────────────────────────────────────────────────────────┘
```

### 1.2 Downstream Consumers

| Consumer | What it uses |
|----------|-------------|
| PRB Card (home) | phrase, bodyText, leanOn, watchFor, **3 Signal Pills**, score, tier |
| Mastery Plan | `stateAlreadyUsed[]`, `compassAlreadyUsed[]` (no-repeat relay) |
| Coach sessions | leanOn, watchFor for session context |
| JIT nudges | `coachInsightAge`, `nextHighStakesEvent` |

### 1.3 Where Each Piece of Logic Lives (v6.2)

| Concern | Lives in | Notes |
|---------|----------|-------|
| Pill rendering + composition | `src/components/home/DecisionReadinessBrief.tsx` (`composePillar`, per-input contribs) | **Duplicated** with edge-side composition — §15 candidate to lift to `_shared/pillars/`. |
| Inner readiness score | `compute-inner-readiness` edge fn | Pure scoring; called by client. |
| Outer readiness pipeline | `compute-outer-readiness` edge fn | Q1–Q16 enrichment, LLM dispatch, snapshot cache, response assembly. |
| Event taxonomy (A–H pillars, 30 subtypes, classifier, phase map) | `supabase/functions/_shared/events/*` | Single source — never restated in edge fn. |
| CEO behaviour rules (veto/second-wind/decision-leakage/post-peak/board-level/travel/weekend/PTO/conference/density/back-to-back/multi-cal/etc.) | `supabase/functions/_shared/ceo-behaviour/*` | Catalogue: `docs/CEO_BEHAVIOUR_RULE_MAP.md`. Brief consumes via `evaluate({scope:"brief"})`. |
| LLM system + user prompt | `docs/PERFORMANCE_READINESS_BRIEF_LLM_PROMPT.md` (canonical) + assembled at runtime by edge fn | Prompt versioned with `BRIEF_PROMPT_VERSION`. |
| Snapshot cache | `brief_snapshots` table + edge fn upsert | Key: `(user_id, local_date, time_window, input_signature, prompt_version)`. |
| Wearable calibration + Apple ×0.85 | `_shared/wearable/calibration.ts` | Brief should consume; some inline duplication remains — §15 candidate. |
| Wearable data | `wearable_data` table | DB is canonical (memory rule). No fallbacks. |
| Day-type overrides (Sunday eve, Monday AM, Friday/pre-rest, weekend, holiday, post-high-stakes, consecutive-low) | Currently inline in edge fn (P-1, P0a, P0b) | §15 candidate to lift to `_shared/brief/day-type-overrides.ts` so weekend/PTO behaviour rules feed it. |
| Deterministic phrase matrix `getTheme()` | Inline in edge fn | §15 candidate to lift to `_shared/brief/deterministic-theme.ts`. |
| `outcomeSignals.*` deterministic body templates | Inline in edge fn (line 1728 etc.) | §15 candidate to delete or lift — violates "structured, not prose". |
| C×C modifier (8 patterns) | Inline in edge fn | §15 candidate to lift to `_shared/brief/cc-modifier.ts`. |
| Archetype × Tier matrix (5×4) | Inline in edge fn | §15 candidate. |
| Validators (25+) — `validateV61Output` | Inline in edge fn | §15 candidate to lift to `_shared/brief/llm-validators.ts`. |
| Pillar-Vocabulary Map + Elastic Lexicon | Inline in edge fn (§6.5, §6.7) | §15 candidate to lift to `_shared/brief/lexicon.ts`. |
| HRV × Event correlation (Q14) | Inline in edge fn | §15 candidate to lift to `_shared/brief/hrv-event-correlation.ts` (also used by Insights + JIT). |
| Source-label map (`formatFallbackSignal`) | Inline in edge fn | §15 candidate to lift to `_shared/brief/source-labels.ts`. |

---

## 2. Upstream Data Sources

### 2.1 Client-Provided (Request Body)

| Field | Source | Type | Description |
|-------|--------|------|-------------|
| `innerReadinessTier` | `computeEnergyState()` | `depleted\|managing\|strong\|peak` | Pre-computed tier |
| `innerReadinessScore` | `computeEnergyState()` | `0-100` | Composite readiness score |
| `clarityLevel` | Today's check-in | `1-5 \| null` | Cognitive clarity |
| `confidenceLevel` | Today's check-in | `1-5 \| null` | Decision confidence |
| `mentalSharpnessLevel` | Today's `/check-in-detail` | `1-5 \| null` | Cognitive acuity slider |
| `checkInOutcome` | Today's `/daily-check-in` | `string \| null` | drained · overwhelmed · scattered · steady · focused · thriving · anxious · frustrated · calm · energised |
| `timezoneOffset` | `Date.getTimezoneOffset()` | `number` | Minutes offset from UTC |

### 2.2 Server-Fetched (Inside Edge Function)

| Signal | DB Table | Columns Used | Notes |
|--------|----------|-------------|-------|
| Calendar today | `calendar_events` | `start_time, end_time, is_organizer, attendees_count, is_recurring, title` | Gated on `calendar_connections.is_active` |
| Calendar tomorrow | `calendar_events` | Same | Fetched evenings (≥17:00) + Friday + Sunday |
| Calendar week-ahead | `calendar_events` | Same | Sunday evening only |
| Wearable (latest day) | `wearable_data` | `hrv, resting_heart_rate, sleep_score, total_sleep_minutes, source` | Most recent row |
| Wearable baseline (30d) | `wearable_data` | Same | Personal baseline + deviation % |
| Wearable trend (7d) | `wearable_data` | `hrv, summary_date` | Improving / declining / stable |
| Coach insights | `user_coach_insights` | `insight_type, insight_content, created_at` | Active strength + growth_area |
| Coach memories | `coach_memory_index` | `memory_content, memory_type, pattern_area, key_themes, importance_score` | Importance ≥ 5 |
| Coach commitments | `coach_accountability_tracker` | `commitment_text, status, meta_skill, pattern_area` | Status = 'pending' |
| Coach breakthroughs | `coach_breakthrough_moments` | `breakthrough_content, breakthrough_type, meta_skill, impact_score` | Impact ≥ 3 |
| Coach session recency | `coach_session_summaries` | `created_at, session_id` | Most recent session |
| Archetype | `profiles` | `user_archetype` | Maps to archetype × tier matrix |
| Recent check-ins | `daily_checkins` | `checkin_date, outcome, clarity_level, confidence_level, mental_sharpness_level, energy_balance` | Last 7 days |
| DOW patterns | `daily_checkins` | `outcome, energy_balance, checkin_date` | Last 60 days |
| `consecutiveLowClarity` | `daily_checkins` | `clarity_level` | Server-derived from last 10 check-ins |
| `consecutiveLowConfidence` | `daily_checkins` | `confidence_level` | Server-derived from last 10 check-ins |
| `mostEffectivePractice` | `sanctuary_events` | `content_id, effectiveness_rating` | Top-rated practice |
| Holiday detection | `profiles` | `timezone` | Static lookup UK / US / UAE / SG / AU 2025-2026 |

---

## 3. Connected Database Tables

### 3.1 `wearable_data` – Primary Wearable Store

| Column | Type | Used By PRB | Notes |
|--------|------|-------------|-------|
| `user_id` | text | ✅ | |
| `summary_date` | date | ✅ | Daily key |
| `source` | text | ✅ | `apple-healthkit`, `oura`, etc. |
| `hrv` | numeric | ✅ | RMSSD in ms |
| `resting_heart_rate` | integer | ✅ | bpm |
| `sleep_score` | integer | ✅ | 0–100 |
| `total_sleep_minutes` | integer | ✅ | Adjusted ×0.85 for Apple "in-bed" → "asleep" |

> ⚠️ Column is `source` (not `data_source`), `hrv` (not `hrv_rmssd`).

### 3.2 `calendar_events`, `daily_checkins`, `user_coach_insights`, `profiles`

(Unchanged from v4 — see §13 DB Column Audit.)

### 3.3 `brief_snapshots` – v6.1 Snapshot Cache

| Column | Type | Used By | Notes |
|--------|------|---------|-------|
| `user_id` | text | ✅ | |
| `local_date` | date | ✅ | User's local calendar day |
| `time_window` | text | ✅ | morning / afternoon / evening |
| `input_signature` | text | ✅ | Deterministic hash of inputs (calendarLoad, deviations, outcome, clarity, confidence, etc.) |
| `prompt_version` | text | ✅ | `BRIEF_PROMPT_VERSION` (currently `v6.1`) |
| `phrase` / `body_text` | text | ✅ | Cached output |
| `lean_on` / `lean_on_source` | text | ✅ | |
| `watch_for` / `watch_for_source` | text | ✅ | |
| `brief_source` | text | ✅ | `llm` or `deterministic` |
| `driver` / `score` / `tier` | text/int | ✅ | Theme + readiness reference |
| `payload_json` | jsonb | ✅ | Full signal snapshot for diagnostics: `signals{}`, `llmAttempts[]`, `llmFallbackReason`, `validatorRejections{}` |

**Conflict key**: `(user_id, local_date, time_window, input_signature, prompt_version)` — same inputs collapse to a single row per time window.

---

## 4. Inner Readiness Scoring

(Edge function: `compute-inner-readiness` — unchanged from v5.)

### 4.1 Input Signals

| Signal | Range | Source |
|--------|-------|--------|
| Felt State | 0–100 | Outcome mapped: drained=20, overwhelmed=25, scattered=35, steady=55, focused=80 |
| Internal Readiness (C×C) | 0–80 | `(clarity + confidence) × 8` |
| Circadian | ~35–65 | Time-of-day ± day-of-week |
| Wearable (HRV) | 0–100 | HRV vs 30-day baseline: >+15% → 80, <-15% → 20, else 50 |

### 4.2 Weighting Modes

| Mode | Condition | Wearable | Felt | C×C | Circadian |
|------|-----------|----------|------|-----|-----------|
| **No Wearable** | No wearable | — | 40% | 45% | 15% |
| **Aligned** | gap ≤ 30 | 35% | 25% | 30% | 10% |
| **Masked High** | felt − wearable > 30 | 40% | ~25% | ~25% | 10% |
| **Recovery Underway** | wearable − felt > 30 | 35% | ~27.5% | ~27.5% | 10% |

### 4.3 Tier Mapping

| Score | Tier | Sub-Tiers |
|-------|------|-----------|
| 0–39 | `depleted` | very-low (≤15), low (≤25), low-mid (≤35) |
| 40–59 | `managing` | mid (≤55) |
| 60–74 | `strong` | mid-high (≤65), high (≤75) |
| 75–100 | `peak` | very-high (>75) |

### 4.4 Divergence Detection

| Flag | Condition | Implication |
|------|-----------|-------------|
| `ALIGNED` | \|felt − wearable\| ≤ 30 | Body and mind agree |
| `MASKED_HIGH` | felt − wearable > 30 | User feels better than body shows |
| `RECOVERY_UNDERWAY` | wearable − felt > 30 | Body recovering faster than perceived |

---

## 5. Outer Readiness / Compass

### 5.1 Calendar Metrics

**Load**: 4+ events → high · 3 + avg gap < 20min → high · 3 → medium · <3 → low.

**Pressure** (per-event weights summed): organizer +2 · attendees>5 +3 · attendees>2 +1 · duration>60m +2 · duration≥30m +1 · non-recurring +1 · prime time (9–12, 14–16) +1 · gap<5m +3 · gap<15m +2 · density boost (3+ meetings, total gap <30m) +3 · intensity multiplier (>50% non-recurring + organizer) ×1.5. Thresholds: ≥6 = high, ≥3 = medium. Past events ½ weight; future events full.

**High-Stakes**: non-recurring AND (attendees>5 OR organizer+attendees>2 OR duration>60m). Excludes personal blocks + all-day blockers.

**Meeting Count**: filtered (excludes personal blocks + all-day blockers) for user-facing text.

### 5.2 Wearable Context

| Signal | Threshold |
|--------|-----------|
| `hrvElevated` | HRV < 30 ms (absolute) |
| `poorSleep` | sleep_score < 60 OR total_sleep_minutes < 360 (6 h hard floor) |
| `rhrElevated` | RHR deviation > +10 % vs 30-day baseline |
| `hrElevated` (proxy) | HRV deviation > 25 % below baseline → infer sympathetic dominance |

Apple Health correction: `total_sleep_minutes × 0.85`.

### 5.3 4-Tier Wearable Calibration

| Tier | Days Connected | Label | Thresholds |
|------|---------------|-------|-----------|
| 0 (None) | 0 | Prompt to connect | — |
| 1 (Absolute) | 1–2 | "establishing baseline" | Population norms (HRV<20 ms = RED) |
| 2 (Partial) | 3–6 | "early reading" | Short-term deviation |
| 3 (Full) | 7+ | Full qualifiers | 30-day personal baseline |

---

## 6. LLM Synthesis – Chief of Staff for the Mind (v6.1)

### 6.1 Persona & Tagline

> *"You are the Chief of Staff for a senior leader's mind — a former operator who knows them by data, not prose. You see HRV, RHR, HR, sleep, calendar, coach patterns, self-declared state, and goals. You speak with earned directness, high-status precision, the way a trusted advisor speaks behind closed doors. You see the adrenaline mask and you name it."*
>
> **Tagline**: "You do not report data. You provide Decision Intelligence."

### 6.2 Reasoning Protocol (silent — not in output)

| Step | Lens |
|------|------|
| **1 BODY READ** | Wearable-first: HRV, RHR, HR, Sleep. Cite the number. Flag MASKED_HIGH / RECOVERY_UNDERWAY. |
| **2 COMPOUND** | HR elevated + poor sleep = compounded deficit. Sleep above baseline + HRV low = loaded but resourced. Acute vs chronic (7d). |
| **3 THE GAP** | Where they think they are vs where the data says. Triangulate wearable × Mental Energy / Sharpness / Clarity / Confidence. |
| **4 WHAT'S BEING ASKED** | Today's actual demand — name the event or load. Supply-demand gap → name it. |
| **5 PATTERN/HISTORY** | Has this combination occurred before? Typical DOW? Coach insight relevant? Pending commitment? HRV×event correlation? |
| **6 THE DIRECTION** | The single most useful thing to say. If nothing specific: return null. |

### 6.3 §2.18.5 The Four-Role Contract (master rule — read before every output)

| Element | Job | Data Layer | Time Horizon | Length |
|---------|-----|-----------|--------------|--------|
| **PHRASE** | ORIENT — "What kind of day is this?" | Today | Immediate | 2–4 words |
| **BODY** | ADVISE — "What shape, what move?" | Today + Patterns | Immediate + Tactical | 2–3 sentences (≤50 words) |
| **LEAN ON** | RESOURCE — "What history says you can deploy" | Pattern · Archetype · Coach | Tactical + Strategic | 2–4 words + source |
| **WATCH FOR** | RISK — "The recurring trap this state activates" | Pattern · Archetype · Coach | Tactical + Strategic | 2–4 words + source |

**Non-redundancy test (silent before emitting)**:
1. Phrase orients without explaining? If it explains, shorten.
2. Body names BOTH green AND red and ends with a move?
3. LEAN ON adds something body did not say?
4. WATCH FOR names a pattern/trap, not today's red signal?
5. Could any element be removed without losing information? If yes, rewrite.

### 6.4 §2.19 The 3-Part Impact Mandate (body copy structure)

Every body must synthesize three elements in 2–3 scannable sentences:

1. **SIGNAL EVIDENCE** — cite a number ("HRV 110 ms", "Sleep 6h12m", "RHR +8 bpm", "Sharpness 2/5") OR a named event ("the 2 PM Board").
2. **PILLAR CATEGORIZATION** — explicitly link to Cognition / Physiology / Resilience, triangulated with co-relating calendar events when present.
3. **THE STAKE** — link to a Leadership Variable from the Elastic Lexicon (§2.20).

### 6.5 §2.19.2 Pillar-Vocabulary Map (mandatory)

The dashboard renders three pillars derived from the same signals the LLM receives. Vocabulary must match the pill the user sees.

| Lead signal | Required vocabulary cluster |
|-------------|------------------------------|
| HRV alone (sleep + RHR within baseline) | **COGNITIVE**: Mind · Sharpness · Processing capacity · Decision Power |
| Sleep deficit OR RHR elevated (no HRV crash) | **PHYSIOLOGY**: Body · Hardware · Operational Drive · System recovery |
| HRV + Sleep + RHR all loaded | **COMPOUND**: System debt · Whole-stack load |
| HRV low + Mental Energy red/amber | **RESILIENCE**: Buffer · Composure · Internal Buffer · Diplomatic Shield |
| Mental Energy red, wearable green | **RESILIENCE only** — never say "Body" or "Hardware" |

**FORBIDDEN**: Saying "Body shows load" / "Hardware under-recovered" when sleepDeviation > -8 % AND rhrDeviation < +10 %. HRV is NOT body — HRV belongs to Cognitive (primary) or Resilience (secondary).

**Phrase Opacity Rule**: Phrase + first body sentence MUST contain ≥1 explicit pillar word from `{Cognition, Cognitive, Mind, Sharpness, Physiology, Body, Sleep, Hardware, Resilience, Composure, Buffer, Mental Energy}`.

### 6.6 §2.19.5 Body Copy Assessment Contract (5 rules)

| Rule | Constraint |
|------|-----------|
| **RULE 1 — No score restate** | Forbidden: "31/100", "score of X", "X out of 100", "your score is", "low/high readiness score". Pillar language only. |
| **RULE 2 — Pills own numbers** | Body owns synthesis. If a number appears, it is a single qualifier inside an assessment sentence — never the subject, never in a list of 2+ metrics. |
| **RULE 3 — Triangulate 3 layers** | (a) inner signal read — name the lever pillar; (b) outer demand — calendar load / pressure window / named JIT event; (c) directional move — one proactive instruction. If outer context is absent → CEO REALITY (decision velocity, attention as scarce resource, recovery debt, judgement under load). |
| **RULE 4 — Few numbers that matter** | Typical body uses 0–2 specific numbers, only when they sharpen the assessment. |
| **RULE 5 — Directional tone** | Brief from a Chief of Staff, not a data report. Tells the leader what shape the day takes and what move it asks for — not what the numbers were. |

**Worked example**:

❌ Bad (data-led, restates score, lists metrics):
> "HRV is 20 % below baseline and RHR is 18 % below baseline, with a score of 31/100. With 4 consecutive depleted days, hardware recovery is the necessary focus."

✅ Good (assessment-led, triangulated, no score, one calendar reference, one directional move):
> "Body is recovered but Mind is carrying the strain — and the calendar adds three high-stakes touchpoints before lunch. The day's edge is sequencing: handle the Board prep while attention is fresh, then let easier blocks ride on physiology. One real recovery window before evening is what protects tomorrow."

### 6.7 §2.20 Elastic Lexicon (use ≥1 cluster concept in body)

| Cluster | Concepts |
|---------|----------|
| **COGNITION (Intelligence)** | Decision Power · Strategic Accuracy · Mental Bandwidth · Processing Capacity · Solving Logic |
| **PHYSIOLOGY (Energy)** | Operational Drive · Leadership Stamina · Hardware Recovery · System Output · Physical Runway |
| **RESILIENCE (Stability)** | Strategic Composure · Executive Presence · Diplomatic Shield · Reactive Risk · Internal Buffer |

### 6.8 CEO Behaviour Rules — Pointer (v6.2)

CEO behaviour rules (Veto Risk, Second Wind, Circadian Priority, Decision Leakage, Post-Peak Hangover, Personal Friction Inference, Board-Level Outcome, Advance Prep 24h, Back-to-Back Override, Meeting Prep Cliff, Multi-Calendar Load, Travel cluster, Weekend ladder, PTO/Holiday, Conference cluster, Decision Density, plus Batch-3/4 stubs) **do not live in this edge function**.

They live in `supabase/functions/_shared/ceo-behaviour/*.ts` and are catalogued in `docs/CEO_BEHAVIOUR_RULE_MAP.md` (rule ↔ doc anchor ↔ signals consumed ↔ edge/LLM seam).

**How the brief consumes them**:

```ts
import { evaluate } from "../_shared/ceo-behaviour";
const flags = evaluate({ scope: "brief", signals }); // BehaviourFlag[]
// → injected into the user prompt under "=== CEO BEHAVIOUR ===" (prompt doc §6.9)
```

The brief treats each returned `BehaviourFlag` (`rule`, `severity`, `evidence`, `anchorEvent`, `stake`, `copyHint`) as an input to phrase/body/leanOn/watchFor synthesis. It **never re-implements the trigger**.

> ⚠️ §16 lists CEO-reality-shaped logic that still sits inside the edge function and has not yet been lifted into `_shared/ceo-behaviour/`. Those are raised as questions for the user before any extraction.

### 6.9 Hard Constraints — No Exceptions

- **WELLNESS BLACKLIST**: relax · mindful · breathe · calm · wellness · self-care · journey · nourish · recharge · restore · genuine · authentic · recovery (standalone)
- **SCORE TIER BLACKLIST**: never reference Moderate / High / Low / Strong as standalone tier labels
- **READINESS BLACKLIST**: never use the word "readiness" in phrase or body
- **DAY NAMING**: name a future day only if ≤2 days away; otherwise "this week" / "mid-week"
- **JIT OVERRIDE**: <30 min → orient entirely · 30–90 min → preparation · >90 min → context only
- **NO PHRASE IN BODY**. **NO CALENDAR WITHOUT CONNECTION**. **BOLD via `<strong>` only** (no asterisks). **NULL fields → ignore, never fabricate.**

### 6.10 Day-Type Overrides

| Day | Frame |
|-----|-------|
| **Sunday eve** | Frame into Monday. Loaded+heavy → directive. Light → spacious. Never "Reflect" / "Rest before" / "Prepare". |
| **Monday AM** | Week-setting. Reference load + first high-stakes. Poor signals → name supply-demand gap. |
| **Fri / pre-rest eve** | Closure. Next-week pressure → "Don't fully unplug — [event] needs space." None → "Disconnect fully." |
| **Weekend day** | No calendar/work framing. Wearable strong → agency. Poor → acknowledge. |
| **Holiday** | Honour the choice to check in. Calendar shows events → orient around what matters. Empty → permission to be off. |
| **Post-high-stakes PM** | HRV historically drops → acknowledge cost. Don't push. |
| **Consecutive low 3+** | Systemic, not situational. Name it. Coach pattern → surface. |

### 6.11 Signal Synthesis Patterns (A–I)

| Pattern | Trigger | Direction |
|---------|---------|-----------|
| **A** | Clarity 4–5 + Confidence 1–2 | Use clarity before confidence catches up |
| **B** | MASKED_HIGH | Name the gap with actual numbers — "HRV down 22 % but rated strong" — then direct |
| **C** | Compounded Deficit (HR + sleep + HRV all loaded) | Supply-demand gap + strategic instruction |
| **D** | Historical Event Correlation (≥3 occurrences, >10 % deviation) | Name pattern with §2.19.1 relevance gate |
| **E** | Supply-Demand Gap (tomorrow HIGH + today below baseline) | Protect tonight |
| **F** | Sunday Anxiety (confidence low + HRV low + Monday high-stakes) | Acknowledge, redirect |
| **G** | RECOVERY_UNDERWAY | Name the metric showing it; agency without overclaiming |
| **H** | Consecutive High-Stakes Days | Cumulative toll, manage transitions |
| **I** | Coach Signal Active | Connect to today's state |

### 6.12 Few-Shot Examples (architectural templates — synthesize, don't copy)

```json
// EXAMPLE 1 — Day 1 · No Wearable · Onboarding Only
{"phrase":"Baseline day.","body":"Pattern recognition is your archetype edge and Composure your goal — <strong>Internal Buffer is the variable to track</strong>. Tomorrow we begin reading the signals.","leanOn":[{"signal":"Pattern Recognition","source":"ARCHETYPE"}],"watchFor":[{"signal":"Over-Analysis Early","source":"ARCHETYPE"}]}

// EXAMPLE 2 — Sunday Evening · Heavy Week · High-Stakes Monday
{"phrase":"Monday is loaded.","body":"HRV down 14%, investor call at 9am — <strong>Strategic Composure depends on how you close tonight</strong>. The first hour sets the week.","leanOn":[{"signal":"Sunday composure","source":"PATTERN"}],"watchFor":[{"signal":"Over-preparing tonight","source":"PATTERN"}]}

// EXAMPLE 3 — Decision Leakage (Emotional Labor)
{"phrase":"Town Hall risk.","body":"HRV down 18%, mental energy depleted. Resilience compressed — <strong>Decision Leakage risk in the 2 PM Town Hall</strong>. HR has spiked in your last 3 Town Halls.","leanOn":[{"signal":"Pre-Town-Hall composure track","source":"PATTERN"}],"watchFor":[{"signal":"Late-session reactivity","source":"PATTERN"}]}

// EXAMPLE 4 — MASKED_HIGH · Veto Risk
{"phrase":"Body is louder.","body":"Confidence 5/5, HRV 22% below, sleep 5.1hrs — <strong>Operational Drive is borrowed, not earned</strong>. Board prep at 11am: protect the 2 hours before.","leanOn":[{"signal":"Recovery Intelligence","source":"ARCHETYPE"}],"watchFor":[{"signal":"Performing Resilience","source":"ARCHETYPE"}]}

// EXAMPLE 5 — Baseline Intelligence (no calendar, no wearable)
{"phrase":"Holding base.","body":"Mental sharpness 3/5, no calendar pressure — <strong>Internal Buffer stable for future load</strong>. Hardware Recovery is the hold today.","leanOn":[{"signal":"Composure Instinct","source":"ARCHETYPE"}],"watchFor":[{"signal":"Spreading energy wide","source":"PATTERN"}]}
```

### 6.13 Output Contract

```json
{"phrase":"...","body":"...","leanOn":[{"signal":"...","source":"..."}],"watchFor":[{"signal":"...","source":"..."}]}
```

`source ∈ {ARCHETYPE, COACH, PATTERN}`. `DATA` and `CHECK-IN` are **NOT allowed** in LLM output.

---

## 7. Signal Pills v6 – 3 Executive Pillars

The PRB renders **three glass capsules** above the body copy. Each pill composes multiple raw inputs through a severity-aware **median-of-tiers** rule with a **strong-red override**. State color appears on the icon badge only; the capsule body is neutral.

### 7.0 Composition Logic (`composePillar`)

```ts
type ContribTier = 'red' | 'amber' | 'green' | 'neutral';
type Severity   = 'strong' | 'mild' | 'normal';
interface PillarContrib { tier: ContribTier; severity?: Severity }

// 1. Any single contrib with {tier:'red', severity:'strong'} → forces RED.
// 2. Otherwise: median-of-tiers on non-neutral inputs; ties break UPWARD (toward worse).
//    e.g. [green, amber, red] → upper-median = amber.
//    e.g. [amber, red] → upper-median = red.
//    e.g. [green, red] → upper-median = red.
```

State words:

| Pill | green | amber | red | neutral |
|------|-------|-------|-----|---------|
| COGNITIVE | STEADY (or CALM if wearable trend improving) | HIGH LOAD · MASKED LOAD (if `masked-high`) · RECOVERING (if `recovery-underway`) | STRAINED | BUILDING |
| PHYSIOLOGY | RESTED | FADING | DEPLETED | BUILDING |
| RESILIENCE | STEADY | STRAINED | REACTIVE | BUILDING |

Pill display structure:
- **Top lines** = wearable rows
- **Bottom lines** = self-declared rows
- Empty fallback: `topEmptyText` / `bottomEmptyText`

---

### 7.1 COGNITIVE Pillar

**Inputs**: HRV (primary) · Sharpness (1–5 slider) · Clarity (1–5 slider) · cognitive outcome.

**Per-input contribution functions** (from `DecisionReadinessBrief.tsx` lines 587–698):

| Input | Function | Thresholds |
|-------|----------|-----------|
| HRV (Cognitive) | `hrvCognitiveContrib` | `dev ≤ -20 %` → strong-RED · `dev < -15 %` → mild-RED · `dev < -8 %` → AMBER · else GREEN. No deviation: `hrv<20` → mild-RED · `hrv<40` → AMBER · else GREEN. Null → NEUTRAL. |
| Sharpness | `sharpnessContrib` | `1` → strong-RED · `2` → mild-RED · `3` → AMBER · else GREEN. Null → NEUTRAL. |
| Clarity | `clarityContrib` | `≤2` → mild-RED · `3` → AMBER · else GREEN. Null → NEUTRAL. |
| Cognitive outcome | `cognitiveOutcomeContrib` | `scattered` → mild-RED · `focused`/`thriving` → GREEN. Other outcomes → NEUTRAL. |

**Outcome routing**: `COGNITIVE_OUTCOMES = {scattered, focused}` (+ `thriving` accepted as green).

**Wearable Authority overrides** (Cognitive only):
- `MASKED_HIGH` (HRV red, self-reports green/amber): if pill composed to GREEN → cap at AMBER. Signal word becomes `MASKED LOAD`. Qualifier: *"system signal ahead of felt state"*.
- `RECOVERY_UNDERWAY` (HRV green, self-reports red): if pill composed to RED → cap at AMBER. Signal word becomes `RECOVERING`.

**Display lines**:

| Position | Line | Qualifiers |
|----------|------|-----------|
| Top (wearable) | `HRV {v}ms` | `{±dev}% vs {baseline}ms baseline` · `trend declining` / `trend improving` · `system signal ahead of felt state` |
| Bottom (self) | `Sharpness: {label} {n}/5` | ⚠️ `score trending down` / `score trending up` (driven by `scoreTrajectory7d`, NOT sharpness-specific — see §14) |
| Bottom (self) | `Clarity: {label} {n}/5` | `{n}th day low clarity` if `consecutiveLowClarity ≥ 3` |
| Bottom (self) | `Mental Energy: {Outcome}` | Only if outcome is in COGNITIVE set |

**Worked example** (matches the user's screenshot):
- Inputs: HRV = 18.1 ms (no deviation provided), Sharpness = 4/5 (Acute), Clarity = 4/5, outcome = `drained` (not in cognitive set → NEUTRAL).
- Contribs: `hrvCognitiveContrib` → `hrv<20` → mild-RED · sharpness 4 → GREEN · clarity 4 → GREEN · outcome → NEUTRAL.
- `composePillar([red(mild), green, green])` → no strong-red → median of `[red, green, green]` (upper) → GREEN.
- **Result**: Cognitive pill renders **STEADY · green**. Sharpness qualifier "score trending down" is fired by `scoreTrajectory7d='declining'`, NOT by sharpness itself — this is the misleading qualifier reported by the user.

---

### 7.2 PHYSIOLOGY Pillar

**Inputs**: Sleep · RHR · HR-elevated proxy. **Body-only** — no self-report, no outcome.

| Input | Function | Thresholds |
|-------|----------|-----------|
| Sleep | `sleepContrib` | `dur<300m` → strong-RED · `dur<360m` → mild-RED · `score<60` → mild-RED · `dev<-15%` → mild-RED · `dev<-8%` → AMBER · `score<70` → AMBER · `dur<420m` → AMBER · else GREEN. Both null → NEUTRAL. |
| RHR | `rhrContrib` | `dev>+20%` → strong-RED · `dev>+10%` → AMBER · else GREEN. No deviation: `rhr>90` → mild-RED · `rhr>80` → AMBER · else GREEN. Null → NEUTRAL. |
| HR-elevated (proxy via RHR dev) | `hrElevatedContrib` | `dev>+25%` → mild-RED · `dev>+15%` → AMBER · else GREEN. Null → NEUTRAL. |

**Outcome routing**: **none** — Physiology never receives outcome contributions.

**Display lines**:

| Position | Line | Qualifiers |
|----------|------|-----------|
| Top | `Sleep {score} · {duration}` | `{±dev}% vs {baseline} baseline` · `trend declining` if `scoreTrajectory='declining'` |
| Top | `RHR {v}bpm` | `{±dev}% vs {baseline}bpm baseline` · `sympathetic dominance` if `dev>+15%` |
| Bottom | (none) | `'Body signals only'` empty text |

**Worked example** (user's screenshot):
- Inputs: Sleep = null (both fields), RHR = 56 bpm (no deviation provided), HR-proxy = null.
- Contribs: sleep → NEUTRAL (both fields null) · `rhrContrib`: rhr<80 → GREEN · `hrElevatedContrib`: NEUTRAL.
- `composePillar([neutral, green, neutral])` → median of `[green]` → GREEN.
- **Result**: Physiology pill renders **RESTED · green**, asserting full physiological recovery from RHR alone. ⚠️ Known issue (§14): when sleep is missing, the "RESTED" assertion overclaims.

---

### 7.3 RESILIENCE Pillar

**Inputs**: HRV (secondary, stricter thresholds) · Confidence · resilience outcome.

| Input | Function | Thresholds |
|-------|----------|-----------|
| HRV (Resilience) | `hrvResilienceContrib` | `dev ≤ -25 %` → strong-RED · `dev < -20 %` → mild-RED · `dev < -15 %` → AMBER · else GREEN. No deviation: `hrv<18` → mild-RED · `hrv<35` → AMBER · else GREEN. Null → NEUTRAL. |
| Confidence | `confidenceContrib` | `1` → strong-RED · `2` → mild-RED · `3` → AMBER · else GREEN. Null → NEUTRAL. |
| Resilience outcome | `resilienceOutcomeContrib` | `overwhelmed` → strong-RED · `drained` → mild-RED · `anxious`/`frustrated` → AMBER · `steady`/`calm`/`energised`/`thriving` → GREEN. |

**Outcome routing**: `RESILIENCE_OUTCOMES = {overwhelmed, drained, steady, anxious, frustrated, calm, energised}` (+ `thriving` accepted as green).

**No wearable-authority override on Resilience.**

**Display lines**:

| Position | Line | Qualifiers |
|----------|------|-----------|
| Top | `HRV {v}ms` | `{±dev}% vs {baseline}ms baseline · buffer signal` (or just `autonomic buffer` if no deviation) |
| Bottom | `Confidence: {label} {n}/5` | `{n}th day low confidence` if `consecutiveLowConfidence ≥ 3` |
| Bottom | `Mental Energy: {Outcome}` | Only if outcome is in RESILIENCE set |

**Worked example** (user's screenshot — the contradiction):
- Inputs: HRV = 18.1 ms (no deviation provided), Confidence = 4/5, outcome = `drained`.
- Contribs: `hrvResilienceContrib`: `hrv<35` → AMBER · `confidenceContrib`: 4 → GREEN · `resilienceOutcomeContrib`: `drained` → mild-RED.
- `composePillar([amber, green, red(mild)])` → no strong-red → median of `[green, amber, red]` → upper-median = AMBER.
- **Expected**: Resilience renders **STRAINED · amber**.
- **Observed in user's screenshot**: rendered as **STEADY · green**. This indicates either a stale cached snapshot (pre-drained check-in) OR `hrvDeviation` was non-null and green for that user, dropping HRV's contribution to GREEN and pulling the median up. Either way, this is the **`drained=mild`** severity issue called out in §14: a felt `drained` self-report should never compose to green.

---

### 7.4 Outcome Routing Table (full)

| `daily_checkins.outcome` | Cognitive | Physiology | Resilience |
|--------------------------|-----------|-----------|-----------|
| `scattered` | mild-RED | — | — |
| `focused` | GREEN | — | — |
| `thriving` | GREEN | — | GREEN |
| `overwhelmed` | — | — | **strong-RED** |
| `drained` | — | — | mild-RED |
| `anxious` | — | — | AMBER |
| `frustrated` | — | — | AMBER |
| `steady` | — | — | GREEN |
| `calm` | — | — | GREEN |
| `energised` | — | — | GREEN |

Each outcome contributes to **exactly one** pillar (except `thriving`, which lifts both Cognitive and Resilience).

---

## 8. Lean On / Watch For v6

### 8.1 Priority Cascade

```
P-1: Wearable Sustained Deficit Override  (ENABLE_WEARABLE_RECOVERY_TRIGGER=true)
     → Fires on 2+ consecutive days HRV < -20% below baseline
P0a: Sunday evening (after 9pm) → getSundayEveningInsights — tier × tomorrow-load matrix
P0b: Late evening weekdays/Saturday (after 9pm) → getEveningInsights — recovery-focused
P1a: Coach insights ≤ 3 days old ("recent")  → "{coachStrength}" / "{coachGrowth}"
P1b: Coach insights 4-7 days old ("grace")   → with age label, suppressed if C×C contradicts
P2:  C×C Modifier (clarity × confidence) → 8 patterns, time-aware (see §8.2)
P3:  Partial coach + archetype/tier fill
P4:  Archetype × Tier matrix → 5 archetypes × 4 tiers = 20 combinations
P5:  Tier fallback → generic tier-based leanOn/watchFor
```

### 8.2 C×C Modifier Patterns (8 patterns)

| Pattern | Lean On | Watch For (Day) | Watch For (Evening) |
|---------|---------|-----------------|---------------------|
| Both low (C≤2, Co≤2) | Your self-honesty | Premature commitments | Forcing resolution tonight |
| **Both high (C≥4, Co≥4)** | **Your alignment** | **Rigidity from conviction** | **Over-optimising what worked** |
| High clarity + low confidence | Your clarity | Delaying action | Replaying doubt |
| Low clarity + high confidence | Your confidence | Moving without direction | Forcing clarity tonight |
| Low clarity only | Your discernment | Acting without anchor | Grinding open questions |
| Low confidence only | Your self-awareness | Projected confidence | Reviewing through doubt |
| High clarity only | Your direction | Crowding out perspectives | Replaying what held |
| High confidence only | Your conviction | Closing off inputs | Running past the close |

> ⚠️ The screenshot pair "Full Alignment · PATTERN" / "Rigidity from Conviction · PATTERN" comes from the **Both high** row — this is the deterministic C×C modifier, not a real coach or pattern observation.

### 8.3 Archetype × Tier Matrix

| Archetype | Depleted | Managing | Strong | Peak |
|-----------|----------|----------|--------|------|
| **grounded-leader** | Stillness instinct / Absorbing others' energy | Rootedness / Quiet drain | Natural stability / Maintenance mode | Grounded precision / Tunnel focus |
| **resilient-performer** | Recovery wisdom / Performing resilience | Baseline reliability / Settling for operational | Performance window / Burning it early | Competitive edge / Spending peak too fast |
| **clear-thinker** | Economy of thought / Over-processing | Analytical clarity / Over-investing cognitively | Sharpest insights / Analysis past insight | Analytical precision / Complexity for own sake |
| **intensity-driver** | Rest-as-fuel wisdom / Forcing intensity on empty | Directed drive / Impatience with pace | Sustainable intensity / Outpacing the day | Full-force capability / Opening at full intensity |
| **adaptive-navigator** | Situational awareness / Adapting to others' demands | Flexibility / Staying adaptive vs holding firm | Strategic read / Over-navigating | Strategic agility / Complexity over decisiveness |

### 8.4 Source Tag Rules

**LLM output** allows ONLY: `ARCHETYPE` · `COACH` · `PATTERN`. `DATA` and `CHECK-IN` are rejected by `validateV61Output`.

**Deterministic fallback** maps internal sources via `formatFallbackSignal()` (lines 3835–3859):

| Internal source | Display label |
|-----------------|---------------|
| `archetype-tier` | ARCHETYPE |
| `tier-fallback` | PATTERN |
| `cc-modifier` / `cc-modifier-with-context` | PATTERN |
| `coach-insights-recent` / `coach-insights-grace` | (passed through with age label) |
| `sunday-evening-override` | Sunday |
| `evening-recovery-override` | Evening |

Source priority for label selection: Wearable → Coach → Check-in → Calendar → Archetype → Goals.

### 8.5 Forbidden Generic Traits (LLM)

`Self-Honesty · Self-Awareness · Self-Discernment · Discernment · Alignment · Conviction Strength · Execution Confidence · Clear Direction`

**Allowed only** when `source = COACH` AND a coach insight ≤7 d explicitly named the trait. Otherwise rejected with reason `leanOn_generic_trait` / `watchFor_generic_trait`.

### 8.6 Coach Insight Age Tiers

| Tier | Days Old | Behaviour |
|------|----------|-----------|
| `recent` | 0–3 | Full authority, no age label |
| `grace` | 4–7 | Used with age label; suppressed if C×C contradicts |
| `contextual` | 8–14 | Used as context only alongside C×C |
| `historical` | 15–30 | Not used directly |
| `archived` | 31+ | Not used |

**C×C contradiction suppression** (grace tier only): coach mentions "clarity/clear/direction/focus" AND clarity ≤ 2 → suppress · coach mentions "confidence/conviction/certainty/trust in" AND confidence ≤ 2 → suppress.

### 8.7 Daytime Suffixes

After core leanOn/watchFor, situational suffixes append (lines: `buildDaytimeLeanOnSuffix`, `buildDaytimeWatchForSuffix`).

**Lean On**: morning + body strained + high-stakes → "A demanding day ahead is meeting that instinct…" · afternoon + strained → "The morning tested that capacity – the afternoon will too." · evening + remaining + strained → "The day isn't done…"

**Watch For**: morning + strained + high-stakes → "Spending your advantage before the day's biggest moments." · morning + poor sleep → "Opening at full intensity when your recovery was incomplete." · evening + remaining + strained → "Pushing through the remaining meetings when your body is already signalling the cost."

---

## 9. Phrase Logic v6

### 9.1 Source Priority

```
1. Snapshot cache hit (same input_signature today) → cached phrase
2. LLM Tier 1: Gemini 2.5 Flash, 4s timeout (via Lovable AI Gateway)
3. LLM Tier 2: Claude Sonnet, 6s timeout (direct Anthropic)
4. Deterministic getTheme() — tier × time × calendar matrix
```

### 9.2 Hard Rules

- **Length**: target 2–3 words. Soft-reject at 4 words (retry once with strict instruction). **Hard-reject at 6+** (`phrase_hard_reject_Nw`).
- **No numbers** in phrase.
- **Forbidden openers**: "you", "your", "the".
- **No coaching imperatives**: "should", "need to", "try to", "consider".
- **No references** to patterns, coach, archetype.
- **No instructions** ("front-load…", "sequence…").
- **Wellness blacklist** + **tier blacklist** + **readiness blacklist** all apply.
- **Generic motivational** blocklist: awareness · prevents · regrets · future · potential · inner · strength · power · courage · deserve · believe · transform · unlock · embrace · overcome · thrive (rejected unless number or named event present).

### 9.3 Pillar Opacity Rule

The phrase + the first body sentence, read together, MUST contain ≥1 explicit pillar word from `{Cognition, Cognitive, Mind, Sharpness, Physiology, Body, Sleep, Hardware, Resilience, Composure, Buffer, Mental Energy}`. Standalone metaphors like "Body is loaded.", "Body ahead.", "Body louder." are forbidden as phrases unless the body's first sentence anchors them to a named pillar.

### 9.4 Deterministic Template Matrix (`getTheme()`)

4 tiers × 3 times × 8 calendar combinations. Sample cells:

| Tier | Time | Calendar | Phrase |
|------|------|----------|--------|
| depleted | morning | high pressure + high load | "One thing at a time." |
| depleted | evening | remaining meetings | "Protect what's left." |
| **managing** | **afternoon** | **—** | **"Sustain the pace."** |
| strong | morning | high-stakes | "Protect the window." |
| peak | morning | — | "Protect the peak." |
| peak | evening | Sunday + heavy Monday | "Protect it for Monday." |

> ⚠️ The screenshot phrase "Sustain the pace." originates from this `managing × afternoon` cell. When deterministic fires (LLM rejected by validators), this is a stock template — not a Chief-of-Staff synthesis.

### 9.5 Special Overrides

- **"Strength without clarity"**: tier = strong/peak but clarity OR confidence ≤ 2 → forces phrase = "Strength without clarity."
- **Pattern override**: 3+ consecutive days same outcome → prepends pattern context
- **Same-day state shift**: ≥15 energy_balance drop/rise between today's check-ins → prepends shift context

### 9.6 Day-Type Branches (overrides §9.4)

Sunday evening → forward into Monday · Friday/pre-rest evening → closure · Monday morning → week-setting · weekend day → no work framing · holiday → permission framing.

---

## 10. Body Copy Logic v6

### 10.1 Source Priority

```
1. Snapshot cache hit → cached body_text
2. LLM-generated `body` (must pass §2.19.5 + §2.19 + §2.20 + 25+ validators)
3. Deterministic context from getTheme() + buildContextSuffix() + outcome signals
```

### 10.2 The 3-Part Impact Mandate (recap)

Every body MUST connect:
1. **SIGNAL EVIDENCE** — a number or a named event
2. **PILLAR CATEGORIZATION** — Cognition / Physiology / Resilience triangulated with calendar
3. **THE STAKE** — a Leadership Variable from the Elastic Lexicon (§2.20)

### 10.3 Five Assessment Rules (recap from §6.6)

| Rule | One-line summary |
|------|-------------------|
| 1 | Never restate the score |
| 2 | Pills own numbers; body owns synthesis |
| 3 | Triangulate Inner Signal × Outer Demand × Directional Move |
| 4 | Pick the few numbers that matter (0–2 typical) |
| 5 | Directional tone, not descriptive |

### 10.4 Why Current Body Copy Sometimes Sounds Prose-y

The body in the screenshot ("A multi-day depletion pattern signals an accumulating recovery deficit, not a single bad night. Your system may need more than the day's margins can provide.") is **deterministic** — it comes from `outcomeSignals.drained` (line 1728), a hardcoded template fired when 3+ consecutive `drained` check-ins are detected. The LLM was either rejected by a validator OR the cached snapshot was generated under deterministic fallback.

Common LLM rejection codes (see §11 telemetry):

| Validator code | Trigger | Frequency in screenshot day |
|----------------|---------|------------------------------|
| `body_no_lexicon_cluster` | Body lacks Cognition/Physiology/Resilience cluster word | High |
| `body_metric_list_N` | ≥2 metrics in close proximity | Medium |
| `body_restates_score_*` | Score appears as "X/100" or "score of X" | Low |
| `body_pattern_irrelevant` | Pattern keyword used without today-signal + today-context anchor | Medium |
| `leanOn_repeats_body` / `watchFor_repeats_body` | Signal substring (≥6 chars) appears in body | **Highest — forces fallback** |
| `leanOn_generic_trait` / `watchFor_generic_trait` | Generic trait used without `source=COACH` | High |
| `phrase_hard_reject_Nw` | Phrase ≥6 words | Medium |
| `phrase_generic_motivational` | Generic motivational word without number/event | Medium |
| `phrase_forbidden_opener` / `phrase_coaching_imperative` | Starts with you/your/the OR contains should/need to | Medium |

When **any** of these fires and both LLM tiers are exhausted, `briefSource` flips to `deterministic` and the snapshot caches the deterministic output — making it sticky for the rest of the time window.

### 10.5 Worked Example (recap)

❌ **Bad** (data-led, restates score, lists metrics):
> "HRV is 20 % below baseline and RHR is 18 % below baseline, with a score of 31/100. With 4 consecutive depleted days, hardware recovery is the necessary focus."

✅ **Good** (assessment-led, triangulated, no score, one calendar reference, one directional move):
> "Body is recovered but Mind is carrying the strain — and the calendar adds three high-stakes touchpoints before lunch. The day's edge is sequencing: handle the Board prep while attention is fresh, then let easier blocks ride on physiology. One real recovery window before evening is what protects tomorrow."

---

## 11. LLM Resilience & Snapshot Cache

### 11.1 Two-Tier LLM Strategy

```ts
const llmAttempts = [
  { model: 'google/gemini-2.5-flash', timeoutMs: 4000, useGateway: true  }, // Lovable AI Gateway
  { model: CLAUDE_MODELS.SONNET,       timeoutMs: 6000, useGateway: false }, // Direct Anthropic
];
```

Worst case: ~10 s. On any failure, validation rejection, or both-attempt timeout, `llmFallbackReason` is set (e.g. `attempt1_validation_body_no_lexicon_cluster`) and the deterministic path runs.

### 11.2 Snapshot Cache (`brief_snapshots`)

**Key**: `(user_id, local_date, time_window, input_signature, prompt_version)`.

**`input_signature`** is a deterministic hash over: tier, score (rounded), calendarLoad, calendarPressure, meetingCount, hrvDeviation, sleepDeviation, rhrDeviation, checkInOutcome, clarity, confidence, sharpness, isHoliday, isSundayEve, isMondayAm, isFridayEve. Two requests with the same signature in the same time window return the **same** brief.

**Cache hit path**: returns immediately with `briefSource = snapshot.brief_source`, no LLM call.

**Cache miss path**: runs full pipeline → upserts the result fire-and-forget so the next refresh hits cache.

### 11.3 Telemetry Fields (in `payload_json` / response)

| Field | Type | Meaning |
|-------|------|---------|
| `briefSource` | `'llm' \| 'deterministic'` | Which path produced this brief |
| `llmFallbackReason` | string | e.g. `attempt2_timeout_6000ms`, `attempt1_validation_body_pattern_irrelevant`, `null` if LLM succeeded |
| `llmAttempts[]` | array | (planned) per-attempt model + duration + outcome |
| `validatorRejections{}` | object | (planned) per-rule rejection counter |
| `signals{}` | object | full signal snapshot at generation time |

### 11.4 Response-Assembly Try/Catch

The block from `briefSource = ...` through the final `return new Response(...)` is wrapped in a try/catch. On any unexpected error during assembly, the function returns a soft 200 with `briefSource: 'deterministic'`, `fallback: true`, and the deterministic phrase/body/leanOn/watchFor — preventing a 500 from blanking the entire dashboard.

### 11.5 Server-Side Truncation Safety Net

LLM `signal` strings > 4 words are server-truncated (`truncSignal`, line 3877) before being formatted as `{signal} · {SOURCE}`.

---

## 12. Source Labels

| Source Key (`leanOnSource` / `watchForSource`) | Display Label |
|-----------------------------------------------|---------------|
| `llm-v4` | (no label — LLM-generated, source baked into signal as PATTERN/ARCHETYPE/COACH) |
| `coach-insights-recent` | "Coach" |
| `coach-insights-grace` | "Coach (Xd ago)" |
| `cc-modifier` / `cc-modifier-with-context` | "Check-in" (deterministic) → mapped to `PATTERN` in display |
| `archetype-tier` | "Archetype" → `ARCHETYPE` |
| `tier-fallback` | "Readiness" → `PATTERN` |
| `sunday-evening-override` | "Sunday" |
| `evening-recovery-override` | "Evening" |

---

## 13. DB Column Audit

### 13.1 `wearable_data` Mapping

| Edge Function Uses | Actual DB Column | Status |
|-------------------|-----------------|--------|
| `hrv` | `hrv` | ✅ |
| `resting_heart_rate` | `resting_heart_rate` | ✅ |
| `sleep_score` | `sleep_score` | ✅ |
| `total_sleep_minutes` | `total_sleep_minutes` | ✅ |
| `source` | `source` | ✅ Fixed (was `data_source`) |
| 7-day HRV trend `hrv` | `hrv` | ✅ Fixed (was `hrv_rmssd`) |
| `summary_date` | `summary_date` | ✅ |

### 13.2 `oura_daily_data` – Missing Table

`sync-oura/index.ts:104` writes to a non-existent table. Oura ring sync is non-functional (deprioritised).

### 13.3 `calendar_events`, `daily_checkins`, `user_coach_insights`, `brief_snapshots` – Complete

All columns referenced exist and are correctly named.

---

## 14. Known Issues & Gaps

### 14.1 Pill-Scoring Issues

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | **Sharpness qualifier** reads "score trending down" / "score trending up" but is driven by `scoreTrajectory7d` (overall readiness score), NOT sharpness-specific. Misleading: a stable Sharpness 4/5 reads "trending down" when the wider score is declining for unrelated reasons. | `DecisionReadinessBrief.tsx:765` | High — user trust in pill detail |
| 2 | **Physiology pill defaults to RESTED** when sleep is null and only RHR is available. Asserts full physiological recovery from a single signal. | `DecisionReadinessBrief.tsx:722` (`composePillar([sleepContrib, rhrContrib, hrElevatedContrib])` with sleep=neutral pulls median to GREEN) | High — overclaims when data is sparse |
| 3 | **Resilience can render STEADY/green when outcome is `drained`** if HRV+confidence are GREEN. `drained` is currently `mild` severity, so the upper-median tilts green. Felt depletion gets masked by stable wearable. | `DecisionReadinessBrief.tsx:686` (`resilienceOutcomeContrib`: drained → mild-RED) | Critical — user-reported contradiction |
| 4 | No "felt-vs-wearable divergence" qualifier on Resilience: when outcome is RED but HRV+confidence compose GREEN, the pill should surface the gap. | `DecisionReadinessBrief.tsx:797–811` | Medium |

### 14.2 LLM / Synthesis Issues

| # | Issue | Impact |
|---|-------|--------|
| 5 | **LLM fallback frequency is high.** 25+ validators include the **`signal-substring-of-body` rule** (`leanOn_repeats_body`) which forces the LLM to dodge any pillar word that already appears in the body — pushing it into archetype-trait words that the next gate (`generic_trait`) rejects. Net: many strategically correct briefs are silently dropped. | Critical |
| 6 | "**Full Alignment · PATTERN**" / "**Rigidity from Conviction · PATTERN**" stock pair is the deterministic C×C `Both high (C≥4, Co≥4)` modifier (§8.2 row 2). Appears whenever clarity ≥4 AND confidence ≥4 AND no coach/pattern data ≤7 d AND LLM fell back. Looks personalised; isn't. | Medium |
| 7 | "**A multi-day depletion pattern signals an accumulating recovery deficit, not a single bad night. Your system may need more than the day's margins can provide.**" is the deterministic `outcomeSignals.drained` template (line 1728), fired on 3+ consecutive `drained` check-ins. Reads as prose because it's a static string. | Medium |
| 8 | Telemetry fields `llmAttempts[]` and `validatorRejections{}` are referenced in design but not yet persisted to `payload_json`. Currently only `llmFallbackReason` is logged. | Low — observability gap |
| 9 | LLM phrase + body compete for the same vocabulary; pillar opacity rule is enforced but synthesis quality varies when no high-stakes event is present (calendar-empty path). | Low |

### 14.3 Architecture Gaps (carried over from v4)

| Gap | Description |
|-----|-------------|
| No dedicated `heart_rate` column in `wearable_data` | `hrElevated` is derived from HRV deviation > 25 % below baseline. Initial absolute heuristic: HRV < 25 ms. |
| `oura_daily_data` table missing | Oura sync broken; deprioritised. |
| No LinkedIn / external context analysis | Listed as future signal source. |
| No conversation-derived signals from coach sessions feeding pills directly | Coach insights flow via leanOn/watchFor only. |

### 14.4 Resolved Issues

| Issue | Status |
|-------|--------|
| `data_source` column doesn't exist | ✅ Fixed → `source` |
| `hrv_rmssd` column doesn't exist | ✅ Fixed → `hrv` |
| Wearable recovery trigger OFF | ✅ Fixed — `ENABLE_WEARABLE_RECOVERY_TRIGGER = true` |
| `consecutivePattern` fallback crash | ✅ Fixed — replaced undefined var with inline `recentCheckIns` loop |
| Response-assembly 500 → blank dashboard | ✅ Fixed — try/catch returns soft 200 fallback |
| Snapshot cache duplicate writes | ✅ Fixed — onConflict `(user_id, local_date, time_window, input_signature, prompt_version)` |

---

*End of v6.1 reference. For the v5.0 doc see git history at commit prior to 2026-04-21. Pill-scoring fixes (Items 1–4) and validator-loosening (Item 5) are tracked as a separate code task — this document is reference-only.*
