## Signal Pills v3 — revised (sleep→Cognitive, sleep_efficiency→Resilience, patterns as qualifiers only)

### Locked decisions from this round

1. **Sleep belongs in Cognitive, not Physiology.** For sedentary executives, sleep deprivation hits cognition (decision quality, working memory, emotional regulation) far more than physical capacity. A CEO can be physically rested in bed yet cognitively impaired by fragmented sleep. → Move `sleep_duration` + `sleep_score` into Cognitive.
2. **Physiology stays wearable-only (RHR, HR-elevated proxy)** — pure cardiovascular/autonomic read, no sleep.
3. **Resilience must have a wearable anchor** so the pill never sits empty pre-check-in (best practice: every pill renders from State 1). → `sleep_efficiency_today` (overnight restoration quality) is the chosen anchor. It is *physiologically distinct* from sleep duration/score: efficiency = how well the time-in-bed was actually used by the nervous system to restore — a direct read on "capacity to absorb today's load."
4. **Patterns are never pill tier drivers.** They surface as bracketed qualifiers next to today's numbers, on **both wearable signals and check-in signals**. The pill word/colour only moves when today's numbers move.
5. **Pressure is in Resilience.** Confirmed.
6. **Pill words unchanged this round.** 1–2 word labels remain mandatory.
7. **No double-counting with the Calendar Load pill.** `consecutive_high_load_days` and any calendar pattern stays in the Calendar Load pill — Cognitive and Resilience do not re-consume it.

---

### 1. Inputs per pill (v3 final)

| Pill | Moment wearable / calendar inputs | Check-in dim (State 2) | Pattern qualifiers (display only) |
|---|---|---|---|
| **Cognitive** | `hrv_today` vs `hrv_baseline_30d`, `sleep_duration_today`, `sleep_score_today`, today's `cognitive_fragmentation_score` | `clarity` (1→strong-RED … 5→GREEN; null→NEUTRAL). GREEN→AMBER cap when `SUPPLY_DEMAND_GAP` active today. | HRV 3d trend, sleep delta vs 7d personal mean, clarity-trend-3d from Mind Readiness card |
| **Physiology** | `rhr_today` vs baseline, `hr_today` vs baseline (HR-elevated proxy) | None — by design | RHR 3d trend (±% vs 3d avg), HR delta |
| **Resilience** | `sleep_efficiency_today` (overnight restoration quality) | `pressure`, `emotion`, `regulation` (all 1–5) | sleep_efficiency 7d delta, regulation-trend-3d, emotion-trend-3d, pressure-typical-for-DOW |

**Removed from current code:**
- Cognitive: drop `consecutive_high_load_days` (lives in Calendar Load pill).
- Physiology: drop sleep inputs (moved to Cognitive); drop `sustained_deficit_flag` as a tier driver (becomes qualifier).
- Resilience: drop `consecutive_high_load_days`, `hrv_low_high_demand_cooccurrence_7d`, `dow_typical_load`, `protection_goals_under_pressure`, legacy `confidence`/`outcome`.

**State 1 vs State 2 — pill renders in both states; check-in only sharpens.**

```text
                  State 1 (no check-in)                        State 2 (check-in)
Cognitive    HRV + sleep_duration + sleep_score +        + clarityContrib
             today's fragmentation                       + SUPPLY_DEMAND_GAP cap
Physiology   RHR + HR proxy                              unchanged
Resilience   sleep_efficiency_today                      + pressure + emotion + regulation
                                                         + REGULATION_RISK floor
```

Remove `if (!checkInOutcome) return null` in `buildExecutivePills`. Add muted `Baseline` / `Refined` badge beside the section header (reuses MRS badge token).

---

### 2. Resilience composition weights (moment-only)

```text
sleep_efficiency  30%   pressure 20%   emotion 25%   regulation 25%
veto: REGULATION_RISK today → floor at AMBER
```

`sleep_efficiency_today` tiering:

```text
≥ 90  → GREEN contrib
80–89 → NEUTRAL
70–79 → AMBER
< 70  → RED
null  → NEUTRAL  (pill still renders from any other inputs)
```

If both `sleep_efficiency` is null *and* no check-in exists, Resilience renders as **NEUTRAL** with the State badge `Baseline` and qualifier copy "Awaiting last night's restoration read" — never empty.

---

### 3. Pattern qualifiers — wearable AND check-in

Bracketed text next to each contributor signal inside the pill tooltip (and the front line where space allows). **Never affects tier.**

| Source | Qualifier examples |
|---|---|
| Wearable | `HR 72 (+3% vs 3d avg)` · `HRV 42 (3d ↘)` · `Sleep 6h12 (−45m vs 7d)` · `Sleep eff 78% (−6 vs 7d)` |
| Calendar | `Fragmentation 0.7 (today's shape)` — already today-only |
| **Check-in** *(new)* | `Clarity 2/5 (low for your Mondays)` · `Regulation 3/5 (↘ 3 days)` · `Emotion 4/5 (↑ since check-in resumed)` · `Pressure 2/5 (typical for week 4 of month)` |

Source of check-in qualifiers: the same store the Insights **Mind Readiness card** already reads — `daily_checkins` aggregated by DOW / 7d window. We expose a thin server helper `getCheckinPatternQualifiers(userId, window)` returning `{ clarityTrend3d, regulationTrend3d, emotionTrend3d, pressureTypicalForDow }`. No new tables; reuses the existing aggregation logic.

---

### 4. MRS ↔ Pills coherence assertion

Same payload feeds both, so contradictions should be impossible — but we add a deterministic guard with observability:

```text
score_tier 'Depleted' → ≥1 pill RED        else warn
score_tier 'Peak'     → 0 pills RED        else warn
score_tier 'Strong'   → ≤1 AMBER, 0 RED    else warn
```

Warnings emit to edge-function logs; never block UI.

---

### 5. Files to touch

- `supabase/functions/compute-outer-readiness/index.ts` — pill build block:
  - move sleep inputs from Physiology → Cognitive
  - add `sleep_efficiency_today` derivation + Resilience contrib
  - read 4 Mind dims; wire clarity → Cognitive, emotion+regulation+pressure → Resilience
  - apply `SUPPLY_DEMAND_GAP` Cognitive cap, `REGULATION_RISK` Resilience floor
  - emit qualifier metadata in `contributors`: `hrv_3d_trend`, `rhr_3d_trend`, `hr_delta_pct`, `sleep_delta_7d`, `sleep_eff_delta_7d`, `clarity_trend_3d`, `regulation_trend_3d`, `emotion_trend_3d`, `pressure_typical_dow`
  - append `readinessState: 'baseline' | 'refined'` per pill
  - run `assertCoherence(scoreTier, [cognitive, physical, resilience])`
- `supabase/functions/_shared/signal-engine/checkin-pattern-qualifiers.ts` (new) — DOW + 3d aggregations over `daily_checkins`, mirroring the Insights Mind Readiness card source.
- `src/components/home/DecisionReadinessBrief.tsx` — `buildExecutivePills`:
  - remove `if (!checkInOutcome) return null`
  - swap legacy confidence/outcome contribs for clarity/emotion/regulation/pressure
  - move sleep contrib from Physical → Cognitive
  - add sleep_efficiency contrib in Resilience
  - render bracketed qualifiers on the existing pill line + tooltip
  - add `Baseline` / `Refined` badge next to section header
- `src/components/home/PillTooltip.tsx` (new) — HoverCard: name, tier word, State badge, top-3 contributor rows in `Signal · Value · (qualifier)` format, footer source icons (Wearable / Calendar / Check-in), "Refines after Mind check-in" line when baseline.
- `docs/MRS_V3_SPECIFICATION.md` — append §8 amendment: pills are moment-only; sleep lives in Cognitive; sleep_efficiency anchors Resilience; check-in patterns surface as qualifiers via Mind Readiness store.
- Memory update: `mem://ui/performance-readiness/signal-pill-system` (moment-only contract, sleep→Cognitive, sleep_efficiency→Resilience, pattern-as-qualifier rule, coherence assertion).

### 6. Explicitly NOT changed

- Pill labels (Decision Readiness / Physical Reserves / Resilience Capacity), tier words, colours, shape, order, animation.
- Calendar Load pill (separate, untouched).
- Brief LLM prompt and body copy (patterns continue to feed Brief perspective).
- `smart-nudges` (baseline-only, already correct).
- Insights Mind Readiness card (we only *read* its aggregation source, no UI changes).

### 7. Tests

- `pills_v3_test.ts`: cold-start renders 3 pills with State 1 inputs only; sleep deficit moves Cognitive (not Physiology); RHR spike moves Physiology (not Cognitive); sleep_efficiency low + null check-in → Resilience AMBER, not empty; Pressure 1 + check-in present → Resilience RED with hidden-load qualifier (word unchanged); REGULATION_RISK floor; SUPPLY_DEMAND_GAP Cognitive cap; coherence assertion fires only when tiers diverge from MRS.
- Snapshot: same day before vs after check-in — pill identity stable, tier may sharpen, wearable qualifiers unchanged, check-in qualifiers populate.
