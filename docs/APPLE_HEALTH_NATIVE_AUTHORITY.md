# Apple Health Native-Authoritative Sync

Rollout guide for making the iOS native layer the sole source of truth
for Apple Watch / HealthKit sync status.

## Modules

| Layer | File | Responsibility |
| --- | --- | --- |
| Native | `ios/App/App/HealthKit/HealthKitSyncManager.swift` | Serialized owner of HealthKit reads, observer wakes, BG tasks. |
| Native | `ios/App/App/HealthKit/HealthKitAnchorStore.swift` | Persisted `HKQueryAnchor` per metric so incremental reads never re-emit. |
| Native | `ios/App/App/HealthKit/HealthKitSampleNormalizer.swift` | Maps HKSample → backend payload. Collapses sleep umbrella + stage rows. |
| Native | `ios/App/App/HealthKit/WearableStatusWriter.swift` | Sole writer of authoritative status. Never emits `native_healthkit_fallback_triggered`. |
| Backend | `supabase/functions/wearable-status-update/` | Monotonic guard endpoint. Rejects stale downgrades from JS. |
| Backend | `supabase/functions/_shared/rules/normalize-watch-status.ts` | Read-side masking for legacy rows during rollout. |
| JS | `src/services/wearableSyncService.ts` | Shadow-writes with `source: "js-opportunistic"`. Cannot regress a native record. |

## Xcode target wiring (manual — required after `git pull`)

The four new Swift files must be added to the `App` target in
`ios/App/App.xcodeproj`. Match the existing pattern in
`ios/App/validate-ios-native-sync-target.sh`:

1. Open the project in Xcode.
2. Right-click the `App` group → *Add Files to "App"…*.
3. Select the entire `ios/App/App/HealthKit` folder. Ensure:
   - Target membership → `App` is ticked.
   - "Copy items if needed" is UNticked (files already live in-tree).
4. Extend `validate-ios-native-sync-target.sh` `required_files` array with the four new filenames.
5. In `AppDelegate.swift` `didFinishLaunchingWithOptions`, add:
   ```swift
   HealthKitSyncManager.shared.bootstrap()
   ```
   ...directly after `WearableSyncBridge.shared.registerBackgroundObservers()`. Both are idempotent so the transitional overlap is safe.
6. In `NativeBackgroundSyncPlugin.updateAuthToken`, also call `SupabaseAuthTokenProvider.shared.updateToken(token)` and once (on init) `SupabaseAuthTokenProvider.shared.updateSupabaseURL(<SUPABASE_URL constant>)`.

## Monotonic guard rules (encoded in `decide-write.ts`)

| Current | Incoming | Source | Result |
| --- | --- | --- | --- |
| any | first-ever write | any | apply |
| non-synced | synced | any | apply (heal) |
| synced (native) | non-synced (js) | any clock | reject `js_cannot_downgrade_synced` |
| synced (native, T2) | non-synced (native, T0) | native | reject `stale_timestamp` |
| synced (native, T0) | permission_revoked (native, T2) | native | apply |
| waiting (native, T2) | sync_delayed (js, T0) | js | reject `js_cannot_downgrade_native` |

All decisions are unit-tested in `wearable-status-update/decide-write_test.ts` (8 tests, all passing).

## Rollout sequence

1. **Backend live** (this release): migration + `wearable-status-update` endpoint. JS shadow-writes are already emitting `js-opportunistic`. No behavior change until step 2.
2. **iOS build** (next TestFlight): add HealthKit/ files to Xcode target, call `HealthKitSyncManager.shared.bootstrap()`. Manual QA checklist below.
3. **JS deauthorization** (release after iOS ships): remove the legacy `persist-wearable-data { action: "update_status" }` writer from JS entirely. Native is already writing; guard rejects new JS attempts.
4. **Retire legacy** `persist-wearable-data` update-status branch after two releases.

## Manual QA checklist (device required)

- Fresh install → grant HealthKit permission → status flips to `synced` within 5s of grant when samples exist.
- Fresh install → grant permission on a device with no HRV samples → status shows `waiting_for_data`; no sticky red error.
- Revoke HealthKit in iOS Settings → next foreground sync → status becomes `permission_revoked`.
- Airplane mode → open app → native outbox retains payload; disable airplane mode → outbox drains, status becomes `synced`.
- Force-quit app → wait for BGTaskScheduler wake → confirm anchored query only reports NEW samples (via logs).
- Confirm sleep durations do NOT double-count on days with both umbrella + stage rows.

## Remaining risks

- HKObserverQuery background delivery cadence is iOS-controlled; BGTaskScheduler is the backstop.
- UserDefaults anchor wipe on uninstall triggers a 30-day bounded backfill on next install — documented.
- Sleep stage detection heuristic assumes Apple's `asleepCore/Deep/REM/Unspecified` enum. Third-party writers (Whoop, Oura via HealthKit) that only emit the umbrella `asleep` value remain intact (no stage rows → no filtering).
- The Xcode project wiring is manual (Lovable cannot mutate `.pbxproj` safely). CI must fail if `validate-ios-native-sync-target.sh` reports missing files.