# Signal Pills v3 — Finalised Plan (with Performance Patterns audit)

## Audit findings (now closed)

1. **`pressure_level`** exists in `daily_checkins` (screenshot + `PerformanceStreaks.tsx:63`, `InnerReadinessDial.tsx`). No migration.
2. **`sleep_efficiency`** already derived in `compute-outer-readiness/index.ts:1744-1755` from Oura `efficiency` or computed from time-in-bed; exposed on payload + `useOuterReadiness`. HealthKit path falls back to TIB-derived efficiency. No wearable schema change.
3. **Coherence** — dev-only check + silent auto-correct in prod.
4. **Mind Readiness card "Performance Patterns"** — sourced from edge function `supabase/functions/performance-rhythm-insights/index.ts` (lines 683–943). Ephemeral (not persisted), fetched on demand by `/insights/performance-rhythm`. **Critical gap**: it mines only `clarity_level` and `confidence_level` (`RhythmDimension = 'clarity' | 'confidence'`). It does **not** cover `emotion_level`, `pressure_level`, or `regulation_level` — so 2 of the 4 Mind tabs in the card today show no patterns by design.
5. **`consecutive_high_load_days`** stays in LLM brief prompt (line 3698 + 4334/4518/4546/4576) — only removed as a Cognitive pillar contributor.

---

## Strategy

Don't write a parallel "checkin-pattern-qualifiers" engine. Promote `performance-rhythm-insights`'s series-mining as the single SSOT and reuse it from a thin shared helper used by both Insights and the signal pills.

### Step 1 — Extend `performance-rhythm-insights` to all 4 Mind dims
- `RhythmDimension` → `'clarity' | 'emotion' | 'pressure' | 'regulation'` (drop `confidence` from output but keep field read for backwards-compat).
- Add 3 new `buildLevelSeries` calls and 3 `mineSeries` invocations with proper vocab:
  - Emotion: `appLabel: 'Emotion'`, positive `'steady'`, negative `'reactive'`.
  - Pressure: invert (low pressure_level = overloaded). `appLabel: 'Pressure'`, positive `'composed'`, negative `'under load'`.
  - Regulation: `appLabel: 'Regulation'`, positive `'composed'`, negative `'depleted'`.
- Result: Insights "Performance Patterns" tabs for Emotion / Pressure / Regulation start producing the same DoW-streak / peak-window / peak-cell findings as Clarity does today.

### Step 2 — Extract pure aggregation into `_shared/signal-engine/checkin-pattern-aggregator.ts`
- Move `buildLevelSeries`, `mineSeries`, `runs`, `peak-window/peak-cell` helpers out of the edge function and into the shared module.
- `performance-rhythm-insights` reimports them — zero behaviour change on Insights.
- Export a new compact API for pills:
  ```ts
  getPillQualifiers(checkinsLast14d, wearableLast14d) → {
    clarity:    { delta3d, vsDow, peakStreak },
    emotion:    {...}, pressure: {...}, regulation: {...},
    hrv:        { delta3d, vsBaselinePct },
    sleep:      { durationDelta7d, scoreVsBaseline },
    rhr:        { vsBaselinePct },
  }
  ```
- Pure: takes pre-fetched rows, returns object. No DB calls inside.

### Step 3 — Wire `compute-outer-readiness` to the helper
- After existing `signalPillsPayload` build, call `getPillQualifiers` with the already-fetched check-ins + wearable_recent samples.
- Attach `pillQualifiers` to outer-brief payload (additive, optional).

### Step 4 — Pillar reallocation in `compute-outer-readiness`
- **Cognitive**: HRV 40% + sleep duration/score 40% + clarity 20% (already started). Apply SUPPLY_DEMAND_GAP cap (GREEN→AMBER).
- **Physiology**: RHR + HR-elevated proxy only. Remove `sleepCognitiveContrib`; rebalance thresholds.
- **Resilience**: State-1 anchor = `sleepEfficiency` (≥85 GREEN / 70–84 AMBER / <70 RED). State-2 overlay = emotion + regulation + inverted pressure; force min AMBER on REGULATION_RISK (`regulation_level ≤ 2` OR `pressure_level ≤ 2`).
- **Coherence assertion** (dev-only): after pill build, if MRS = Depleted and no RED pill exists → downgrade weakest AMBER to RED; if MRS = Optimal and any RED → upgrade to AMBER. Emit `coherence_warning` only when `APP_ENV !== 'production'`.

### Step 5 — Frontend
- `useOuterReadiness.ts`: extend type with `pillQualifiers?`.
- `DecisionReadinessBrief.tsx`: render `value (qualifier)` for each pill (e.g. `HRV 48 (−6% vs 3d)`, `Clarity 4 (5-day peak)`). Tier driven by today's value only; qualifier display-only.
- Header label: small "Baseline" / "Refined" muted text based on `readinessState`.
- New `PillTooltip.tsx` (`HoverCard`): lists contributors + qualifiers + one-line "why this tier".

### Step 6 — Docs & memory
- `docs/MRS_V3_SPECIFICATION.md`: pillar inputs table, coherence rule, qualifier contract.
- `mem://ui/performance-readiness/signal-pill-system`: moment-only tier rule + bracketed qualifier note.
- New memory `mem://architecture/signal-engine/checkin-pattern-aggregator` — SSOT for Insights Performance Patterns and signal-pill qualifiers.

---

## Out of scope

- No DB migration (`pressure_level` and `sleep_efficiency` covered).
- No HealthKit ingestion change.
- No LLM brief prompt change (`consecutive_high_load_days` retained).
- No rewrite of `PerformanceStreaks` / `InnerReadinessDial` — Step 1 alone surfaces the missing dim patterns inside `PerformanceCausalityCard` / rhythm card.

---

## Acceptance

- `/insights/performance-rhythm` Performance Patterns now produces findings on **all 4** Mind tabs (Clarity / Emotion / Pressure / Regulation) when ≥3–7 obs gates pass.
- Homepage signal pills render in Baseline (no check-in) and Refined (post check-in) states; each pill shows `value (qualifier)`.
- Identical streak/DoW numbers appear in Insights and pill qualifiers (single aggregator).
- MRS tier never contradicts pill mix (dev `coherence_warning` empty on staging fixtures).
- LLM brief prompt unchanged; receives `consecutive_high_load_days`.
