---
name: Wearable Database Schema Standard
description: Canonical columns on public.wearable_data including the persisted sleep_efficiency column powering pattern mining.
type: architecture
---

Table: `public.wearable_data` (one row per `user_id` × `summary_date`).

Stored numeric columns (canonical source for all downstream readiness / pattern / pill logic):

- `hrv` (numeric)
- `resting_heart_rate` (int)
- `heart_rate` (int)
- `sleep_score` (int 0–100)
- `total_sleep_minutes` (int) — sleep duration
- `deep_sleep_minutes`, `rem_sleep_minutes` (int)
- `sleep_efficiency` (smallint 0–100) — persisted as of migration `20260601192859_*`. Written by `persist-wearable-data` and `sync-oura` via the shared helper `_shared/wearable/derive-sleep-efficiency.ts` (priority: explicit field → `raw_data.efficiency` → `total_sleep_duration / time_in_bed`). Consumers MUST read the stored column; in-line derivation in `compute-outer-readiness` is a legacy fallback only.
- `steps`, `active_calories` (int)

`raw_data` (jsonb) holds the provider payload for audit; never the runtime source for the columns above.

Pattern mining: `_shared/signal-engine/checkin-pattern-aggregator.ts → buildWearableDailySeries` reads `hrv / sleep_score / total_sleep_minutes / sleep_efficiency` and produces the per-day series that `performance-rhythm-insights` and Signal Pills v3 share — so a single statistical engine drives both surfaces.