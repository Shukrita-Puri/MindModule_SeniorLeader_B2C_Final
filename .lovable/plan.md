# Apple Health Native-Authoritative Sync — Implementation Plan

This is a multi-file architectural change touching iOS Swift, backend edge functions, JS/Capacitor layer, and DB schema. Presenting scope + sequencing before implementing so we agree on shape (est. ~1.5k new Swift lines, ~300 backend lines, targeted JS deletions, one migration, ~15 new tests).

## 1. Findings (from current code)

Current state (`WearableSyncBridge.swift` 687 LOC, `NativeOutbox.swift` 291 LOC, `wearableSyncService.ts` 577 LOC):

- **No `HKAnchoredObjectQuery`** — reads are time-window based, so observer wakes re-scan and can double-persist samples.
- **No `HKObserverQuery` background delivery** for HRV/RHR/HR/sleep — background wake exists only for BGTaskScheduler; observer path is missing (only BGTasks fire).
- **JS can still write authoritative status.** `wearableSyncService.syncHealthKitToBackend` calls `update_status` directly from JS on every foreground run — even after native ran a moment earlier. Native success can be regressed to `waiting_for_data`.
- **`NativeOutbox`** dedupes by opaque payload hash only; not by (metric, sampleUUID) — retries after partial upload can re-post samples.
- **`update_status` endpoint accepts any client write** (no monotonic guard, no source-of-truth precedence). Backend has no notion of "authoritative native vs opportunistic JS".
- **Anchors not persisted** anywhere — every sync is a full window scan.
- **Sleep double-counting risk**: current normalizer sums all HKCategoryValueSleepAnalysis rows including umbrella `asleep` + stage rows.
- **`native_healthkit_fallback_triggered`** is masked at read time but still gets written by legacy code paths; no self-heal write on next native success.

## 2. Native Architecture Summary

```text
┌─────────────────────────────────────────────────────────────┐
│  AppDelegate / SceneDelegate                                │
│    - launches HealthKitSyncManager.shared.bootstrap()       │
│    - BGTaskScheduler → handleBackgroundWake()               │
└────────────────────────┬────────────────────────────────────┘
                         │
              ┌──────────▼───────────┐
              │ HealthKitSyncManager │  (serial DispatchQueue)
              │  - requestAuth...    │
              │  - runForegroundSync │
              │  - handleObserverUpd │
              │  - handleBackground  │
              └──┬───────┬───────┬───┘
                 │       │       │
         ┌───────▼─┐ ┌───▼────┐ ┌▼────────────────┐
         │ Anchor  │ │Sample  │ │ WearableStatus  │
         │ Store   │ │Normaliz│ │ Writer (native  │
         │(UserDef)│ │er      │ │ authority only) │
         └─────────┘ └────┬───┘ └────────┬────────┘
                          │              │
                     ┌────▼──────────────▼────┐
                     │  NativeSyncOutbox      │
                     │  (dedupe by identityKey│
                     │   = metric+bucketDate) │
                     └────────────────────────┘
```

Serialization: single `DispatchQueue(label: "healthkit.sync", qos: .utility)` — observer + foreground + BG all funnel through one op queue with `maxConcurrent = 1`. Prevents race where observer callback interleaves with foreground run.

## 3. Swift Module Plan

New files under `ios/App/App/HealthKit/`:

- **`HealthKitSyncManager.swift`** — public API: `bootstrap()`, `requestAuthorizationAndPrimeSync()`, `runForegroundSync(reason:) async -> SyncOutcome`, `handleObserverUpdate(type:)`, `handleBackgroundWake(completion:)`. Serialized OperationQueue. Classifies outcomes: `.permissionRevoked | .waitingForData | .synced(counts) | .readFailed(err) | .persistFailed(err)`.
- **`HealthKitAnchorStore.swift`** — `func load(for: HKQuantityTypeIdentifier|SleepAnalysis) -> HKQueryAnchor?`, `save(_:for:)`, `clearAll()`. Backed by `UserDefaults(suiteName: "app.mindmodule.healthkit.anchors")` with `NSKeyedArchiver` (secure coding). Anchor only advances **after** outbox enqueue + local persist succeed (two-phase: read → enqueue → persist anchor).
- **`HealthKitSampleNormalizer.swift`** — per-metric mappers to canonical JSON payload; sleep collapses umbrella+stage to prevent double counting (prefer stage rows when present in same window, per Apple's HKCategoryValueSleepAnalysisAsleep* enum). Emits `identityKey = "<metric>|<startISO>|<sourceBundleId>"`.
- **`NativeSyncOutbox.swift`** (replace existing) — file-backed queue at `Library/Application Support/native-outbox/*.json`, per-item retry count, exponential backoff (1m/5m/30m/2h/8h then drop), dedupe by `identityKey`. Extends existing NativeOutbox shape (keep provider="apple-health") — outbox stays backwards compat for calendar.
- **`WearableStatusWriter.swift`** — sole caller of `/functions/v1/wearable-status-update` (new endpoint). Sends `{status, source: "native-ios", authoritativeAt: ISO, counts, errorCode?}`. Never emits internal marker strings.
- Refactor **`WearableSyncBridge.swift`** — remove read/persist logic, keep only Capacitor bridge that proxies to `HealthKitSyncManager`. Legacy JS `syncHealthKitData()` becomes a passthrough that returns `{routed: "native"}` — no samples returned to JS.
- **`AppDelegate.swift`** — call `HealthKitSyncManager.shared.bootstrap()`. Registers observers on launch if authorization is present.

## 4. Backend Hardening

New endpoint **`supabase/functions/wearable-status-update/index.ts`** (native-authoritative writer):

Monotonic guard SQL:
```sql
UPDATE user_integrations SET
  watch_sync_status = $new_status,
  watch_last_sync_at = $auth_at,
  watch_last_error = CASE WHEN $new_status='synced' THEN NULL ELSE watch_last_error END,
  watch_last_error_at = CASE WHEN $new_status='synced' THEN NULL ELSE watch_last_error_at END,
  watch_status_source = 'native-ios',
  watch_status_authoritative_at = $auth_at
WHERE user_id = $uid
  AND (
    watch_status_authoritative_at IS NULL
    OR $auth_at > watch_status_authoritative_at
    OR ($new_status = 'synced' AND watch_sync_status <> 'synced')
  );
```

Rules encoded:
- `synced` always wins if newer OR if current isn't synced.
- Downgrades (`synced → waiting_for_data`) rejected unless newer `authoritative_at` **and** source=native.
- JS calls to legacy `update_status` are restricted: reject if body doesn't include `source: "native-ios"` (returns 200 no-op + telemetry).

Migration `20260712_watch_authoritative_source.sql`:
- Add `watch_status_source text`, `watch_status_authoritative_at timestamptz` to `user_integrations`.
- Backfill NULLs. GRANTs preserved.
- One-shot cleanup: `UPDATE user_integrations SET watch_last_error=NULL, watch_last_error_at=NULL WHERE watch_last_error='native_healthkit_fallback_triggered'`.

Keep `normalize-watch-status.ts` masking for read paths during rollout window.

## 5. JS / Capacitor De-authorization

- `src/services/wearableSyncService.ts`: `syncHealthKitToBackend()` becomes a thin wrapper that calls `forceNativeHealthSync()` and then reads status from `check-connections-status`. Removes all `supabase.functions.invoke('update_status', ...)` calls from JS entirely.
- `useWearableSync.ts`: `fetchLatestFromDB` continues to read display state, but never writes.
- Add ESLint boundary comment + a unit test that greps for forbidden `update_status` invocations from `src/`.

## 6. Test Coverage

Native (XCTest under `ios/App/AppTests/HealthKit/` — new target if missing, else Swift Package tests exercising pure logic):
- `HealthKitAnchorStoreTests` — save/load/roundtrip/clear.
- `HealthKitSampleNormalizerTests` — HRV/RHR/HR mapping, sleep umbrella+stage collapse, partial availability.
- `NativeSyncOutboxTests` — dedupe by identityKey, backoff progression, restart persistence, retry cap.
- `HealthKitSyncManagerTests` (with mock HKHealthStore) — serialized ops, observer during foreground, outcome classification, permission-revoked path.

Backend (Deno tests):
- `wearable-status-update` monotonic guard: newer native beats older; older beats newer rejected; JS write without source rejected; synced clears error fields.
- Extend `normalize-watch-status_test.ts` with post-migration row shapes.

JS:
- New test asserting `src/services/wearableSyncService.ts` contains no `update_status` string.

## 7. Rollout Sequence

1. **Backend migration + monotonic guard endpoint** deployed (idempotent — no client change yet).
2. **Native iOS build** (HealthKitSyncManager + writer) shipped via TestFlight; validates on real device with observer background delivery.
3. **JS deauthorization** shipped only after native writer is confirmed working (feature flag `nativeWearableAuthority` gated for first 24h).
4. Legacy `update_status` route stays live but no-ops non-native writes; retire after 2 releases.

## 8. Remaining Risks

- **HKObserverQuery reliability** varies with iOS 17/18 background budget; BGTaskScheduler is the safety net.
- **Sleep source collapse heuristic** may need tuning per device (Apple Watch vs 3rd-party). Ship telemetry counters first.
- **UserDefaults-backed anchors** are wiped on app uninstall — first post-reinstall sync will do a bounded 30-day scan; documented as expected.
- **Feature-flag flip** requires coordinated release; if native ship slips, keep JS writer authoritative to avoid stuck states.
- Cannot unit-test real HKObserverQuery from CI — covered by manual TestFlight checklist in rollout notes.

## Technical details

- HealthKit types: `heartRateVariabilitySDNN`, `restingHeartRate`, `heartRate`, `sleepAnalysis` (HKCategoryType).
- Anchor key namespace: `"hk.anchor.v1.<typeIdentifier>"`.
- Outbox schema stays JSON on disk; adds `identityKey`, `nextAttemptAt`, `attempts`.
- New DB columns nullable, defaults NULL, no RLS change (service role writes via edge function).
- Serial queue prevents observer/foreground race without needing NSLock in each module.

---

Approve and I'll implement in this order: (1) migration + `wearable-status-update` endpoint + tests, (2) Swift modules + Xcode project entries + native tests, (3) JS deauthorization + guard test, (4) rollout docs in `docs/APPLE_HEALTH_NATIVE_AUTHORITY.md`.