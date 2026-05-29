## Goal

Make Apple, Google, and Microsoft calendars first-class, equally supported providers on iOS, behind one consistent selection, auth, sync, and status model — without breaking the existing Apple native or Google OAuth paths.

## What we already have (good news)

- Apple Calendar native bridge (`AppleCalendarBridge.swift` + `AppleCalendarBackgroundSyncBridge.swift`) — full EventKit access, store-changed observer, outbox, push to `sync-apple-calendar`.
- Google + Microsoft OAuth in `calendar-auth` edge function with encrypted token storage in `calendar_connections`.
- `sync-calendar` pulls Google and Microsoft via API and upserts into `calendar_events` with idempotent `(user_id, external_id)`.
- `sync-calendar-scheduled` cron fans out OAuth providers.
- `ConnectedData.tsx` already renders 3 cards (Apple/Google/Microsoft) and `check-connections-status` already returns a `providers.{google,microsoft,apple}` map.
- All three OAuth secrets are present.

## What's broken or missing

1. **DB blocker**: `calendar_connections.provider` CHECK constraint only allows `'google'|'microsoft'`. The `sync-apple-calendar` upsert of an `apple` row silently fails — Apple connection state is never persisted server-side.
2. **No `source` column on `calendar_events`** — downstream features can't tell where an event came from.
3. **Microsoft token refresh missing** in `refresh-calendar-tokens` (only Google is refreshed). Microsoft tokens go stale after ~1h.
4. **Onboarding `Stage7ContextConnection.tsx` hardcodes Google only** — Microsoft and Apple invisible during onboarding.
5. **`CalendarConnectionSettings.tsx` uses legacy single-provider endpoint** — won't show multi-provider state.
6. **`check-connections-status` calendar object** has only binary `connected`; no `connectionStatus` / `syncStatus` / `needs_reconnect` / `sync_delayed` (Apple Watch and Oura already use this richer model).
7. **No `sync_delayed`-style resilience for OAuth** — a single failed `sync-calendar` run just gets logged; nothing retries until next cron tick.
8. **Wording risk**: "Reconnect" CTAs fire on transient lapses today because UI flips off `connected` whenever `sync-calendar` returns `reconnectRequired: true`, even for transient 5xx.

## Plan

### A. Database — unify the schema

One migration:

1. Drop the old `provider` CHECK constraint, replace with `CHECK (provider IN ('google','microsoft','apple'))`.
2. Add to `calendar_connections`:
   - `connection_status text` (`connected | waiting_for_data | sync_delayed | permission_revoked | error`)
   - `sync_status text` (`idle | syncing | sync_delayed | sync_temporary_unavailable`)
   - `last_error text`, `last_error_at timestamptz`
   - `account_identifier text` (Google email / Microsoft UPN / Apple device id) — provider-agnostic display label
3. Add `source text` to `calendar_events` (`google | microsoft | apple`), default `null`, backfill from connection on next sync. Add index `(user_id, source, start_time DESC)`.
4. Keep existing unique `(user_id, external_id)` for idempotency (already source-agnostic enough because Google/MS/Apple IDs don't collide in practice; if they do we can switch to `(user_id, source, external_id)` later — flagged as a follow-up, not done now).
5. GRANTs preserved (service_role + authenticated read-own where applicable).

### B. Edge functions — make OAuth resilient, add Microsoft refresh

1. **`refresh-calendar-tokens`**: add a Microsoft branch (token endpoint `https://login.microsoftonline.com/common/oauth2/v2.0/token`, same encrypt/decrypt pipeline). Update the cron condition to include both providers.
2. **`sync-calendar`**:
   - Map transient failures (network, 5xx, 429) → write `sync_status='sync_temporary_unavailable'` and `connection_status` stays `connected`. Do NOT return `reconnectRequired`.
   - Only return `reconnectRequired: true` on 401 with failed refresh OR 403 permission-revoked. Set `connection_status='permission_revoked'` in that case.
   - On empty results: `connection_status='waiting_for_data'` (kept `connected` until first event arrives — already mostly true).
   - Set `account_identifier` from the OAuth `userinfo` (Google) / `/me` (Microsoft) call on successful sync.
3. **`sync-apple-calendar`**: now that the CHECK constraint allows `apple`, persist the connection row (`provider='apple'`, `account_identifier=device_id`, `connection_status='connected'`, `last_sync=now()`). Backfill `source='apple'` on each event upsert.
4. **`sync-calendar-scheduled`**: on per-user failure, write `sync_status='sync_temporary_unavailable'` to the connection row; cron next tick retries naturally.
5. **`check-connections-status`**: expand the `providers.{google,microsoft,apple}` shape to include `connectionStatus`, `syncStatus`, `lastSync`, `lastError`, `accountIdentifier`, `needsReconnect` (derived: `connection_status === 'permission_revoked'`). Keep top-level `connected` for back-compat.
6. **`calendar-auth`**: on successful callback, also write `account_identifier`. No change to the CHECK-blocked `apple` disconnect path — it now succeeds.

### C. Frontend — unified provider experience

1. **New shared component `CalendarProviderPicker`** (`src/components/calendar/CalendarProviderPicker.tsx`):
   - One card per provider (Apple / Google / Microsoft), with logo, "Connected as <accountIdentifier>" or "Not connected", status pill (`Connected`, `Syncing`, `Sync delayed`, `Waiting for data`, `Permission revoked – reconnect`), and primary action (Connect / Disconnect / Reconnect only when `needsReconnect===true`).
   - Apple card gated by `isAppleCalendarSupported()` (iOS only); on web shown disabled with "Available in the iOS app".
   - Optional "Sync now" secondary button — additive, never the primary mode.
2. **Refactor `ConnectedData.tsx`** to render via `CalendarProviderPicker` (removes ~150 lines of duplicated card markup, preserves existing handlers).
3. **Refactor `Stage7ContextConnection.tsx`** onboarding to use the same `CalendarProviderPicker` (or a compact variant) — Google + Microsoft + Apple all selectable. The "calendar connected" gate for stage advancement now satisfies if ANY provider is connected.
4. **Refactor `CalendarConnectionSettings.tsx`** to call `check-connections-status` (the multi-provider one) instead of legacy `check-calendar-status`, and render the same picker.
5. **Status copy fix**: never use the word "Reconnect" unless `needsReconnect===true`. Transient `sync_delayed` shows "Sync will retry shortly".
6. **`useCalendarSync` hook**: no API change needed; it stays the source of events. Add a small selector that reads `providers` from `check-connections-status` and surfaces per-provider status to the picker.

### D. iOS — make Apple resilient like wearables already are

1. Verify `AppleCalendarBackgroundSyncBridge` is registered in `AppDelegate` alongside `WearableSyncBridge`; add registration if missing.
2. Mirror the wearable resilience pattern:
   - Map `EKAuthorizationStatus.denied`/`.restricted` → `permission_revoked` (sent in body of `sync-apple-calendar`).
   - Network failure → keep enqueued in `NativeOutbox`; do NOT flip Apple to disconnected.
   - On app resume, re-check permission status; only clear `connected` if explicit denial.
3. Background fetch cadence aligned with existing 30-min target (no change needed if already wired).

### E. Out of scope (explicit)

- Push-notification "watch channel" expansion to Microsoft (Google already has it; leaving Microsoft on polling).
- Calendar write-back (creating events). Read-only is the contract.
- iCloud Calendar sync outside EventKit.
- Switching `calendar_events` unique key to include `source` (flagged as follow-up).

## Files to change

**New**
- `supabase/migrations/<ts>_unify_calendar_providers.sql`
- `src/components/calendar/CalendarProviderPicker.tsx`

**Edited**
- `supabase/functions/refresh-calendar-tokens/index.ts` (add Microsoft branch)
- `supabase/functions/sync-calendar/index.ts` (transient vs permission-revoked split, account_identifier, status writes)
- `supabase/functions/sync-apple-calendar/index.ts` (persist apple connection row, write source='apple')
- `supabase/functions/sync-calendar-scheduled/index.ts` (per-user sync_status writes)
- `supabase/functions/check-connections-status/index.ts` (rich providers map)
- `supabase/functions/calendar-auth/index.ts` (store account_identifier)
- `src/pages/ConnectedData.tsx` (use picker)
- `src/pages/onboarding/stages/Stage7ContextConnection.tsx` (use picker, all 3 providers)
- `src/components/CalendarConnectionSettings.tsx` (multi-provider endpoint + picker)
- `src/hooks/useCalendarSync.ts` (surface per-provider status; no behavior change)
- `ios/App/App/AppDelegate.swift` if AppleCalendarBackgroundSyncBridge registration missing
- `ios/App/App/AppleCalendarBackgroundSyncBridge.swift` (permission-revoked vs transient mapping)

## Acceptance check after build

- Inserting an `apple` row into `calendar_connections` succeeds.
- `check-connections-status` returns rich per-provider state.
- Microsoft token visibly refreshed by `refresh-calendar-tokens` (function logs).
- ConnectedData, Stage 7 onboarding, and Settings all render the same picker with all 3 providers on iOS.
- Forcing a 5xx in `sync-calendar` produces `sync_temporary_unavailable`, not `needsReconnect`.
- Apple permission revoke flips status to `permission_revoked`; granting again flips back to `connected` without a manual reconnect.
