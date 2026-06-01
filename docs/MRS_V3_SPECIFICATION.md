# Mental Readiness Score (MRS) v3 — Consolidated Specification

Single source of truth. Supersedes MRS v2 §3 only where noted; everything else in MRS v2 is retained. MRS v3 **replaces the legacy `inner_score`** wherever surfaced — the field name `inner_score` may persist for back-compat, but its value is now the MRS v3 baseline.

---

## 1. Core architecture — two-state score

| State | Name | Inputs | When computed | Where shown |
|---|---|---|---|---|
| **State 1** | `readiness_score_baseline` | Wearable + Calendar demand + Patterns + CEO behaviour rules | Always — written by signal-assembly cron (every 15 min) and on any wearable / calendar refresh | Brief pre-population, all nudges, JIT scoring, plan generation |
| **State 2** | `readiness_score_refined` | State 1 blended with the 4 Mind Check-in dimensions, hard-capped ±15 | Only when user submits the Mind Check-in | The number the user sees on Executive Home after check-in |

`readiness_state ∈ {'baseline','refined'}`. Nudges always read baseline. Brief reads refined when present, else baseline.

```text
Wearable ┐
Calendar ┼─► State 1 (baseline 0–100) ─► always-on proactive layer
Patterns ┘                                │
                                          ▼
                          + 4 Mind dims ─► State 2 (refined, baseline ± 15)
```

---

## 2. The 4 Mind Check-in dimensions

UI is unchanged. Slider position → integer 1–5.

| Dimension | Scale (1 → 5) | Captures | Note |
|---|---|---|---|
| **Clarity** | Clouded → Crystal | Cognitive sharpness right now | Higher = better |
| **Emotion** | Reactive → Open | Emotional regulation / residue | Higher = better |
| **Pressure** | Overloaded → Spacious | Self-declared perceived demand vs capacity | **Inverted** — 5 = best |
| **Regulation** | Reactive → In Control | Nervous-system regulation | Higher = better |

Stored as nullable integers on `daily_checkins (clarity, emotion, pressure, regulation, check_in_source)`. Upsert on `(user_id, checkin_date)`; latest wins.

### Slider → sub-score mapping

`sliderToScore`: `1 → 10`, `2 → 30`, `3 → 55`, `4 → 80`, `5 → 100`.
Pressure uses the same numeric mapping because the inversion is already baked into the slider semantics (Overloaded=1 → 10, Spacious=5 → 100).
`null → sub-score = baselineScore` (i.e. neutral, contributes zero).

---

## 3. Weighting

### 3.1 State 1 — baseline (retained from MRS v2 §3.1–3.4)

Unchanged from MRS v2. Summary:

| Pillar | Weight | Source |
|---|---|---|
| Physiological composite (HRV 50% / Sleep 35% / RHR-trend 15%) | 50% | `wearable_data` via `computePhysiologicalComposite()` |
| Calendar demand score (0–100, from `demand-scorer`) | 30% | `calendar_events` classified |
| Pattern signals (HRV 7-day trend + sustained_deficit + consecutive-load) | 20% | `_shared/signal-engine/pattern-engine.ts` |

Cold-start adjustments retained (see §7).

### 3.2 State 2 — refined contribution (NEW in v3)

Total check-in weight in the refined blend = **30%**. Distribution:

| Dimension | Base weight | Conditional bump |
|---|---|---|
| Clarity | 11% | −3% → 8% when `has_imminent_high_stakes=true` (donated to Regulation) |
| Emotion | 9% | — |
| Pressure | 5% | — (lowest weight: context-dependent, volatile) |
| Regulation | 5% | +3% → 8% when `has_imminent_high_stakes=true` |
| **Sum** | **30%** | always 30% |

`has_imminent_high_stakes` = a JIT category A or B event within the next 6 hours.

### 3.3 Refined-score formula

```text
weightedCheckIn = Σ ( sub_score_i × weight_i ) / 0.30
blended        = baseline × 0.70 + weightedCheckIn × 0.30
refined        = clamp( round(blended), baseline − 15, baseline + 15 )
contribution   = refined − baseline      // signed, range −15..+15
```

When all four dims are null → `{ score: baseline, state: 'baseline', contribution: 0 }`.

The ±15 hard cap is non-negotiable: subjective state can sharpen but never overpower physiology + demand.

---

## 4. Input signals (canonical inventory)

### 4.1 Baseline inputs (State 1)

- **Wearable** (`wearable_data`): `hrv_today`, `hrv_baseline_30d`, `sleep_total_minutes`, `sleep_score`, `resting_heart_rate`, `rhr_trend_3d`.
- **Calendar** (`calendar_events` classified A–H): `today_meeting_count`, `today_classified_events`, `today_first_high_stakes`, `back_to_back_hours`, `event_metadata`.
- **Patterns** (`_shared/signal-engine/pattern-engine.ts` → `pattern_signals` jsonb): `hrv_3day_trend`, `hrv_7day_trend`, `consecutive_high_load_days`, `sustained_deficit_flag`, `dow_historical_pattern`, `hrv_low_high_demand_cooccurrence_7d`.
- **CEO behaviour fired_rules** (`_shared/ceo-behaviour/*`): `vetoRisk`, `decisionLeakageGuard`, `boardLevelOutcome`, `advancePrep24h`, `supply_demand_gap`.

### 4.2 Refinement inputs (State 2)

- `daily_checkins.{clarity, emotion, pressure, regulation}` integers 1–5 or null.
- `has_imminent_high_stakes` derived live from `jit_event_context`.

### 4.3 SignalMatrix extension (CEO behaviour rules)

Add four new fields to the existing `SignalMatrix` type:
`clarity_score | emotion_score | pressure_score | regulation_score` (int 1–5 or null).
Rules updated (no new rules created):

| Rule | New trigger added |
|---|---|
| `vetoRisk` | OR `regulation_score ≤ 2 AND cat A/B/C event today` (regardless of HRV) |
| `decisionLeakageGuard` | OR `emotion_score ≤ 2` (regardless of HR proxy) |
| `supply_demand_gap` | OR `pressure_score ≤ 2` (regardless of physio/calendar) |
| `boardLevelOutcome`, `advancePrep24h` | When firing AND `regulation_score ≤ 2` → expose `regulation_first=true` for plan sequencing |

---

## 5. Divergence flags (v3 — replaces MRS v2 §3.3 table)

Single value written to `daily_context_snapshot.supply_demand_gap_flag`. Priority order (first match wins):

| # | Flag | Trigger | Effect |
|---|---|---|---|
| 1 | `REGULATION_RISK` | `regulation_score ≤ 2 AND` any cat A/B/C/D event today | Resilience pill: force min AMBER. Brief Watch For appends regulation-first suffix (A). Plan: regulation-first sequencing. |
| 2 | `SUPPLY_DEMAND_GAP` | (`calendar_demand ≥ 65 AND phys_composite ≤ 50`) OR `pressure_score ≤ 2` (the latter only when combined with calendar high OR physio low — pressure alone is not enough to flag the system) | Highest brief-lead priority. Cognitive pill caps at AMBER if composed GREEN. Brief body gains suffix (C). |
| 3 | `EMOTION_RESIDUE` | `emotion_score ≤ 2` and not already in flags above | Resilience pill: strong-RED contribution. Brief Watch For suffix (B). `decisionLeakageGuard` fires more readily. |
| 4 | `RECOVERY_UNDERWAY` | `phys_composite ≥ 55 AND hrv_recovering AND demand ≥ 60` (retained from MRS v2) | Brief framing: recovery in progress under load. |
| 5 | `LIGHT_DAY_STRONG_STATE` | `phys_composite ≥ 65 AND demand ≤ 35` (retained) | Brief: deploy on highest-leverage work. |
| 6 | `ALIGNED` | All four dims ≥ 3 AND `|phys − demand| ≤ 25` | Brief confirms alignment; Lean On suffix (D). |
| — | `MASKED_HIGH` | Legacy — retained read-only for back-compat with old `brief_snapshots` rows. Never written by v3. | — |

---

## 6. Score tiers (retained from MRS v2 §3.6)

Tier mapping applies to both `readiness_score_baseline` and `readiness_score_refined`. Tier label updates if the refined score crosses a boundary.

| Score | Tier | Label | Pill colour family |
|---|---|---|---|
| 80–100 | **Peak** | Peak Readiness | Green |
| 65–79 | **Strong** | Strong Readiness | Green-amber |
| 50–64 | **Mixed** | Mixed Readiness | Amber |
| 35–49 | **Compromised** | Compromised Readiness | Amber-red |
| 0–34 | **Depleted** | Depleted | Red |

Brief copy phrasing is gated on tier, never on raw score. Phrase Validation Standard (existing memory) continues to apply.

---

## 7. Cold-start behaviour (retained from MRS v2 §3.6 + extended for check-ins)

### 7.1 Wearable cold start
- `< 7 days` of wearable data → pill label `"establishing baseline"`; physiological composite weight reduced from 50% → 25%, redistributed pro-rata to demand (45%) and patterns (30%).
- `7–13 days` → pill label `"early reading"`; full 50/30/20 weights applied but `sustained_deficit_flag` suppressed.
- `≥ 14 days` → fully calibrated; no label.

### 7.2 Check-in cold start (NEW)
- `0 check-ins ever` → refined-score path is skipped on first submission's pattern correlation (only baseline shift applies). Brief sharpens normally.
- `1–2 check-ins` → optional `check_in_7day_trend` in pattern engine is suppressed; `check_in_calendar_correlation` (30-day tactical) requires ≥ 3 data points per category before surfacing in brief or pill contributors.
- `≥ 3 check-ins in last 14 days` → full pattern correlation active.

### 7.3 Pattern engine cold start
- `< 7 days HRV` → `hrv_7day_trend = 'unknown'`, weight rebalanced to 60% physio composite / 40% demand inside State 1.
- All pattern signals null-safe; missing signals never push tier in either direction (NEUTRAL contribution).

---

## 8. Signal Pills v3 (composePillar inputs)

Three pills compose tier deterministically with **any-worst-wins** across the contributing bands. Tier labels (e.g. `Mind Sharp / Mind Mixed / Mind Foggy / Mind Unread`) are written server-side on `signalPills[].tierLabel`; the client renders that label verbatim. When all check-in dims are null, the pill still renders off its wearable / pattern anchors.

| Pill | Inputs (all currently consumed in `compute-outer-readiness/index.ts`) | Divergence-flag effect |
|---|---|---|
| **Decision Readiness (Cognitive)** | HRV (`hrv_deviation` if available, else absolute `hrv` bands 20 / 40) + **Sleep** (`total_sleep_minutes` with 360 / 420 min bands AND `sleep_score` with 60 / 70 bands) + `clarityContrib` (1→strong-RED, 2→mild-RED, 3→AMBER, 4–5→GREEN, null→NEUTRAL). Sleep lives on the Cognitive pill — for wearable-equipped CEOs, sleep impacts the mind more than the body. | Cap GREEN → AMBER when `SUPPLY_DEMAND_GAP` is active. |
| **Physical Reserves (Physiology)** | `resting_heart_rate` (`rhr_deviation` if available, else absolute bands 80 / 90) + `heart_rate` elevated proxy (`hr_deviation` 10 / 20 thresholds, with RHR-deviation fallback 15 / 25) + `rhr_trend_3d` (rising → AMBER, declining → GREEN) + `sustained_deficit_flag` (RED). Sleep is **explicitly excluded** — it is owned by Cognitive. | None directly. |
| **Resilience Capacity** | `sleep_efficiency` anchor (≥85 GREEN / ≥70 AMBER / else RED) + `emotionContrib` (≤2 AMBER, else GREEN) + `regulationContrib` (≤2 AMBER, else GREEN) + `pressureContrib` (≥4 AMBER, else GREEN — inverted) + `sustained_deficit_flag` (RED) + `hrv_low_high_demand_cooccurrence_7d` (≥3 RED, =2 AMBER) + `protection_goals` × calendar pressure framing (AMBER, never RED). Legacy `confidence` / `outcome` / `coach_pattern_observations` / `active_pattern_count` / `recovery_debt` contributions are removed. | Force min AMBER when `REGULATION_RISK` active. |

Implementation reference: `supabase/functions/compute-outer-readiness/index.ts` §`Signal Pills v3: Cognitive / Physiology / Resilience` (around L4406–L4499). Any change to band thresholds MUST be reflected in this section to keep the spec authoritative.

### 8.1 Bracketed qualifier contract (v3)

Each pill is enriched with a `qualifiers` bundle sourced from the shared `checkin-pattern-aggregator` (`supabase/functions/_shared/signal-engine/checkin-pattern-aggregator.ts`). The same module powers Insights "Performance Patterns", so per-dim streak/DoW numbers MUST be identical across both surfaces.

| Pill | Qualifier inputs (display-only) |
|---|---|
| Decision Readiness | `hrv.{delta3d,vsBaselinePct,streakLowDays,dowLow}`, `sleep.{durationDelta7d,scoreVsBaseline,streakLowDays,dowLow}`, `clarity.{delta3d,vsDow,peakStreak}` |
| Physical Reserves | `rhr.{vsBaselinePct}` |
| Resilience Capacity | `emotion`, `regulation`, `pressure` (each `{delta3d,vsDow,peakStreak}`; pressure inverted: positive band = value ≤ 2), `sleep_efficiency.{delta7d,streakLowDays,dowLow}` |

Rendering rule: `value (qualifier)` inline. Tier is driven by today's value alone — brackets never re-tier. Display priority (Mind dims): `peakStreak ≥ 3` → `delta3d` → `vsDow`. Display priority (wearable dims): `streakLowDays ≥ 3` → `dowLow` → `delta3d` / `delta7d`.

#### 8.1.1 Wearable qualifier bands

The wearable streak/DoW fields are produced by `buildWearableDailySeries` (in the shared aggregator) and are identical to the bands used by `performance-rhythm-insights` for the Insights "Performance Patterns" top-3. A finding that fires in Insights will produce the same number in the pill bracket.

| Dim | Negative band ("bad day") |
|---|---|
| `hrv` | value ≤ baseline × 0.90 |
| `sleep_score` | ≤ 60 |
| `sleep_efficiency` | ≤ 75 |

`streakLowDays` = consecutive recent days in the negative band ending at the most recent observed date (only surfaces when ≥3). `dowLow` = true when ≥2 of the last 3 same-DoW observations were in the negative band.

### 8.2 Coherence guard (dev-only)

`assertPillCoherence(mrsTier, pills)` runs after the deterministic pill build. If `MRS = Depleted` but no pill is RED, the weakest AMBER is escalated to RED. If `MRS = Optimal` and any pill is RED, those are downgraded to AMBER. Auto-correction applies in all envs; the `coherenceWarning` string is logged + echoed to the client only when `APP_ENV !== 'production'`.

### 8.3 Awaiting-signal copy matrix

The brief is gated by a single boolean `awaitingSignals = !hasState1Input`, where

```text
hasState1Input = hasFreshWearable
              || hasCalendarSignal          // calendar.state === 'active' (events today)
              || hasCalendarConnected       // calendar connected, zero events today
              || hasTodayCheckIn            // any Mind check-in row dated today
```

When `awaitingSignals = true`, `phrase / bodyText / leanOn / watchFor / relationshipPattern` are nulled by the edge function and the client renders the awaiting block (`DecisionReadinessBrief.tsx` §4b). When `awaitingSignals = false`, the awaiting block never renders, even if some inputs are still missing — the brief explains what it has and asks for nothing.

Permutation matrix (W = wearable today, Ca = calendar active, Cc = calendar connected/zero events, K = check-in today):

| # | W | Ca | Cc | K | `awaitingSignals` | Score row | Headline (`phrase`) | Body / awaiting copy |
|---|---|---|---|---|---|---|---|---|
| 1 | 0 | 0 | 0 | 0 | **true** | `-- NOT YET ASSESSED` | _null_ | "Awaiting today's signal" + "Connect your calendar or a wearable to start your readiness brief. A 2-min check-in then refines it to your felt state." |
| 2 | 0 | 0 | 0 | 1 | false | Refined off neutral baseline 50, badge `(Refined)` | LLM brief from Mind dims only | Brief body; no awaiting block. |
| 3 | 0 | 0 | 1 | 0 | false | Baseline, badge `(Baseline)` | LLM brief framed as "light day" | Brief body; mentions calendar is connected but empty. |
| 4 | 0 | 0 | 1 | 1 | false | Refined, badge `(Refined)` | LLM brief, light-day + felt-state blend | Brief body. |
| 5 | 0 | 1 | – | 0 | false | Baseline, badge `(Baseline)` | LLM brief on calendar demand + patterns | Brief body. |
| 6 | 0 | 1 | – | 1 | false | Refined, badge `(Refined)` | LLM brief, calendar + felt-state | Brief body. |
| 7 | 1 | 0 | 0 | 0 | false | Baseline, badge `(Baseline)` | LLM brief on physiology only | Brief body; chips show wearable, no calendar pill. |
| 8 | 1 | 0 | 0 | 1 | false | Refined, badge `(Refined)` | LLM brief, physio + felt-state | Brief body. |
| 9 | 1 | 0 | 1 | 0 | false | Baseline | LLM brief, physio + light-day | Brief body. |
| 10 | 1 | 0 | 1 | 1 | false | Refined | LLM brief, physio + light-day + felt-state | Brief body. |
| 11 | 1 | 1 | – | 0 | false | Baseline | Full LLM brief (all State-1 inputs) | Brief body. |
| 12 | 1 | 1 | – | 1 | false | **Refined** | Full LLM brief, MRS v3 v6.3 prompt | Brief body. The canonical "complete" state. |

Forbidden copy (per `mem://constraints/forbidden-loading-copy`): never render "Your plan is being prepared", "Pull down to refresh", or any system-uncertainty string on the brief — only the awaiting copy in row 1 is permitted.

---

## 9. Persistence schema (`daily_context_snapshot` additions)

| Column | Type | Purpose |
|---|---|---|
| `readiness_score_baseline` | int | State 1, always written |
| `readiness_score_refined` | int null | State 2, written on check-in |
| `readiness_state` | text default `'baseline'` | `'baseline' \| 'refined'` |
| `check_in_contribution` | int null | Signed delta −15..+15 |
| `has_imminent_high_stakes` | boolean default false | Cat A/B within 6h at compute time |
| `supply_demand_gap_flag` | text null | One of the §5 flag values |
| `morning_context / afternoon_context / evening_context` | jsonb | Per-window immediate context (separate spec — phase 3) |
| `pattern_tactical_aggregates` | jsonb null | Rebuilt weekly: 30-day co-occurrence, per-category HRV impact, `consecutive_pressure_tolerance`, `check_in_calendar_correlation` |

`jit_event_context` adds `pre_event_regulation int null` as a placeholder for the future pre-moment check-in (no UI yet).

---

## 10. Compute lifecycle

```text
cron 15-min ─► compute-inner-readiness
                ├─ pattern-engine.run()
                ├─ demand-scorer.score()
                ├─ phys composite
                └─ writes readiness_score_baseline + supply_demand_gap_flag
                          (using only Mind dims if already present today)

mind check-in submit ─► daily-checkins/SAVE_CHECKIN
                ├─ insert daily_checkins row
                ├─ derive has_imminent_high_stakes
                ├─ computeRefinedScore(...)
                ├─ upsert readiness_score_refined / state / contribution
                ├─ recompose pills (deterministic, no LLM)
                └─ apply brief sharpening (deterministic, no LLM) + plan context note
```

`smart-nudges` reads **only** `readiness_score_baseline`. Any current `daily_checkins` read inside `buildNudgeContext` is removed.

---

## 11. What is retained verbatim from MRS v2

- §2 Architecture (signal-engine package layout, `_shared/signal-engine/*`).
- §3.1 Physiological composite formula and weights (HRV 50 / Sleep 35 / RHR 15).
- §3.2 Demand-scorer 0–100 banding (20/50/80) and the eight-category A–H classifier.
- §3.4 Pattern engine outputs (extended with `check_in_7day_trend` and `check_in_calendar_correlation` only when ≥3 data points).
- §3.5 Resilience-capacity signals (`hrv_low_high_demand_cooccurrence_7d`, `consecutive_high_load_days`).
- §3.6 Cold-start tier labels.
- §5.1 Day-kind detector, time-windows (Morning 05–12 / Afternoon 12–18 / Evening 18–05 user-local), `isAppleSleepSource` correction (×0.85).
- All existing CEO behaviour rules — extended, not replaced.

## 12. What is superseded by v3

- MRS v2 §3.3 four divergence flags → replaced by the §5 six-value table.
- MRS v2 "check-in inputs" (`outcome`, `sharpness`, `confidence`) → fully removed. Brief `input_signature` drops these and adds `clarity, emotion, pressure, regulation`. `prompt_version → v6.3` invalidates old cached briefs.
- Single-state score concept → replaced by two-state (baseline / refined).
- Legacy C×C copy strings — **removed**. Brief tone modifiers are now driven by (clarity, regulation, emotion) directly via the v6.3 prompt; the v2 fixed eight-string lookup is gone.
- Resilience pill legacy inputs (`confidence`, `outcome`, `coach_pattern_observations`, `active_pattern_count`, `recovery_debt`) — removed. Replaced by `sleep_efficiency` anchor + Mind overlay + retained pattern signals (`sustained_deficit_flag`, `hrv_low_high_demand_cooccurrence_7d`, `protection_goals × calendarPressure`).
- Physiology pill sleep contribution — removed. Sleep moved to Cognitive; Physiology is now RHR + HR-elevated proxy + RHR trend + sustained-deficit only.