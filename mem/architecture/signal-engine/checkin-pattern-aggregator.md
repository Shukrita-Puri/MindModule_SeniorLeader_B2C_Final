---
name: Check-in Pattern Aggregator SSOT
description: Shared aggregator that powers both Insights Performance Patterns and Signal Pills v3 bracketed qualifiers — identical streak/DoW math in both surfaces.
type: architecture
---

File: `supabase/functions/_shared/signal-engine/checkin-pattern-aggregator.ts`.

Pure functions over pre-fetched rows (no DB calls). Powers:
- Insights "Performance Patterns" card (via `performance-rhythm-insights` edge function).
- Signal Pills v3 bracketed qualifiers (via `compute-outer-readiness`).

Contract:
- `getPillQualifiers(checkinsLast14d, wearableLast14d, baselines)` returns `{ clarity, emotion, pressure, regulation, hrv, sleep, sleep_efficiency, rhr }`. Mind dims expose `delta3d / vsDow / peakStreak` (pressure inverted: positive band = `value ≤ 2`). Wearable dims expose moment fields (`delta3d / vsBaselinePct` for hrv, `durationDelta7d / scoreVsBaseline` for sleep, `delta7d` for sleep_efficiency) PLUS `streakLowDays` + `dowLow` derived from `buildWearableDailySeries` — same engine that `performance-rhythm-insights` uses, so brackets and Insights bullets cite identical numbers.
- `buildWearableDailySeries(rows, dim, baselines)` and `computeWearableBaselines(rows)` are the canonical wearable rhythm primitives. Bands: HRV positive ≥ baseline / negative ≤ baseline×0.9; sleep_score 75/60; sleep_duration 420/360 min; sleep_efficiency 85/75.
- `assertPillCoherence(mrsTier, pills)` is dev-only: escalates a pill to RED when MRS is Depleted but no pill is RED; downgrades RED → AMBER when MRS is Optimal. Auto-correct applies in all envs; warning is logged only when `APP_ENV !== 'production'`.

Tier-driving rule: qualifiers are **display-only**. Tier is determined by today's value alone — brackets only add perspective.

If Insights and pill brackets ever disagree on a streak/DoW number, the bug is in this file, not in callers.