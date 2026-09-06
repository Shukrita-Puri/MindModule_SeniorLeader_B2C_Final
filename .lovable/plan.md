# Make Travel State Sync actually run

## What the audit found (read-only)

There is **no generic dispatcher function**. Nothing reads `admin_cron_job_configs` and fans work out to edge functions. The table is only:

- read by `build-executive-home-cards` and `smart-nudges` as an on/off + settings switch for themselves,
- read by `admin-jobs-summary` / `admin-executive-home-audit` for the admin screen,
- written by `admin-update-cron-job-config`.

Actual scheduling lives entirely in database cron entries created by migrations. The 12 active entries are: build-executive-home-cards, build-executive-home-cards-morning, calendar-events-cleanup-nightly, cleanup-device-tokens-daily, early-morning-sync, oura-sync-every-15m, process-orphaned-sessions, refresh-calendar-tokens, register-calendar-watch-daily, rollup-learned-event-tokens, smart-nudges-every-15m, sync-calendar-scheduled.

`travel_state_sync` has a config row (enabled, hourly, `0 * * * *`, schedule_mode "dispatcher") but **no cron entry exists**, and no dispatcher exists to honour that row. So `travel-state-sync` has only ever run when `set-home-location` fires it best-effort for one user. That explains why travel state is stuck for everyone.

There are also no run-log tables for it (`admin-jobs-summary` says so in its own comment); the only history tables are the database's own `cron.job_run_details`.

## Proposed fix (smallest change that matches existing patterns)

1. Add a migration that schedules `travel-state-sync` hourly the same way the other jobs are scheduled (`net.http_post` with the shared cron secret header), named `travel-state-sync-hourly`.
2. Keep the `admin_cron_job_configs` row as the enable switch: have `travel-state-sync` read its own row on a scheduled run and exit early when `enabled` is false — the pattern `smart-nudges` already uses.
3. Leave the classifier logic untouched in this step so the first scheduled runs give honest evidence of what it produces.

Not included here (separate decisions after the first real runs): widening the calendar travel window beyond 12h/24h, backfilling the stuck `location_unknown` rows, and prompting for location permission in the app.

## Technical notes

- Migration mirrors `supabase/migrations/20260821_early_morning_sync_cron.sql`, using `public.get_cron_shared_secret()` in the header rather than an inlined key.
- Early-exit gate goes in `supabase/functions/travel-state-sync/index.ts` before the profile scan, mirroring `smart-nudges/index.ts` ~5873.
- No change to `derive.ts`; its fail-open contract stays intact.
