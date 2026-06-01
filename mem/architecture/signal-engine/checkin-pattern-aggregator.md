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
- `getPillQualifiers(checkinsLast14d, wearableLast14d, baselines)` returns `{ clarity, emotion, pressure, regulation, hrv, sleep, rhr }` with `delta3d / vsDow / peakStreak` (Mind dims) or `delta3d / vsBaselinePct` (wearable). Pressure is inverted (positive band = `value ≤ 2`).
- `assertPillCoherence(mrsTier, pills)` is dev-only: escalates a pill to RED when MRS is Depleted but no pill is RED; downgrades RED → AMBER when MRS is Optimal. Auto-correct applies in all envs; warning is logged only when `APP_ENV !== 'production'`.

Tier-driving rule: qualifiers are **display-only**. Tier is determined by today's value alone — brackets only add perspective.

If Insights and pill brackets ever disagree on a streak/DoW number, the bug is in this file, not in callers.