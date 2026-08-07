---
name: Resilience Capacity Hierarchy
description: Resilience pill contributor hierarchy — sleep efficiency, HR fallback, graded sustained deficit, check-in overlays; Protected Goals and HRV x High-Demand retired
type: feature
---
Resilience Capacity pill contributor order:
1. Primary: sleep efficiency.
2. Fallback: HR elevated proxy (only when sleep efficiency is absent and the wearable is fresh).
3. Persistent strain: sustained deficit, read as a graded severity. Missing data returns `unknown` and must never block the pill from forming.
4. Overlays: check-in dimensions (emotion, regulation x pressure).

Retired contributors — do not re-add: Protected Goals (planning context, not recovery capacity) and HRV x High-Demand co-occurrence (duplicates the HRV strain read).

Graded read: `computeSustainedDeficitSeverity` in `_shared/signal-engine/pattern-engine.ts`. Last 3 HRV samples within a trailing 5 days, minimum 2 samples, compared against a 14-day baseline. Mean deviation <= -15% = red, <= -7% = amber, else green.

The legacy boolean `sustained_deficit_flag` is unchanged and remains the input for MRS scoring, plan and nudges. There is only one HRV strain detector; do not create a second.
