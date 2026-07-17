# Mental Readiness Score (MRS) v4 — Consolidated Specification

Single source of truth. Supersedes MRS v3 §3 and §7 (replaced by §3 and §8 below). Everything else in MRS v3 is retained unless explicitly marked superseded in §14. MRS v4 continues to write `readiness_score_baseline` / `readiness_score_refined` under the v3 two-state model — that model is unchanged. What changes is what feeds the baseline, how missing data is handled, and how MRS and the Brief stay coherent.

> **Implementation status (this pass):** §0–§9, §11–§14 are implemented. **§10 (Brief–MRS coherence contract) is spec-only** — MRS writes the new ground-truth fields (`readiness_tier` via existing `tier_displayed`, `mrs_window`, `morning_baseline_score`, `INTRADAY_DECLINE` flag, `weight_provenance`) but the Brief's prompt-side consumption of those fields and the `recoveryNote` signature change are tracked separately and not shipped here.

---

## 0. Design principle — MRS is a proactive, moment-specific signal

MRS is not a daily summary and not the Brief. Its job is to answer one question, continuously, whether or not the user opens the app: "how ready is this person right now, given everything currently known about them?"

### 0.1 Mental readiness, not physical readiness — why this isn't "an Oura score"

The name is literal: MRS measures **Mental Readiness** — the person's current capacity for clear thinking, emotional regulation, and sound decision-making — not their physical recovery state. This distinction has to stay visible in every part of the spec, because the single biggest risk to MRS's identity is that it quietly collapses into a wearable-recovery score with a different label.

A wearable's own readiness/recovery score (Oura, Whoop, Garmin, etc.) answers "is my body recovered enough to train today?" — built from sleep, HRV, RHR, and prior strain, with no awareness of what today actually demands of the person, and no input from how the person says they actually feel. MRS uses some of the same raw physiological signals, but for a different purpose and combined with different things:

- The **Physiological pillar** (§3.2) is read as a proxy for nervous-system and cognitive capacity, not for athletic recovery. HRV, sleep, and RHR-trend are included because of their established links to emotional regulation and cognitive bandwidth — they answer "how much regulatory capacity does this person have available right now," not "how recovered is their body for exercise." This is why the pillar is capped at 50% rather than being the whole score: physiology is one input to mental readiness, not a synonym for it.
- The **Demand pillar** (§3.3) has no equivalent in a wearable score at all. A wearable can't know that the person has a board call at 9am or a difficult 1:1 at 3pm. MRS exists specifically to ask "given this body state and this cognitive/emotional load, how ready is the mind for what's coming" — a question physiology alone cannot answer.
- The **Mind Check-in dimensions** (§2) — clarity, emotion, pressure, regulation — are the most direct mental-readiness signal MRS has, and uniquely so. No wearable can capture "I feel emotionally reactive today" or "I feel mentally clear despite poor sleep." When present, these self-reported dimensions refine the score by up to ±15 (§4) precisely because lived mental state can diverge from what physiology alone would predict — and when it does, the felt state is the more trustworthy signal for mental readiness specifically.

A practical test for every future change to this spec: if a change would make MRS computable from wearable data alone, with the same result regardless of today's calendar or how the person says they feel, that change is moving MRS toward a physical-readiness score and away from its name. Demand and Mind Check-in inputs are not optional enrichments on top of a "real" score — they are part of what makes this *mental* readiness rather than physical readiness.

### 0.2 Proactive and moment-specific

Three further properties follow from MRS's role as a continuous, proactive signal and are non-negotiable for v4:

- **Proactive** — `readiness_score_baseline` is computed by the 15-minute cron regardless of app usage (retained from v3 §10). This is the protect-and-prevent layer: nudges, JIT scoring, and divergence flags must be live before the user ever looks at the app.
- **Time-of-day and day-of-week sensitive** — the score for a given person must be capable of differing between Monday and Sunday, and between 7am and 7pm on the same day, **from day one of using the app**, without waiting for weeks of personalisation data. §3 below is built specifically to guarantee this.
- **Never duplicates the Brief** — MRS emits a number, a tier, and a small set of structured flags. It never emits prose. The Brief consumes MRS's output as ground truth and must reconcile its own narrative with it (§10).

---

## 1. Core architecture — two-state score (retained from v3 §1)

| State | Name | Inputs | When computed | Where shown |
|---|---|---|---|---|
| **State 1** | `readiness_score_baseline` | Window-aware Physiological + Demand + Pattern composite (§3) | Always — written by signal-assembly cron (every 15 min) and on any wearable / calendar refresh | Brief pre-population, all nudges, JIT scoring, plan generation. **UI stage label: "Early read"** (see §13.2) |
| **State 2** | `readiness_score_refined` | State 1 blended with the 4 Mind Check-in dimensions, hard-capped ±15 | Recomputed every cron cycle once any check-in exists for today (§2.1) | The number the user sees on Executive Home. **UI stage label: "Full read"** (see §13.2) |

`readiness_state ∈ {'baseline','refined'}`. Nudges always read baseline. Brief reads refined when present, else baseline.

```text
Wearable (window-aware) ┐
Calendar (window-aware) ┼─► State 1 (baseline 0–100) ─► always-on proactive layer
Patterns                ┘                                │
                                                         ▼
                                + 4 Mind dims ─► State 2 (refined, baseline ± 15)
```

---

## 2. The 4 Mind Check-in dimensions (retained from v3 §2)

UI unchanged. Slider position → integer 1–5.

| Dimension | Scale (1 → 5) | Captures | Note |
|---|---|---|---|
| **Clarity** | Clouded → Crystal | Cognitive sharpness right now | Higher = better |
| **Emotion** | Reactive → Open | Emotional regulation / residue | Higher = better |
| **Pressure** | Overloaded → Spacious | Self-declared perceived demand vs capacity | **Inverted** — 5 = best |
| **Regulation** | Reactive → In Control | Nervous-system regulation | Higher = better |

Stored as nullable integers on `daily_checkins (clarity, emotion, pressure, regulation, check_in_source)`. Upsert on `(user_id, checkin_date)`.

`sliderToScore`: `1 → 10`, `2 → 30`, `3 → 55`, `4 → 80`, `5 → 100`. `null → sub-score = baselineScore` (neutral, contributes zero).

### 2.1 Multiple check-ins per day (NEW in v4)

A user may submit the Mind Check-in more than once per day (e.g. morning / midday / evening). Each submission is keyed on `(user_id, checkin_date, time_window)` on `daily_checkins` (column already present from MRS v3 infrastructure — no schema change).

The change in v4 is on the read side: every cron cycle, if a check-in row exists for today, `readiness_score_refined` is recomputed using §3's current-window baseline blended with the most recent check-in's dimensions — not just at submission time. This means:

- A morning check-in refines the morning baseline.
- As the window changes (morning → afternoon), the baseline itself moves per §3, and the same morning check-in continues to refine the new, window-appropriate baseline — until a fresher check-in is submitted.
- A second check-in later in the day simply becomes the new "most recent" input to the same recurring blend.

`daily_context_snapshot.check_in_count_today` (int) and `last_check_in_window` ('morning'|'afternoon'|'evening') track how fresh the felt-state input is and are written by the SAVE_CHECKIN handler.

---

## 3. State 1 — window-aware baseline composition (REPLACES v3 §3.1)

### 3.1 Headline pillar weights (retained at the top level)

| Pillar | Target weight | Source |
|---|---|---|
| Physiological composite (nervous-system/cognitive-capacity proxy — §0.1) | 50% | `wearable_data` |
| Calendar demand score | 30% | `demand-scorer`, classified `calendar_events` |
| Pattern signals | 20% | `_shared/signal-engine/pattern-engine.ts` |

What's new in v4 is that each pillar's internal composition — and in two cases the underlying data it reads — changes by time-of-day window (Morning 05–12 / Afternoon 12–18 / Evening 18–05, user-local, retained from v3 §5.1). This reuses the derivation utilities already built for the Brief's window contexts (`morning-context.ts`, `afternoon-context.ts`, `evening-context.ts`) — MRS becomes a second, numeric-only consumer of the same underlying facts.

### 3.2 Physiological pillar — internal decomposition

| Sub-component | Source field | Morning weight (of 50%) | Afternoon | Evening |
|---|---|---|---|---|
| `hrvMorningDeviation` (today vs 30d baseline) | `hrvDeviationPct` (morning-context) | 25 pts (50%) | 15 pts (30%) | 8.75 pts (17.5%) |
| `sleepDeviation` (last night vs 30d baseline) | `sleepQuality` / sleep-score deviation | 17.5 pts (35%) | 10.5 pts (21%) | 6.125 pts (12.25%) |
| `rhrTrend` (3-day) | `rhrDeviationPct` | 7.5 pts (15%) | 4.5 pts (9%) | 2.625 pts (5.25%) |
| `intradayHrDeviation` (current HR vs short RHR baseline) — NEW | `currentHrVsRestingPct` (afternoon-context) | n/a | 20 pts (40%) | n/a |
| `eveningPhysioRead` (latest HRV/RHR + body-load) — NEW | `hrvEveningDeviationPct` + `bodyLoadElevated` (evening-context) | n/a | n/a | 32.5 pts (65%) |

Notes:
- Morning's three sub-components are the v3 §3.1 formula verbatim (HRV 50 / Sleep 35 / RHR 15, each independently nullable in v4 — see §8).
- Afternoon carries the morning sub-components forward at a reduced combined share (60%) and adds `intradayHrDeviation` (40%) — the first genuinely intraday physiological signal, and the main fix for "the score doesn't move during the day."
- Evening reduces the morning sub-components further (35% combined) and gives the freshest available reading — `eveningPhysioRead` — the largest single share (65%).
- `intradayHrDeviation` and `eveningPhysioRead` should be computed from a trailing average (recommend 30–60 min) of HR, not an instantaneous reading.

### 3.2a Severe sleep-deficit override

A measured, severely-deficient night caps the Physiological pillar at the Mixed-tier ceiling (max 64 contribution-equivalent) for that day's computes, regardless of how strong HRV reads — because a high HRV reading on a genuinely sleep-deprived night is not a green light, and the linear composite would otherwise let HRV mask the deficit. This bites hardest in the morning window and carries through the day until the next night's sleep data supersedes it.

**Trigger — measured deficit only:** the override fires only when sleep was actually measured and the measurement is in the bottom band, i.e. `sleepDeviation` is available per §8.2 AND (`sleep_total_minutes < 300` OR `sleepQuality === 'poor'`). It is a measured-low signal, never an inferred-from-absence one.

**Critical guard — absence is not deficit.** If `sleepDeviation` is unavailable per §8.2 — older wearable that does not track sleep (e.g. older Apple Watch), ring/watch removed overnight, device died, sync gap — the override does not fire under any circumstances. Missing sleep data is handled solely by §8.3 redistribution (its weight flows to Demand); it must never be coerced to 0, to a low `sleepQuality`, or to any value that could satisfy the deficit trigger. "Not measured" and "measured and severely low" are distinct states, and only the latter caps the pillar. Implementations must confirm that a null/absent sleep input reaches §8.3 and cannot reach the §3.2a trigger.

**Consequence for the no-sleep user:** an account whose wearable never reports sleep simply never experiences this override. Their physiological pillar is composed from HRV / RHR-trend / intraday-HR with sleep's weight redistributed (§8.3), and their score moves normally on those signals.

**`weight_provenance` (§11):** when §3.2a fires, record `sleep_deficit_override: true` alongside the measured `sleep_total_minutes` / `sleepQuality` that triggered it, so a capped score is always traceable to a real reading rather than an absence.

### 3.3 Demand pillar — internal decomposition

| Sub-component | Source field | Morning (of 30%) | Afternoon | Evening |
|---|---|---|---|---|
| `todayFullDayDemand` | `today_classified_events` (whole day) | 30 pts (100%) | n/a | n/a |
| `remainingDayDemand` — NEW | `meetingsRemaining`, `backToBackRemainingHours`, `highestRemainingStakes` (afternoon-context, "now forward") | n/a | 21 pts (70%) | n/a |
| `realizedSoFarCost` — NEW | `meetingsCompleted`, `highestCompletedCategory` (afternoon-context) | n/a | 9 pts (30%) | n/a |
| `todayRealizedDemand` — NEW | `todayCompletedCount`, `todayHadHighStakes`, `todayHadConflict` (evening-context) | n/a | n/a | 18 pts (60%) |
| `tomorrowOpeningDemand` — NEW | `tomorrowMeetingCount`, `tomorrowFirstHighStakes`, `tomorrowIsHeavy` (evening-context) | n/a | n/a | 12 pts (40%) |

### 3.4 Pattern pillar — context only

| Sub-component | Source | Morning (of 20%) | Afternoon/Evening |
|---|---|---|---|
| `patternEngineComposite` | `pattern-engine.ts` (retained for Brief/Plan/JIT context) | 0 MRS pts | 0 MRS pts |
| `yesterdayCarryover` | `yesterdayLoadScore` / `yesterdayHadHighStakes` / `yesterdayHadConflict` (morning-context) | 0 MRS pts | n/a |

Pattern components are no longer score-bearing for MRS. They may be retained in provenance and downstream framing, but cannot unlock a baseline and never carry final MRS weight.

### 3.5 Worked example — fully calibrated user, afternoon window

```text
Physiological (50): hrvMorningDeviation 15 + sleepDeviation 10.5 + rhrTrend 4.5 + intradayHrDeviation 20 = 50
Demand (30):        remainingDayDemand 21 + realizedSoFarCost 9 = 30
Pattern (20):       patternEngineComposite 20

baseline = Σ(sub_score_i × weight_i) / 100   →  0–100
```

This matches v3's 50/30/20 at the headline level — v4 changes what feeds each pillar by window, not the top-line split, when everything is available. §8 covers what happens when it isn't.

---

## 4. State 2 — refined contribution (retained from v3 §3.2–3.3)

Unchanged. Total check-in weight in the refined blend = 30%, distributed:

| Dimension | Base weight | Conditional bump |
|---|---|---|
| Clarity | 11% | −3% → 8% when `has_imminent_high_stakes=true` (donated to Regulation) |
| Emotion | 9% | — |
| Pressure | 5% | — |
| Regulation | 5% | +3% → 8% when `has_imminent_high_stakes=true` |

```text
weightedCheckIn = Σ ( sub_score_i × weight_i ) / 0.30
blended        = baseline × 0.70 + weightedCheckIn × 0.30
refined        = clamp( round(blended), baseline − 15, baseline + 15 )
contribution   = refined − baseline
```

`baseline` here is the current-window §3 baseline — see §2.1 for how this interacts with multiple check-ins.

---

## 5. Input signals — canonical inventory (extends v3 §4)

### 5.1 Baseline inputs (State 1)

- **Wearable** (`wearable_data`): `hrv_today`, `hrv_baseline_30d`, `sleep_total_minutes`, `sleep_score`, `resting_heart_rate`, `rhr_baseline_3d` (NEW — computed in code from existing rows, not stored), `rhr_trend_3d`, `hr_current` / `hr_avg_afternoon` (NEW — intraday).
- **Calendar** (`calendar_events` classified A–H): `today_classified_events`, `today_first_high_stakes`, `back_to_back_hours`, `event_metadata`, plus window-dependent: remaining-day equivalents (afternoon), realized/tomorrow equivalents (evening).
- **Patterns** (`pattern-engine.ts → pattern_signals jsonb`): unchanged from v3, plus `yesterday_load_score` / `yesterday_had_high_stakes` / `yesterday_had_conflict` (NEW — morning-only carryover, §3.4).
- **CEO behaviour `fired_rules`**: unchanged from v3.

### 5.2 Refinement inputs (State 2)

Unchanged from v3: `daily_checkins.{clarity, emotion, pressure, regulation}`, `has_imminent_high_stakes`.

---

## 6. Divergence flags (extends v3 §5)

Single value written to `daily_context_snapshot.supply_demand_gap_flag`. Priority order (first match wins). v4 inserts one new flag.

| # | Flag | Trigger | Effect |
|---|---|---|---|
| 1 | `REGULATION_RISK` | `regulation_score ≤ 2` AND any cat A/B/C/D event today | Resilience pill: force min AMBER. Brief Watch For appends regulation-first suffix (A). Plan: regulation-first sequencing. |
| 2 | `INTRADAY_DECLINE` — NEW | Current-window baseline ≤ `morning_baseline_score − 10` AND at least one of (`decisionLeakageRisk`, `bodyLoadElevated`, `intradayHrDeviation ≥ 15`) | Nudges: elevated priority for a regulation practice. Brief: must acknowledge the shift (deferred to §10 implementation). |
| 3 | `SUPPLY_DEMAND_GAP` | (`calendar_demand ≥ 65` AND `phys_composite ≤ 50`) OR (`pressure_score ≤ 2` combined with calendar high OR physio low) | Highest brief-lead priority among the remaining flags. Cognitive pill caps at AMBER if composed GREEN. Brief body gains suffix (C). |
| 4 | `EMOTION_RESIDUE` | `emotion_score ≤ 2` and not already flagged above | Resilience pill: strong-RED contribution. Brief Watch For suffix (B). `decisionLeakageGuard` fires more readily. |
| 5 | `RECOVERY_UNDERWAY` | `phys_composite ≥ 55` AND `hrv_recovering` AND `demand ≥ 60` | Brief framing: recovery in progress under load. |
| 6 | `LIGHT_DAY_STRONG_STATE` | `phys_composite ≥ 65` AND `demand ≤ 35` | Brief: deploy on highest-leverage work. |
| 7 | `ALIGNED` | All four dims ≥ 3 AND `|phys − demand| ≤ 25` | Brief: aligned-state framing. |
| — | `MASKED_HIGH` | Legacy — read-only back-compat. Never written by v4. | — |

`INTRADAY_DECLINE` is the concrete realisation of the "protect and prevent" mandate from §0: it is the flag that says "something changed today that this morning's read didn't anticipate, and it's worth surfacing now, proactively, before the user asks."

---

## 7. Score tiers (retained from v3 §6, unchanged)

| Score | Tier | Label | Pill colour family |
|---|---|---|---|
| 80–100 | Peak | Peak Readiness | Green |
| 65–79 | Strong | Strong Readiness | Green-amber |
| 50–64 | Mixed | Mixed Readiness | Amber |
| 35–49 | Compromised | Compromised Readiness | Amber-red |
| 0–34 | Depleted | Depleted | Red |

Tier mapping applies to both baseline and refined. Tier label updates if the refined score crosses a boundary. Brief copy phrasing is gated on tier, never on raw score.

---

## 8. Cold-start & missing data (REPLACES v3 §7 entirely)

### 8.1 The principle: weight follows data availability, per sub-component, every cycle

v3's cold-start model classified the whole account into stages (`<7 days`, `7–13 days`, `≥14 days`) and redistributed whole pillars. This produced the flat-50 failure mode: when several pillars independently fell back to a neutral midpoint, their weighted average was that same midpoint — constant across every day and every hour, defeating §0's core requirement.

v4 instead evaluates **each sub-component from §3.2–3.4 independently, every cron cycle**, against a simple data-availability test (§8.2). Every sub-component either contributes its target weight (data available) or its weight is reassigned (data unavailable). **There are no neutral-50 substitutions anywhere in this pipeline.**

### 8.2 Data-availability requirements per sub-component

| Sub-component | Pillar | Requirement |
|---|---|---|
| `todayFullDayDemand` / `remainingDayDemand` / `realizedSoFarCost` / `todayRealizedDemand` / `tomorrowOpeningDemand` | Demand | Calendar connected (any amount of history) |
| `hrvMorningDeviation` | Physiological | ≥14 days HRV history (usable from 14d, refines toward 30d) |
| `sleepDeviation` | Physiological | ≥14 days sleep-score history |
| `rhrTrend` | Physiological | ≥3 days RHR history |
| `intradayHrDeviation` | Physiological (PM) | Continuous HR stream today + `rhr_baseline_3d` (≥3 days RHR) |
| `eveningPhysioRead` | Physiological (Eve) | Latest HRV/RHR reading today + same baseline reqs as `intradayHrDeviation` |
| `patternEngineComposite` | Pattern context | Context/provenance only; not score-bearing for MRS |
| `yesterdayCarryover` | Pattern context (AM) | Context/provenance only; not score-bearing for MRS |

### 8.3 Redistribution rule

1. Sum the target weight (out of 100) of every non-pattern sub-component in the current window's formula whose requirement (§8.2) is currently met → `earnedWeight`. Pattern components are context only and never earn MRS weight.
2. `unearnedWeight = 100 − earnedWeight`.
3. Reassign `unearnedWeight` to the **Demand pillar's sub-components** for the current window, distributed proportionally to their own target shares (§3.3). Demand's sub-components have no data requirements beyond "calendar connected" and are therefore the always-available reservoir.
4. If Demand itself has zero available sub-components (no calendar connected at all), `unearnedWeight` redistributes pro-rata to whichever immediate physiological sub-components ARE available.
5. If no immediate wearable or calendar signals are available (even if pattern context exists) → `awaitingSignals = true`, v3 §8.3 row 1 applies verbatim (`-- NOT YET ASSESSED`).
6. Compute `baseline = Σ(sub_score_i × final_weight_i) / 100`.

This rule is re-evaluated from scratch every cron cycle — it is not a one-time account-age classification.

### 8.4 Worked examples

**Day 1, new account.** Calendar connected, wearable connected but zero history. Morning window. Available: `todayFullDayDemand` (30). Everything else unavailable. `earnedWeight = 30`, `unearnedWeight = 70` flows entirely to `todayFullDayDemand` → final weight 100. **Day-1 score is 100% driven by today's calendar load — which varies by day of week and time of day from the very first day.** Directly satisfies §0.2.

**Day 4.** `rhrTrend` now available (≥3d RHR), and `yesterdayCarryover` may exist as context. `hrvMorningDeviation`, `sleepDeviation`, and pattern components are not score-bearing. `earnedWeight = 30 + 7.5 = 37.5`. `unearnedWeight = 62.5` flows to `todayFullDayDemand` → final weight 92.5.

**Day 30, afternoon, fully calibrated.** All immediate physiological and demand sub-components available. Pattern weight remains non-scoring and redistributes to demand; final score remains based on immediate wearable/calendar data only.

**Wearable dies at 2pm.** Morning sub-components (computed this morning from last night's data) remain valid → available. `intradayHrDeviation` unavailable → its 20pts flow to Demand's `remainingDayDemand` / `realizedSoFarCost` pro-rata (70:30) → +14 and +6. Score keeps moving, leans more on calendar — does not freeze, does not drop to neutral.

**Wearable never reports sleep.** `sleepDeviation` permanently unavailable. Each cycle its target weight flows to Demand. Steady, predictable redistribution — not a one-time classification.

---

## 9. Signal Pills v4 (extends v3 §8)

The pill inputs and thresholds in v3 §8 are retained. v4 adds:

- **Physical Reserves (Physiology) pill** may additionally reflect `intradayHrDeviation` (afternoon) or `eveningPhysioRead` (evening) when those sub-components are available (§8.2) — giving the pill the same "fresher read as the day goes on" property as the score itself.
- **Resilience Capacity pill**: `INTRADAY_DECLINE` (§6) forces minimum AMBER, in addition to the existing `REGULATION_RISK` rule.

§8.2 (coherence guard) and §8.3 (awaiting-signal copy matrix) are retained from v3 unchanged.

---

## 10. Brief–MRS coherence contract — SPEC-ONLY (deferred)

> **Status:** documented as the target end-state for the Brief layer. **Not implemented in this MRS v4 pass.** MRS writes all the ground-truth fields below (§11), but the Brief's prompt-side reading of them, the `recoveryNote` signature change, and the `prompt_version` bump are tracked as a separate follow-up plan so this pass stays scoped to the MRS pipeline.

### 10.1 The boundary

MRS and the Brief read overlapping raw facts (the window-context builders) but produce different things: MRS produces a number, a tier, and structured flags; the Brief produces prose. Neither should re-derive the other's output from scratch.

### 10.2 What MRS writes for the Brief to read

At the end of each cron cycle, `daily_context_snapshot` carries (extending v3 §9):

- `readiness_score_baseline`, `readiness_score_refined`, `readiness_state` (retained from v3)
- `tier_displayed` (serves as `readiness_tier` per §7 — already present from v3, reused)
- `mrs_window` ('morning'|'afternoon'|'evening') — which formula produced this score
- `morning_baseline_score` (written once per day at the first morning compute) — reference for `INTRADAY_DECLINE`
- `supply_demand_gap_flag` (extended per §6, including `INTRADAY_DECLINE`)
- `check_in_count_today`, `last_check_in_window` (§2.1)
- `weight_provenance` jsonb — per-cycle audit of which sub-components were earned vs redistributed

### 10.3 What the Brief must do with it (deferred)

The Brief's prompt-assembly step should read the above before generating prose. The prompt should include an explicit "treat as ground truth; if facts suggest a different overall feel than the tier or active flags indicate, acknowledge that divergence directly in one sentence rather than presenting two inconsistent pictures; never restate the score" instruction. Prompt bump → `v6.4-mrs-v4-coherence` invalidates cached briefs. **Not shipped in this pass.**

### 10.4 Concrete fix: `recoveryNote` (deferred)

`evening-context.ts` `deriveRecoveryNote` should change from `(todayLevel, tomorrowPressureHeavy)` to `(readinessTier, tomorrowIsHeavy)`. **Not shipped in this pass.**

### 10.5 INTRADAY_DECLINE specifically (deferred)

When active, the Brief must acknowledge the shift. **Not shipped in this pass** — but the flag itself is emitted by MRS and persisted.

---

## 11. Persistence schema (extends v3 §9)

| Column | Type | Purpose |
|---|---|---|
| `readiness_score_baseline` | int | State 1, always written (retained) |
| `readiness_score_refined` | int null | State 2, recomputed every cycle once any check-in exists today (§2.1) |
| `readiness_state` | text default 'baseline' | retained |
| `refined_contribution` | int null | retained |
| `tier_displayed` | text | retained — serves as `readiness_tier` per §10.2 |
| `supply_demand_gap_flag` | text null | extended per §6 |
| `mrs_window` | text (morning\|afternoon\|evening) | NEW — which §3 formula produced this score |
| `morning_baseline_score` | int null | NEW — written once per day, reference for `INTRADAY_DECLINE` |
| `check_in_count_today` | int default 0 | NEW (§2.1) |
| `last_check_in_window` | text null | NEW (§2.1) |
| `weight_provenance` | jsonb null | NEW — per-cycle record of which §8 sub-components were earned vs redistributed, for debugging/audit (not surfaced to users) |

`rhr_baseline_3d`: NOT a stored column — computed on the fly in `build-daily-context.ts` from the trailing 3 days of `wearable_data.resting_heart_rate`. Avoids schema churn and backfill.

`weight_provenance` is the direct mitigation for the "audit why the score is flat" problem encountered with v3 — every cycle records which sub-components contributed their target weight vs. which were redistributed, making the flat-50 failure mode trivially diagnosable if it ever recurs. When §3.2a fires, it also records `sleep_deficit_override: true` plus the triggering measurements.

---

## 12. Compute lifecycle (extends v3 §10)

```text
cron 15-min ─► compute-inner-readiness (v4-only; mrsWindow + mrsSubScores required)
                ├─ resolve current window from user-local time
                ├─ build window-context inputs (reuse morning/afternoon/evening-context.ts)
                ├─ for each §3 sub-component: evaluate §8.2 availability
                ├─ apply §8.3 redistribution → final weights
                ├─ apply §3.2a sleep-deficit cap (guarded by available=true)
                ├─ compute readiness_score_baseline (§3) + tier (§7, written as tier_displayed)
                ├─ evaluate §6 divergence flags (incl. INTRADAY_DECLINE vs morning_baseline_score)
                ├─ if morning window and morning_baseline_score not yet set today: set it
                ├─ if any daily_checkins row exists for today:
                │     recompute readiness_score_refined (§4) against current baseline
                │     update readiness_state='refined', refined_contribution
                ├─ write weight_provenance
                └─ upsert daily_context_snapshot with all §11 columns

mind check-in submit ─► daily-checkins/SAVE_CHECKIN
                ├─ insert daily_checkins row keyed on (user_id, date, time_window)
                ├─ update daily_context_snapshot: check_in_count_today++, last_check_in_window=window
                └─ subsequent cron cycle picks up the refinement automatically
```

---

## 13. What is retained verbatim from v3

- §1 two-state architecture (baseline/refined), the formula in §4 of this doc.
- §2 the 4 Mind Check-in dimensions, slider mapping, storage.
- §3.1/§3.2 demand-scorer 0–100 banding and A–H classifier (now also read window-appropriately per §3.3, but the classifier itself is unchanged).
- §3.4/§3.5 pattern-engine internals as `patternEngineComposite` — pattern-engine's own cold-start rules now determine that sub-component's §8.2 availability, rather than separately redistributing a whole pillar.
- §5 divergence flags 1, 3–7 and `MASKED_HIGH` (read-only).
- §6 score tiers.
- §8 Signal Pills v3 base inputs/thresholds, coherence guard, awaiting-signal copy matrix.
- §9 persistence columns not listed as new in §11 above.
- §11 CEO behaviour rules (SignalMatrix extension).
- §5.1 day-kind detector, time windows, `isAppleSleepSource` correction.

---

## 14. What is superseded by v4

- v3 §3.1's single fixed Physiological/Demand/Pattern composition → replaced by §3's window-dependent decomposition (same headline 50/30/20, different internals by window).
- v3 §3 weighting-mode formula branches (`aligned`, `no_wearable`, `supply_demand_gap`, `recovery_window`, `wearable_early`) → **removed from State 1 math**. `weightingMode` may still be written as a diagnostic label, but `readiness_score_baseline` is produced only by the v4 sub-component composer and §8.3 redistribution. There is no v3 fallback path left in the implementation; any missing v4 inputs should fail closed rather than silently switching formulas.
- v3 §7 (whole-account, whole-pillar cold-start stages) → replaced entirely by §8's per-sub-component, per-cycle availability and redistribution model. No neutral-50 substitution remains anywhere in State 1.
- v3 §7.2 check-in cold start → superseded by §2.1's continuous-recompute model.
- (Deferred) `evening-context.ts` `deriveRecoveryNote` signature change per §10.4.
- (Deferred) `prompt_version` → v6.4 per §10.3.
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
- `< 7 days` of wearable data → pill label `"establishing baseline"`; unavailable physiological weight redistributes to immediate demand when calendar demand is available. Pattern context does not receive or contribute MRS weight.
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

---

## 13. MRS v4 — Human-sounding tier copy (one-liners)

The numeric score (0–100) is never displayed on its own. Every surface that
renders the MRS (Brief header, Home hero, MRS detail page) shows a
score-keyed one-liner instead of the legacy tier word ("Strong", "Peak",
"Low"). Internal tier ids remain lowercase strings for logic, logging, and
prompt seeding — only the **display** copy changes.

**Source of truth:** `src/utils/readinessLabels.ts` → `READINESS_ONE_LINERS`.
The brief validator also imports `READINESS_ONE_LINER_STRINGS` to reject any
LLM restatement of these exact phrases in the brief body.

### 13.1 Band table

| Band id    | Score range | Valence | One-liner (verbatim)                                          |
| ---------- | ----------- | ------- | ------------------------------------------------------------- |
| `full`     | 80–100      | high    | full strength — go after it                                   |
| `ready`    | 65–79       | high    | ready and clear                                               |
| `holding`  | 50–64       | mid     | holding the line — solid, not your peak                       |
| `reserves` | 35–49       | low     | running on reserves — pick your battles                       |
| `empty`    | 0–34        | low     | running on empty — today's about protecting yourself          |

Rules:
- Score is clamped to `[0,100]` and rounded before lookup.
- Ranges are inclusive on both ends; no gaps, no overlaps.
- Copy strings are immutable. Any edit requires a `BRIEF_PROMPT_VERSION` bump
  so cached briefs invalidate.
- Three-bucket valence (`low` / `mid` / `high`) is the only thing Brief/Plan
  may branch on for tone — they must not switch on the band id directly.

### 13.2 Stage label (Full read / Early read / Awaiting signals)

Rendered as the small caption next to the score. Driven by
`getReadinessStateLabel(state, stageOneSignalAvailable)`:

**State → label mapping (canonical):**
- **State 1** (`readiness_score_baseline`, `readiness_state='baseline'`) → **"Early read"** when a Stage 1 signal (wearable or calendar) is present; otherwise **"Awaiting signals"**.
- **State 2** (`readiness_score_refined`, `readiness_state='refined'`) → **"Full read"** when a Stage 1 signal is present; otherwise **"Awaiting signals"** (refined-without-stage-1 is a degenerate state and downgrades).
- `readiness_state='awaiting'` → always **"Awaiting signals"**.

Note: the label is **"Full read"** (not "Final read") — verbatim string owned by `src/utils/readinessLabels.ts`. Any change requires a `BRIEF_PROMPT_VERSION` bump.

| `state`    | Stage-1 signal? | Label              | Subtitle                                                                                  |
| ---------- | --------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| `refined`  | yes             | Full read          | with your check-in                                                                        |
| `refined`  | no              | Awaiting signals   | sync your wearable, calendar to get an early read and check in to sharpen it              |
| `baseline` | yes             | Early read         | check in to sharpen it                                                                    |
| `baseline` | no              | Awaiting signals   | sync your wearable, calendar to get an early read and check in to sharpen it              |
| `awaiting` | —               | Awaiting signals   | sync your wearable, calendar to get an early read and check in to sharpen it              |

`stageOneSignalAvailable` must come from the backend's explicit
`hasCurrentPeriodSignal` field — never inferred client-side. The label MUST
NOT say "Early read" for true cold-start states.
