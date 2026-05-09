
## Goal

Extend the existing Apple Health + Apple Calendar architecture with a production-grade offline-first sync queue, robust retry orchestration, a unified sync-state model, and developer/QA diagnostics — without rewriting working code.

## What already exists (preserve as-is)

- `WearableSyncBridge.swift` — HKObserverQueries + HKAnchoredObjectQuery + background delivery for HRV/RHR/HR/Sleep, posts to `persist-wearable-data`.
- `AppleCalendarBackgroundSyncBridge.swift` — EventKit fetch + post to `sync-apple-calendar`.
- `AppDelegate.swift` — registers observers + background fetch.
- `NativeBackgroundSyncPlugin.swift` — Keychain token store + manual `runNow()`.
- `wearableSyncService.ts` / `appleCalendarSync.ts` — foreground sync with telemetry + permission verification.
- `integrationTelemetry.ts` — `[itel]` ring-buffer logger.
- `AppleIntegrationsDebugPanel.tsx` — QA panel gated by `?qa=1` / `VITE_MM_QA_DEBUG`.
- `ConnectedData.tsx` — pending-disconnect retry queue + online listener (model to extend).

The native side is already incremental, idempotent (DB upserts on `(user_id, summary_date)` and `(user_id, provider, external_id)`), and lifecycle-aware. We do NOT touch that.

## What we add (minimal extensions)

### 1. Offline-first sync queue (JS layer)

New file `src/services/syncQueue.ts`:

- Persistent queue backed by `localStorage` (key `mm.syncQueue.v1`), keyed by `provider` + `id` (uuid) + `payloadHash` + `enqueuedAt` + `attempts` + `lastError`.
- Queue items: `{ kind: 'apple-health' | 'apple-calendar', payload, enqueuedAt, attempts, lastError }`.
- Functions: `enqueue`, `peekAll`, `removeById`, `markFailed(id, err)`, `clear`, `clearByKind`.
- Cap: 50 items per kind (drop oldest when full, log telemetry `queue_overflow`).
- Used by both wearable + calendar sync services after a foreground sync POST fails OR when offline at attempt time.

### 2. Retry orchestrator

New file `src/services/syncRetryOrchestrator.ts`:

- Central scheduler. Drains queue when:
  - `online` event fires
  - app `resume` (Capacitor App listener) — already wired in ConnectedData; we add a single subscription.
  - auth token successfully refreshed (hook into `getAuthToken` cache write — emit a CustomEvent `mm:auth-token-refreshed`).
  - Manual trigger from QA panel.
- Debounce: min 5s between full drains.
- Exponential backoff per item: 30s, 2m, 5m, 15m, then drop with telemetry `queue_dropped_max_attempts` (max 5 attempts).
- Calls existing `syncHealthKitToBackend` / `syncAppleCalendarToBackend`-style POST helpers, BUT bypassing the queueing path (direct POST mode) to avoid recursion — small `postDirect()` helpers extracted.
- Idempotency: relies on existing edge-function upserts on `(user_id, summary_date)` / `(user_id, provider, external_id)`.

### 3. Wire foreground sync services into the queue

Edit `src/services/wearableSyncService.ts`:
- On `persist_failed:*` after the existing 2-attempt retry → `enqueue({ kind: 'apple-health', payload: { samples, raw_data } })`.
- New small `postWearableDirect(payload, token)` extracted so the orchestrator reuses it.

Edit `src/services/appleCalendarSync.ts`:
- On network/HTTP failure → `enqueue({ kind: 'apple-calendar', payload: { windowStart, windowEnd, events } })`.
- New `postAppleCalendarDirect(payload, token)` extracted.

### 4. Unified sync-state model

New file `src/services/syncStateModel.ts`:

```ts
export type SyncState =
  | 'never_synced' | 'syncing' | 'synced' | 'pending_offline_sync'
  | 'stale' | 'partial_sync' | 'failed' | 'permission_revoked' | 'disconnected';
```

Resolver `deriveSyncState({ backend, queueDepth, lastAttemptError, lastSyncAt, permission })` used by the debug panel and (optionally) by `ConnectedData` for richer pills. Backend (`check-connections-status`) remains the source of truth for `connected`/`lastSync` — local queue depth only adds the `pending_offline_sync` overlay.

### 5. Telemetry events (extend `integrationTelemetry`)

New event types:
- `queue_enqueued`, `queue_drained_start`, `queue_drained_complete`, `queue_item_retry`, `queue_item_dropped`, `queue_overflow`, `queue_cleared`, `state_resolved`.

All flow through the existing `[itel]` ring buffer.

### 6. QA panel additions

Extend `AppleIntegrationsDebugPanel.tsx`:
- "Pending queue" section: shows count per kind + last error + next-retry ETA.
- Buttons: "Drain queue now", "Clear queue", "Simulate offline" (toggles a window flag intercepted by `postDirect` helpers to force a synthetic network error), "Simulate sync failure" (one-shot 500), "Inspect last sync timestamps" (already partially shown).

### 7. iOS side — minor hardening (no rewrite)

`WearableSyncBridge.swift`:
- Persist `lastSuccessfulSyncAt` in Keychain on POST 2xx; expose via a small `lastSyncedAt()` reader on the existing `NativeBackgroundSync` plugin (`getDiagnostics()` method) for the QA panel.
- On non-2xx HTTP: keep the request body in a single-slot Keychain "outbox" (`mindmodule.wearable_outbox`). Next observer/background-fetch fire posts the outbox first before re-querying. Tiny ~30-line addition; no architectural change.

`AppleCalendarBackgroundSyncBridge.swift`:
- Same pattern: `mindmodule.calendar_outbox` single-slot Keychain outbox flushed on next run.

(Native outbox + JS queue cover background-vs-foreground separately; idempotent edge functions deduplicate.)

### 8. Logout cleanup

Extend `useAuth.cleanupLocalState` (already clears `contextConnections`, HK flag) to also call `syncQueue.clear()` and `NativeBackgroundSync.clearAuthToken()` — the latter already exists, ensure it is invoked.

## Files to modify / create

Created:
- `src/services/syncQueue.ts`
- `src/services/syncRetryOrchestrator.ts`
- `src/services/syncStateModel.ts`

Edited:
- `src/services/wearableSyncService.ts` — extract `postWearableDirect`, enqueue on failure.
- `src/services/appleCalendarSync.ts` — extract `postAppleCalendarDirect`, enqueue on failure.
- `src/services/authTokenService.ts` — emit `mm:auth-token-refreshed` after successful refresh.
- `src/utils/integrationTelemetry.ts` — extend allowed event names.
- `src/components/debug/AppleIntegrationsDebugPanel.tsx` — queue inspector + new actions.
- `src/pages/ConnectedData.tsx` — start orchestrator on mount; wire resume listener.
- `src/hooks/useAuth.tsx` — clear queue on logout.
- `ios/App/App/WearableSyncBridge.swift` — outbox + lastSyncedAt diagnostics.
- `ios/App/App/AppleCalendarBackgroundSyncBridge.swift` — outbox.
- `ios/App/App/NativeBackgroundSyncPlugin.swift` — add `getDiagnostics()` method.
- `src/utils/nativeBackgroundSync.ts` — add `getNativeSyncDiagnostics()`.

## Out of scope

- No new edge functions (existing ones are already idempotent).
- No DB migrations (existing unique constraints handle dedup).
- No UI redesign for end users — only QA panel grows.
- No changes to Google/Microsoft calendar paths.
- BackgroundTasks (BGTaskScheduler) framework — would require new entitlements + Info.plist keys + user re-build. The existing background-fetch + HKObserver path already covers the iOS-permitted execution windows; we can add BGTaskScheduler later if QA shows the gap is real.

## Acceptance verification

- TypeScript build passes (auto).
- Manual: in QA panel toggle "Simulate offline" → trigger sync → see queue depth 1 → toggle online → see drain telemetry + success.
- `?qa=1` panel renders only when flag set; production users unaffected.
- Logout flushes queue (verified via panel after re-login).
- iOS rebuild required for Swift changes; JS-only changes ship via Lovable Publish.

## Deployment

- Frontend: user clicks Publish → Update.
- Edge functions: none changed; no redeploy needed.
- iOS: `git pull && npm install && npx cap sync ios` then Xcode rebuild for TestFlight.
