/**
 * Unified sync-state model — derives a single label from
 * backend status + local queue depth + permission/error state.
 *
 * Backend (`check-connections-status`) remains the source of truth
 * for whether something is "connected" or "synced". This module only
 * adds local overlays such as `pending_offline_sync` when there are
 * queued items waiting to upload.
 */

export type SyncState =
  | 'never_synced'
  | 'syncing'
  | 'synced'
  | 'pending_offline_sync'
  | 'stale'
  | 'partial_sync'
  | 'failed'
  | 'permission_revoked'
  | 'disconnected';

export interface SyncStateInput {
  backendConnectionState?: string | null;
  backendSyncStatus?: string | null;
  lastSyncAt?: string | null;
  queueDepth?: number;
  permissionGranted?: boolean | null;
  lastAttemptError?: string | null;
  staleThresholdHours?: number;
  syncing?: boolean;
}

export function deriveSyncState(input: SyncStateInput): SyncState {
  const {
    backendConnectionState,
    backendSyncStatus,
    lastSyncAt,
    queueDepth = 0,
    permissionGranted,
    syncing,
    staleThresholdHours = 24,
  } = input;

  if (syncing) return 'syncing';
  if (permissionGranted === false || backendConnectionState === 'permission_revoked') {
    return 'permission_revoked';
  }
  if (backendConnectionState === 'disconnected' || !backendConnectionState) {
    return queueDepth > 0 ? 'pending_offline_sync' : 'disconnected';
  }
  if (queueDepth > 0) return 'pending_offline_sync';
  if (backendSyncStatus === 'sync_delayed') return 'partial_sync';
  if (backendSyncStatus === 'error' || backendConnectionState === 'error') return 'failed';
  if (backendSyncStatus === 'waiting_for_data') return 'synced';
  if (!lastSyncAt) return 'never_synced';

  const ageMs = Date.now() - new Date(lastSyncAt).getTime();
  if (Number.isFinite(ageMs) && ageMs > staleThresholdHours * 3600_000) return 'stale';

  return 'synced';
}
