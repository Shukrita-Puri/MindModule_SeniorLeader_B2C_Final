
# Plan: JIT Mastery Plan — Six-Stage Pipeline Logic Evolution

## Status: IMPLEMENTED (All Gaps Closed)

All 9 phases have been implemented, plus 5 gap fixes from the deep audit:

1. ✅ DB Migration: `jit_cancellation_memory`, `readiness_baselines` tables + 6 new columns on `jit_event_context`
2. ✅ Noise Filter (Stage 0): NOISE_KEYWORDS + booking ref regex in `generate-jit-events` AND `generate-mastery-plan`
3. ✅ Cancellation Memory (Stage 1): Write on dismiss in `track-jit-skip`, read+penalty in `generate-jit-events`
4. ✅ Five-Signal Scoring (Stage 2): 4-dimension model (A:0-35, B:0-35, C:0-20, D:0-10) + composite readiness amplifier
5. ✅ Confidence Scoring (Stage 3) + New Gate (Stage 4): Score ≥55 AND A≥10 AND B≥8
6. ✅ Three-Bucket Classification + Calendar Inference: Recalibrate/Clarity/Renewal with dual attribution
7. ✅ Urgency Multi-Surface (Stage 5): Immediate/Tactical/Strategic horizons, 4-week window, multi-horizon deduplication
8. ✅ Insights Attribution: 70/30 bucket split with weight multipliers (completion ×1.2, reflection ×1.3, recurring ×1.5)
9. ✅ DEV_MODE Logging: Structured pipeline stage logs when ENVIRONMENT !== 'production'

## Gap Fixes (Audit Round 2)

| Gap | Fix | Status |
|-----|-----|--------|
| Gap 1: `generate-mastery-plan` used old scoring | Bridge to `jit_event_context` for pre-scored events; legacy fallback with noise filter | ✅ DONE |
| Gap 2: `performance-rhythm-insights` missing logistic exclusion | Already implemented (lines 189-216) — LOGISTIC_KEYWORDS + metadata check | ✅ DONE (was already there) |
| Gap 3: Multi-horizon deduplication incomplete | Added `jit_horizons_surfaced` check before surfacing; merges horizons on upsert | ✅ DONE |
| Gap 4: Insights attribution missing multipliers | Added completion/reflected/recurring_improvement multipliers + secondary bucket logging | ✅ DONE |
| Gap 5: Context line not enriched | `buildEnrichedContextDescription()` uses bucket, coach memory, HRV, confidence framing | ✅ DONE |

## Files Changed

| File | Change |
|---|---|
| Migration | `jit_cancellation_memory`, `readiness_baselines` tables, 6 columns on `jit_event_context` |
| `generate-jit-events/index.ts` | Complete rewrite: 6-stage pipeline + multi-horizon deduplication |
| `generate-mastery-plan/index.ts` | Bridge to `jit_event_context`, noise filter, enriched context descriptions |
| `track-jit-skip/index.ts` | Cancellation memory writes + 70/30 attribution with weight multipliers |
| `sync-calendar/index.ts` | `logistic` event type classification |
| `performance-rhythm-insights/index.ts` | Logistic event exclusion from all insight paths |
| `PerformanceRhythmCard.tsx` | Logistic exclusion mirrored in DEV_MODE |
