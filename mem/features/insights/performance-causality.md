---
name: Performance Causality Card v3
description: Tabbed heatmap (Stress Load + Burnout Risk) on Insights → Patterns; per-event-window peak HR via wearable_data.hr_samples; all formulas stay server-side
type: feature
---

The card on `/insights` → Patterns is a tabbed heatmap, not a text/lens UI.

## UI contract (PerformanceCausalityCard.tsx)
- Two tabs only: **Stress Load** (default) and **Burnout Risk**.
- Sleep Disruption and Recovery Cost are computed silently in the engine and intentionally NOT rendered yet. Will surface in a follow-up.
- **No proprietary copy in the UI.** No formulas, weights, "How burnout risk is computed", "Where leading indicators fit", or footnotes describing how the spike is computed. Only values, colors, sample sizes, confidence tiers, and one-line pre-baked banners.
- Gating prompt when `coverage.hasWearable === false && coverage.hasCalendar === false` — explicit "check-ins alone won't populate it" copy + CTAs to `/connected-data`. When only one source is missing, a partial banner appears above the active tab.
- Coral ramp for Stress Load: `#FAECE7 → #F5C4B3 → #F0997B → #D85A30 → #993C1D → #712B13 → #4A1B0C`.
- Burnout Risk dim colors: load `#D85A30`, rhr `#EF9F27`, hrv `#534AB7`, sleep `#185FA5`. Cell intensity = solid color × `0.1 + (level/5) * 0.9` opacity.

## Engine contract (cause-effect-engine, ENGINE_VERSION = 3)
Adds new payload projections without modifying `signal_summary`:
- `stressMatrix` — per-event-window peak HR delta. `peakHr` = max of `wearable_data.hr_samples` whose `t` falls inside `[event.start_time, event.end_time]`. `restingBaseline` = mean of `resting_heart_rate` over the window. Cell value = `peakHr − restingBaseline` (rounded bpm). If no samples overlap an event window, the cell is omitted (NOT a day-max proxy).
- `burnoutMatrix` — 4 dims × 5 weeks (load, rhr, hrv, sleep), each mapped to 1–5 intensity. `cardTrajectory` derived from worst dim direction. `bannerCopy` is the only sentence the UI shows.
- `sleepDisruptionMatrix` and `recoveryCostTimeline` are computed and stored, but the card does not render them yet.
- All weights, threshold tables, signal-combination rules, and Resilience-pill modifiers live in the edge function source as code + comments. Never sent to the client.

## Data dependency
- `wearable_data.hr_samples jsonb` (added in this feature) stores `[{t: ISO8601, v: bpm}, ...]`. Populated by:
  - iOS native bridge (`WearableSyncBridge.swift` → `queryQuantitySamples` helper)
  - JS Capacitor health path (`healthKitCapacitor.ts` → `hrSamplesByDay`)
- `persist-wearable-data` accepts `hr_samples` in the bulk samples payload.
- Historical days never get retroactive samples — honest by design. Cells show "no data" until the next iOS sync backfills.

## Backward compatibility
- `signal_summary` (read by `smart-nudges`) unchanged.
- Old clients that don't read `stressMatrix`/`burnoutMatrix` keep working.
- `ENGINE_VERSION` bump triggers one silent recompute per user on next card load.
