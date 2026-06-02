## Current state — most of this already exists

The travel stack is already mobile-first and automatic. Spot-check:

- iOS native: `ios/App/App/LocationBridge.swift` + `LocationBridgePlugin.swift` use `CLLocationManager` significant-change + visits + system timezone-change monitoring, throttle uploads, and POST to `persist-travel-location`. `AppDelegate.startIfAuthorized()` runs on launch.
- Edge functions: `persist-travel-location` writes `travel_state`, detects transitions, and fires `travel-notifications` when `profiles.travel_notifications_enabled` is on.
- Client service: `src/services/travelStateService.ts` exposes `ensureTravelMonitoringIfAuthorized`, `getTravelPermissionStatus`, `requestTravelLocationPermission` (7-day cooldown), `manualTravelRefresh`, `startTimezoneWatcher`, and a web `navigator.geolocation` one-shot fallback.
- `src/pages/TravelSettings.tsx` already renders the requested status/settings layout: current state card, permission state card (iOS granted / undetermined / denied, web fallback copy), travel-notifications toggle, and `Update now` hidden behind "Having issues?".

## Gaps to close (minimal, safe)

1. **Notifications toggle is uncontrolled** — `TravelSettings.tsx` initialises `enabled = true` instead of reading `profiles.travel_notifications_enabled`. On a user who has disabled it, the UI shows it as on. Load the value via `useAuth` profile (already exposes it) or one-shot select, and reflect updates.
2. **`location_permission_status` not persisted** — user spec requires it on the DB row. Add column to `public.travel_state` and send permission status with every ping.
3. **Timezone watcher is only active while `/travel-settings` is open** — `startTimezoneWatcher` is started inside `useTravelState`, which is only mounted on the settings page. Mount it once globally so timezone changes anywhere in the app trigger a ping (iOS already covers this natively via `NSSystemTimeZoneDidChange`, but the web/PWA path needs the JS watcher running app-wide).
4. **App-resume hook for native** — iOS `AppDelegate` covers launch; ensure Capacitor `appStateChange` also calls `ensureTravelMonitoringIfAuthorized()` so a resumed app re-verifies authorization after a Settings round-trip and re-arms monitors if the system tore them down.

Everything else in the brief already works as specified.

## Changes

### Code

- `src/pages/TravelSettings.tsx`
  - Initialise `enabled` from `user.travel_notifications_enabled` (fallback `true`). Keep the existing optimistic toggle write.
  - After `handleEnable` and on `visibilitychange`, call a new `persistPermissionStatus()` helper so a granted/denied state lands on `travel_state.location_permission_status` even if no location ping has fired yet.

- `src/services/travelStateService.ts`
  - Add `permission_status` to every `postPing(...)` body (both `sendForegroundPing` and the timezone-change ping).
  - Add a tiny `persistPermissionStatus()` that POSTs `{ permission_status, source: 'permission-sync', captured_at }` to `persist-travel-location`.
  - Export it for `TravelSettings` to call.

- `src/App.tsx` (or the closest always-mounted root)
  - Mount `startTimezoneWatcher` and an `ensureTravelMonitoringIfAuthorized` call inside a `useEffect` that also re-runs on Capacitor `App.addListener('appStateChange', …)` resume. Web path is harmless (returns no-op when no native bridge).
  - Strictly add-on: do not touch existing render order.

### iOS

- `ios/App/App/LocationBridge.swift`
  - Include the current `CLLocationManager.authorizationStatus()` string in every ping payload (under `permission_status`) so the edge function can persist it.

### Edge function

- `supabase/functions/persist-travel-location/index.ts`
  - Accept optional `permission_status` and `source: 'permission-sync'`.
  - When present, upsert it onto `travel_state.location_permission_status` even when no lat/lng is supplied.

### Migration

`supabase/migrations/<timestamp>_travel_state_permission_status.sql`

```sql
ALTER TABLE public.travel_state
  ADD COLUMN IF NOT EXISTS location_permission_status text;
```

No GRANT changes needed — existing grants already cover the table.

## DB fields used (mapping to user spec)

| Spec field | Where |
|---|---|
| `user_id` | `travel_state.user_id` |
| `travel_status` / `detected_trip_state` | `travel_state.state` |
| `location_permission_status` | **new column** on `travel_state` |
| `last_location_check_at` | `travel_state.last_location_at` |
| `last_known_timezone` | `travel_state.last_known_timezone` |
| `current_timezone` | `profiles.current_timezone` (already maintained by `persist-travel-location`) |
| `travel_notifications_enabled` | `profiles.travel_notifications_enabled` |
| `last_travel_transition_at` | `travel_state.last_state_change_at` |
| `updated_at` | `travel_state.updated_at` |

No new tables.

## Out of scope (already correct)

- LocationBridge native logic (significant-change + visits + timezone change).
- Permission cooldown / never-re-prompt behaviour.
- Web fallback copy and the "Update now" debug action.
- `travel-notifications` edge function wiring.
- `travel_location_pings` retention policy.

## QA checklist

- iOS: fresh install → tap Allow → `authorization_status` flips → ping posts → `travel_state.location_permission_status='authorized_always'`.
- iOS: revoke in Settings → resume app → status reflected within one visibility cycle; no false "on" state in UI.
- iOS: cross a timezone in-flight → state updates without user action.
- Web: `/travel-settings` shows fallback copy and last synced state; toggle persists; `Update now` available behind "Having issues?".
- Toggle starts in the persisted state, not always `true`.
- TS passes; iOS build unaffected (only an extra dictionary key in the ping payload).
