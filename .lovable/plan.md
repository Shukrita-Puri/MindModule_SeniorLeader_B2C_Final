# iOS Issue Fix Pass — Calendar, Pills, HR/RHR, Notifications

Minimal, root-cause fixes only. Existing JS sync queue, native iOS outbox, HealthKit observer, Apple Calendar background bridge, and notification pipeline are preserved.

## 1. Apple Calendar — reconnect + fast event sync

**Symptoms:** After reinstall, permission granted but UI shows disconnected until next app open; manually-added events take a long time to appear.

**Root causes to fix:**
- After permission grant we enqueue/post to the edge function but do **not** invalidate `calendar_connections` cache / refetch `useCalendarSync` state, so UI stays "not connected" until next mount.
- EventKit changes only trigger sync on the next iOS background-fetch slot — no `EKEventStoreChangedNotification` observer is wired into `AppleCalendarBackgroundSyncBridge`.
- Foreground resume already flushes the outbox, but does not force a fresh fetch when the app has been backgrounded > 2 min.

**Changes:**
- `AppleCalendarBackgroundSyncBridge.swift`: subscribe to `EKEventStoreChangedNotification`; on fire, debounce 5s then run `fetchAndPersist`. Also expose `forceSyncNow()` for JS.
- `NativeBackgroundSyncPlugin.swift` + `src/utils/nativeBackgroundSync.ts`: expose `forceCalendarSync()`.
- `src/components/CalendarConnectionSettings.tsx` (or the Apple connect flow): after permission grant + first successful POST, call `forceCalendarSync()` then `queryClient.invalidateQueries(['calendar-connections'])` / refetch the connection hook so the UI flips immediately.
- `AppDelegate.swift`: on `applicationWillEnterForeground`, if last calendar sync > 2 min old, call `AppleCalendarBackgroundSyncBridge.shared.fetchAndPersist`.

## 2. Connect-Calendar signal pill always visible when disconnected

**Symptom:** Pill never appears, even after disconnect.

**Root cause:** Pill derivation only checks `calendarState === 'not_connected'` from the readiness payload, but on iOS the Apple connection row remains in `calendar_connections` with `is_active=false` after disconnect — and `compute-outer-readiness` treats absence of *recent events* as "connected_no_events" rather than "not_connected".

**Changes (server-side, lightweight):**
- `supabase/functions/compute-outer-readiness/index.ts`: change `calendarState` derivation to require `is_active=true` AND a `last_sync` within 7 days; otherwise `not_connected`.
- Brief client/derivation: ensure the "Connect Calendar" pill is emitted whenever `calendarState === 'not_connected'` regardless of other context. Verify in `signal_pills` builder.

## 3. HR / RHR stale-data hardening

**Symptom:** 4-day-old HR / RHR shown as live.

**Changes:**
- `src/utils/wearableContextAnalyzer.ts` (or equivalent freshness gate): introduce `LIVE_METRIC_MAX_AGE_HOURS = 24` for HR + RHR specifically (HRV / readiness retain existing 7-day tolerance).
- Anywhere HR / RHR is read for the brief or UI, check sample timestamp; if older than 24h, set value to `null` and mark `wearableStatus.heartRateStale = true`.
- Brief / UI components: when stale, hide "live" pill and fall back to felt-state indicators. No change to scoring weights.

## 4. Notifications not firing — full pipeline audit

**Likely root causes:**
- After reinstall, APNs token rotates but `register-device-token` is only called once at first auth; if registration races with sign-in it silently no-ops.
- `smart-nudges` scheduling uses stored device tokens; previous tokens may still be marked active for the user, so APNs returns `Unregistered` and the nudge is dropped without fallback.
- Permission state isn't re-checked on app resume.

**Changes:**
- `src/hooks/useDeviceTokenRegistration.ts`: on every app resume + on auth state change, call `PushNotifications.register()` and re-POST the token; on `registrationError`, surface a toast / debug log.
- `cleanup_device_tokens` already deactivates dupes — extend `register-device-token` to mark previous tokens for the same user/platform inactive immediately on register.
- `smart-nudges` send loop: when APNs returns `Unregistered` / `BadDeviceToken`, mark the token inactive in DB and continue (already partially done — verify).
- Add structured logging: every nudge attempt logs `{ user_id, nudge_type, scheduled_for, token_count, send_result }` to `notification_log` (already exists — ensure all paths write).
- Debug panel: show notification permission state, active device-token count, last successful send timestamp.

## 5. Diagnostics

Extend `AppleIntegrationsDebugPanel`:
- Calendar: last sync timestamp, EventKit-change observer fire count.
- Wearable: HR / RHR sample age + `isStale` flag.
- Notifications: permission status, active token count, last delivered notification time.

## Files to modify

Swift:
- `ios/App/App/AppleCalendarBackgroundSyncBridge.swift`
- `ios/App/App/AppDelegate.swift`
- `ios/App/App/NativeBackgroundSyncPlugin.swift`

TS:
- `src/utils/nativeBackgroundSync.ts`
- `src/components/CalendarConnectionSettings.tsx`
- `src/hooks/useCalendarSync.ts`
- `src/hooks/useDeviceTokenRegistration.ts`
- `src/utils/wearableContextAnalyzer.ts` (+ any HR display sites)
- `src/components/debug/AppleIntegrationsDebugPanel.tsx`

Edge functions:
- `supabase/functions/compute-outer-readiness/index.ts`
- `supabase/functions/register-device-token/index.ts`
- `supabase/functions/smart-nudges/index.ts` (logging + token-invalidate path only)

## Out of scope
- No rewrite of sync queue, native outbox, or notification scheduler.
- No DB schema changes (existing tables sufficient).
- No UI redesign — only state-binding fixes for the pill.

## Confirmation needed

Please confirm before I implement, or tell me to skip / re-prioritise any section. In particular:
1. OK to set HR/RHR live freshness threshold to **24h** (HRV/readiness untouched at 7d)?
2. OK to change `calendarState` to require `last_sync < 7 days` (vs current logic that may classify stale connections as "connected_no_events")?
3. OK to re-register APNs token on every app resume (very low cost, tiny battery impact)?
