---
name: MRS v4 Scoring Architecture
description: Dual-pillar gate (wearable + calendar), intra-pillar redistribution, zero-demand credit 0.6, morning demand split 20/10, 30-day date-bounded wearable baselines
type: feature
---
# MRS v4

- MRS forms only when BOTH pillars are available: physiological (wearable) AND demand (calendar). Pattern is additive context and never gates or absorbs weight.
- Calendar states: `not_connected` (missing → no MRS), `connected_no_events` (EARNED zero demand), `active`.
- Zero demand is earned data, not missing. `ZERO_DEMAND_CREDIT = 0.6` (score 60) — modelled: 75% manufactured Peak scores, 50% too weak.
- Redistribution is strictly intra-pillar: unearned physio weight stays in physio, demand in demand. Final baseline renormalized over earned weight.
- Morning demand split `MORNING_DEMAND_SPLIT = { today: 20, yesterday: 10 }`; `yesterdayCarryover` lives in the DEMAND pillar (not pattern).
- Wearable baselines are a true 30-DAY date-bounded window everywhere (`build-executive-home-cards`, `generate-mastery-plan`). Never `limit(30)` rows — row limits diverge from the signal-pill baseline for sparse syncers.
