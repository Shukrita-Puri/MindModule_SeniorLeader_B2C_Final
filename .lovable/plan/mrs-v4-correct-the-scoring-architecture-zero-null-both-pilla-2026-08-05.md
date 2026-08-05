# MRS v4 — Correct the scoring architecture (zero ≠ null, both pillars required)

Only material gaps are changed. Rules already correct in code (per-window signal tables, tier boundaries, anchors, refined ±15 cap, awaiting copy, calendar-state enum on the frontend) are left untouched.

## What is actually wrong today (verified in code)

1. `mrs-v4-compose.ts` redistributes unearned weight **across pillars** — the Demand cells act as the reservoir for missing Physio weight (`redistribute()`, reservoir = demand cells). On an empty-calendar/poor-physiology day this manufactures high scores.
2. Demand is **not a required pillar**. `compute-inner-readiness` gates only on `wearablePillarMet`; MRS forms from wearable alone.
3. Zero events is treated as **missing**: `build-executive-home-cards` sets `demandScore = eventCount > 0 ? … : null` and `hasCalendarSignal: eventCount > 0`. A connected-but-empty calendar is indistinguishable from no calendar.
4. Morning has no yesterday-demand input: `yesterdayCarryover` sits in the **pattern** pillar (weight 6, non-scoring) and `build-executive-home-cards` always passes `yesterdayCarryoverDemand: null`.
5. Wearable baseline in `build-executive-home-cards` uses **last 30 rows** (`.limit(30)` with no date bound), diverging from `get-wearable-context`'s 30-day window. One `.limit(30)` row-count baseline also remains in `generate-mastery-plan` (~line 4910).

## Changes

### 1. Pillar semantics in `mrs-v4-compose.ts`
- Redistribution becomes **intra-pillar only**: unearned Physio weight moves to earned Physio cells pro-rata; unearned Demand weight moves to earned Demand cells pro-rata. Pattern weight is never absorbed and never absorbs.
- Availability gate: `physioAvailable = any physio cell available`, `demandAvailable = any demand cell available`. `baseline = null` and `awaitingSignals = true` unless **both** are true. Pattern never gates.
- `score = 0, available = true` is earned everywhere — never reinterpreted as missing.
- Pillar contributions are renormalised over earned weight so the score stays 0–100 without any cross-pillar transfer.
- §3.2a sleep-deficit cap kept exactly as-is.

### 2. Zero-demand recovery credit
The pipeline is explicit and staged in code, so raw measurement and scoring credit never collapse into each other:

```text
raw calendar demand = 0  ->  cell available = true (earned)
                         ->  zero-demand recovery rule applied
                         ->  bounded positive MRS contribution
```

- `rawDemand` stays 0 in the subscore inputs and in `weightProvenance`; the credit is applied only at the scoring step, tagged `zero_demand_credit` per cell.
- `ZERO_DEMAND_CREDIT` is declared **provisional** in the weights module and is set only after the modelling run at 40 / 50 / 60 / 75% across scenarios A–G. 60% is a hypothesis, not a pre-approved value; the modelling table is reported before the constant is locked.

### 3. Calendar state as the demand gate
- `build-executive-home-cards` resolves `calendarState` from an actual connection check plus `eventCount`:
  - `not_connected` → all demand cells `available: false` → MRS null
  - `connected_no_events` → demand cells earned with raw demand `0` → recovery credit
  - `active` → existing `calendarDemandScore`
- `hasCalendarSignal` becomes `calendarState !== 'not_connected'`; `calendarState` is passed to `compute-inner-readiness` and carried into the snapshot payload the frontend already reads as `n`.
- `compute-inner-readiness` stops inferring calendar availability from event truthiness and enforces the demand-pillar requirement.

### 4. Morning demand: add yesterday's realised demand
- Move `yesterdayCarryover` from the pattern pillar to the **demand** pillar in `mrs-v4-weights.ts`. Morning Demand stays a fixed 30-point allocation and morning total stays 100 — the MRS scale does not grow (morning pattern becomes a single 20-point `patternEngineComposite` cell, matching the other windows).
- The split is a `MORNING_DEMAND_SPLIT` constant marked **provisional**. It is not locked until modelled at:
  - 25 / 5 — heavily favours today
  - 20 / 10 — moderate carryover
  - 15 / 15 — equal
  - 10 / 20 — carryover-dominant
- Each split is run through: yesterday high / today low; yesterday low / today high; both high; both zero; yesterday unavailable + today available; yesterday available + today unavailable. Acceptance: yesterday measurably shifts Morning readiness without ever outweighing today's actual scheduled demand, and the unavailable cases redistribute only within Demand.
- `build-executive-home-cards` supplies a real yesterday realised-demand value from yesterday's events instead of `null`.
- Afternoon and Evening demand structures are unchanged — no new signals.

### 5. Evening physiology hygiene
- Audit only: confirm `eveningPhysioRead` is fed HRV deviation + body-load context and does not double-count `hrvMorningDeviation`. No new 20-point intraday HR cell; the existing evening physio structure is preserved.

### 6. Wearable baseline consistency
- `build-executive-home-cards.latestWearable()` → 30-day date-bounded query (`gte summary_date, cutoff30`, `not hrv is null`), matching `get-wearable-context`.
- Same treatment for the remaining row-count baseline in `generate-mastery-plan` (~line 4910).

### 7. Frontend
- `calendarState` types already exist (`useOuterReadiness`, `energyStateEngine`, `readinessLabels`) — verify only that `connected_no_events` never renders "calendar unavailable" copy and that score/tier come straight from the server. No display-only tier veto (Change 5 explicitly not implemented).

### 8. Database
- No migration expected: `calendarState` already flows through the existing snapshot payload. If persistence turns out to be required, it is reported before being added.

## Verification
- Extend `mrs-v4-compose_test.ts` with scenarios A–G (both-pillars gate, earned zero, intra-pillar redistribution, no cross-pillar leakage) plus the zero-credit modelling table. No existing test weakened or removed.
- `tsgo` clean, full Deno + vitest suites, then deploy `build-executive-home-cards`, `compute-inner-readiness`, `generate-mastery-plan`.
- Final report covers: signal map per window, anchor confirmation (same-date/same-window for all three), calendar truth table, redistribution truth table, the 40/50/60/75 modelling results with the recommended constant, morning weight split, evening confirmation, and explicit confirmation that no tier veto was added.

## Open point
Both constants (`ZERO_DEMAND_CREDIT`, `MORNING_DEMAND_SPLIT`) ship as explicitly provisional and are decided empirically from the modelling tables, which are reported before the values are locked.