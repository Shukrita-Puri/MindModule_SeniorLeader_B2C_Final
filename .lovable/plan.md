
## Context (what already exists)

Apple Health is largely in place — extending, not replacing:

- Native iOS: `WearableSyncBridge` registers `HKObserverQuery` + `enableBackgroundDelivery(.hourly)` for HRV / RHR / HR / Sleep, plus `BGAppRefreshTask` (~15 min), anchored short-circuit, and an idempotent `NativeOutbox` that uploads via `X-Outbox-Item-Id`.
- JS: `useWearableSync` (30 min auto-sync), `syncRetryOrchestrator` (online / app-resume / token-refresh / 60s poll), state model already includes `connected`, `connected_but_waiting_for_data`, `sync_delayed`, `permission_revoked`, `error`.
- Backend: `wearable_data` is already source-agnostic (`source` column, unique on `user_id + summary_date`) with `hrv`, `resting_heart_rate`, `heart_rate`, `sleep_score`, `total_sleep_minutes`, `deep_sleep_minutes`, `rem_sleep_minutes`. `persist-wearable-data` enforces idempotency via `processed_outbox_items`.

Oura is **referenced but not built**: `check-connections-status` and `sync-oura` query a non-existent `oura_connections` table. No OAuth flow, no token storage, no schedule, no UI.

So the work splits into (A) Apple Health hardening, (B) building Oura on the same canonical contract, (C) shared UX + telemetry.

---

## A. Apple Health hardening

1. **Prefer half-hourly cadence where iOS allows.**
   - `WearableSyncBridge.registerBackgroundObservers`: change `frequency: .hourly` → `.immediate` for HRV / HR / Sleep (iOS coalesces to ~30 min in practice; the observer + anchored short-circuit already prevents wasted work). Keep RHR on `.hourly` (Apple only emits ~1× day).
   - `AppDelegate.scheduleBackgroundRefresh`: lower `earliestBeginDate` from 15 min to 30 min target with `max(now + 30min, lastSync + 30min)` so we don't burn budget.
   - JS `AUTO_SYNC_INTERVAL_MS`: keep 30 min foreground cadence (already half-hourly) but expose the constant via a single config.

2. **Sleep duration as a first-class metric.**
   - Schema already stores `total_sleep_minutes`; audit `WearableSyncBridge.queryCategoryDaily` for sleep and `persist-wearable-data` mapping to make sure asleep-stage minutes sum into `total_sleep_minutes` (not only stage breakdown). Add a deterministic fallback: `total_sleep_minutes = deep + rem + core` when present.
   - Surface `sleepDuration` on `DailyWearableSummary` (rename in TS for clarity, keep DB column).

3. **Never flip to `disconnected` on transient gaps.**
   - In `wearableSyncService` and `useWearableSync`, audit every code path that sets `connectionState`. Map:
     - HealthKit returns 0 samples but auth still valid → `connected_but_waiting_for_data`.
     - HK reports `healthDataUnavailable` / device locked → `sync_delayed`.
     - Only set `permission_revoked` when `getHealthKitAuthorization` returns explicit denial.
     - Only set `disconnected` when the user explicitly disconnects.
   - Same rule in `check-connections-status` derivation of `syncStatus`.

4. **Telemetry parity with the requirement list.**
   - Add the missing event names to `IntegrationEventName` union: `sync_temporary_unavailable`, `auto_recovery_success`, `manual_sync_triggered`. Emit them from `wearableSyncService.syncHealthKitToBackend` and `useWearableSync.triggerSync` (manual path).

## B. Oura Ring (build end-to-end on the canonical contract)

5. **Schema migration.**
   - Create `public.oura_connections` (user_id text, is_active bool, encrypted_access_token_id uuid, encrypted_refresh_token_id uuid, access_token_expires_at, last_sync, last_error, last_error_at, connection_status text default `'connected'`, sync_status text default `'unknown'`, created_at, updated_at).
   - GRANTs: service_role full, authenticated SELECT (no anon). RLS: user can read their row; only service role writes.
   - Reuse existing vault helpers (`store_*_token`, `get_oura_access_token`, `get_oura_refresh_token`) — they already exist and target this table.

6. **OAuth flow (edge functions).**
   - `oura-oauth-start`: builds Oura authorize URL with `OURA_CLIENT_ID`, redirect URI, state (signed nonce in cookie + DB row).
   - `oura-oauth-callback`: exchanges code → tokens, stores via vault, upserts `oura_connections` row, kicks off immediate `sync-oura` run, redirects user back to `/connected-data`.
   - Add secrets: `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, `OURA_REDIRECT_URI` via `add_secret` (will prompt the user).

7. **Rewrite `sync-oura` against the real Oura API v2 and the canonical schema.**
   - Auth: load connection by user → `get_oura_access_token`; if `expires_at` past or 401, call refresh endpoint → `store_oura_access_token` + `store_oura_refresh_token`; retry once.
   - Pull last 7 days of: `daily_readiness` (score → ignore, but lift HRV baseline), `daily_sleep` (score → `sleep_score`, contributors), `sleep` (period detail → `total_sleep_minutes`, `deep_sleep_minutes`, `rem_sleep_minutes`), `heartrate` (HR sample stream → `hr_samples`), and HRV from `sleep.hrv` (already daily) plus optional `daily_readiness.contributors.hrv_balance`.
   - Map to the exact same row shape `persist-wearable-data` writes, but write directly via service role with `source = 'oura'` and upsert on `(user_id, summary_date)`. Preserve existing Apple rows: only set columns we actually fetched (don't null out cross-source fields when both sources exist for the same day — pick most-recent by `updated_at` per column, default to Apple).
   - Update `oura_connections.last_sync`, `connection_status`, `sync_status`, `last_error`.
   - Idempotency: accept `X-Outbox-Item-Id` like the wearable function does, write to `processed_outbox_items` on success.

8. **Token refresh + permission semantics.**
   - 401 on either data or refresh endpoint → set `connection_status = 'permission_revoked'`, do NOT delete row. Recovery requires re-OAuth.
   - Network error / 5xx → keep `connection_status = 'connected'`, set `sync_status = 'sync_delayed'`, schedule retry.
   - Empty response (ring off finger) → `sync_status = 'waiting_for_data'`, never disconnect.

9. **Scheduling (hourly default, additive manual).**
   - `pg_cron` job `sync-oura-hourly` calls `sync-oura` for each active connection every hour (use a fan-out edge function `oura-sync-fanout` to avoid hard-coded user lists).
   - JS: in `useOuraSync` (new hook) trigger a foreground sync on app launch / focus, and let `syncRetryOrchestrator` drain Oura queue items on online + auth-refresh + app-resume (extend `kind` to include `'oura'`).
   - Manual "Sync now" on the Connected Data page calls `sync-oura` with `?manual=true` — labelled "Pull latest now (extra)".

## C. Shared UX, status, telemetry

10. **`check-connections-status` upgrades.**
    - Now that `oura_connections` exists, return Oura with the same `connectionStatus` / `syncStatus` / `hasHistoricalData` / `needsReconnect` shape currently returned for `appleWatch`.
    - Apply the same 24 h `sync_delayed` heuristic to Oura.

11. **UI.**
    - On `ConnectedData.tsx` and the wearable status pill: render both sources with identical states (connected / syncing / waiting for data / sync delayed / permission issue). No copy that implies "you must reconnect after a temporary lapse" — the only reconnect CTA appears for `permission_revoked`.
    - Add Oura connect button (kicks the OAuth start function) and a single "Sync now (extra)" action when at least one source is connected.

12. **Telemetry.**
    - Reuse `emitIntegrationEvent` with `provider: 'oura'`. Emit the same lifecycle events listed in A4 for Oura paths (connect_started/success/failed, sync_started/success/partial/failed, sync_stale_detected, permission_revoked_external, auto_recovery_success, manual_sync_triggered).

## Technical notes

- Canonical row: existing `wearable_data` columns are already a superset of the requested fields; no schema change beyond `oura_connections`. Add a comment doc clarifying merge rule: per-day row keyed by `(user_id, summary_date)`, last writer wins per column, `source` reflects the most recent writer; downstream consumers should treat the row as a merged daily summary, not as belonging to one device.
- All time math: keep `summary_date` in user's IANA timezone (existing rule).
- Acceptance verification: Deno tests for `sync-oura` mapping + 401-refresh path; manual TestFlight verification that pulling the watch off the wrist for >1 h transitions to `waiting_for_data` then back to `connected` once samples resume — no user action required.

## New / changed files

- migration: `oura_connections` + grants + RLS.
- new edge functions: `oura-oauth-start`, `oura-oauth-callback`, `oura-sync-fanout`; rewritten `sync-oura`.
- pg_cron schedule for `oura-sync-fanout` (via `supabase--insert`, not migration, per project rules).
- iOS: `WearableSyncBridge.swift` (background delivery cadence), `AppDelegate.swift` (BG refresh window).
- TS: `wearableSyncService.ts` (status mapping + telemetry), `useWearableSync.ts` (status mapping), new `useOuraSync.ts`, `syncRetryOrchestrator.ts` (add `'oura'` queue kind), `integrationTelemetry.ts` (event names), `ConnectedData.tsx` (Oura UI + unified pill).
- backend: `check-connections-status/index.ts` (Oura branch parity), `persist-wearable-data/index.ts` (merge rule comment, no behavioural break).

## Out of scope (explicit)

- Replacing the existing native sync architecture.
- Garmin / Whoop / Fitbit.
- Changing the wearable scoring engine or any readiness gate logic.
