/**
 * Service to persist HealthKit data to the backend via edge function.
 * Syncs ALL daily wearable summaries (HRV, RHR, HR, Sleep – up to 30 days) in a single bulk request.
 * Only active on native iOS – no-op on web.
 */
import { isNativeApp, queryHealthKitData, verifyHealthKitAccess } from '@/utils/healthKitCapacitor';
import { getAuthToken } from '@/services/authTokenService';
import { saveWearableDataLocally } from '@/services/localDataStore';

const WEARABLE_PERMISSION_KEY = 'healthkit_permission_granted';

/** Mark HealthKit permission as granted in local storage */
export function markHealthKitPermissionGranted(): void {
  try {
    localStorage.setItem(WEARABLE_PERMISSION_KEY, 'true');
  } catch (error) {
    console.warn('[WearableSync] Failed to cache HealthKit permission flag:', error);
  }
}

/** Check if HealthKit permission was previously granted (local cache only – NOT authoritative) */
export function isHealthKitPermissionGranted(): boolean {
  try { return localStorage.getItem(WEARABLE_PERMISSION_KEY) === 'true'; } catch { return false; }
}

/** Clear HealthKit permission flag (for disconnect) */
export function clearHealthKitPermission(): void {
  try {
    localStorage.removeItem(WEARABLE_PERMISSION_KEY);
  } catch (error) {
    console.warn('[WearableSync] Failed to clear HealthKit permission flag:', error);
  }
}

export type WearableConnectionState = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'connected_but_waiting_for_data'
  | 'sync_delayed'
  | 'permission_revoked'
  | 'error';

export type WearableSyncStatus =
  | 'unknown'
  | 'synced'
  | 'waiting_for_data'
  | 'sync_delayed'
  | 'watch_unavailable'
  | 'error';

export interface WearableSyncResult {
  success: boolean;
  permissionGranted: boolean;
  hasData: boolean;
  connectionState: WearableConnectionState;
  syncStatus: WearableSyncStatus;
  lastSyncAttemptAt: string;
  errorCode?: string | null;
}

interface PersistWatchStatusPayload {
  watch_connection_status: 'disconnected' | 'connecting' | 'connected' | 'permission_revoked' | 'error';
  watch_sync_status?: WearableSyncStatus;
  watch_last_sync_at?: string | null;
  watch_last_sample_at?: string | null;
  watch_last_error?: string | null;
  watch_type?: string | null;
}

async function persistWatchStatus(payload: PersistWatchStatusPayload): Promise<boolean> {
  const token = await getAuthToken();
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

  if (!token || !projectId) {
    console.warn('[WearableSync] Cannot persist watch status: missing auth token or project id');
    return false;
  }

  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/persist-wearable-data`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'update_status',
        ...payload,
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.warn('[WearableSync] Failed to persist watch status:', res.status, errText);
    return false;
  }

  return true;
}

export async function disconnectAppleHealthFromBackend(): Promise<boolean> {
  const token = await getAuthToken();
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

  if (!token || !projectId) {
    console.warn('[WearableSync] Cannot disconnect watch in backend: missing auth token or project id');
    return false;
  }

  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/persist-wearable-data`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'disconnect' }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.warn('[WearableSync] Failed to disconnect watch in backend:', res.status, errText);
    return false;
  }

  clearHealthKitPermission();
  return true;
}

/**
 * Query HealthKit and persist ALL daily summaries to wearable_data via edge function.
 * Now includes HRV, RHR, HR, and Sleep metrics.
 * Returns structured result with explicit connection state.
 */
export async function syncHealthKitToBackend(): Promise<WearableSyncResult> {
  const startedAt = new Date().toISOString();
  const notConnected: WearableSyncResult = {
    success: false,
    permissionGranted: false,
    hasData: false,
    connectionState: 'disconnected',
    syncStatus: 'unknown',
    lastSyncAttemptAt: startedAt,
    errorCode: 'not_native',
  };

  if (!isNativeApp()) {
    console.log('[WearableSync] Not native app, skipping sync');
    return notConnected;
  }

  try {
    console.log('[WearableSync] Starting sync – verifying HealthKit access first...');
    await persistWatchStatus({
      watch_connection_status: 'connecting',
      watch_sync_status: 'unknown',
      watch_last_error: null,
      watch_type: 'apple',
    });

    const hasAccess = await verifyHealthKitAccess();
    if (!hasAccess) {
      console.warn('[WearableSync] HealthKit access verification failed – permission likely revoked');
      clearHealthKitPermission();
      await persistWatchStatus({
        watch_connection_status: 'permission_revoked',
        watch_sync_status: 'error',
        watch_last_sync_at: startedAt,
        watch_last_error: 'healthkit_authorization_revoked',
        watch_type: 'apple',
      });
      return {
        success: false,
        permissionGranted: false,
        hasData: false,
        connectionState: 'permission_revoked',
        syncStatus: 'error',
        lastSyncAttemptAt: startedAt,
        errorCode: 'healthkit_authorization_revoked',
      };
    }

    console.log('[WearableSync] HealthKit access verified, querying 30-day data (HRV + RHR + HR + Sleep)...');
    const data = await queryHealthKitData();

    if (data.permissionGranted) {
      markHealthKitPermissionGranted();
    } else {
      console.warn('[WearableSync] queryHealthKitData returned permissionGranted=false despite access check passing');
      clearHealthKitPermission();
      await persistWatchStatus({
        watch_connection_status: 'permission_revoked',
        watch_sync_status: 'error',
        watch_last_sync_at: startedAt,
        watch_last_error: 'healthkit_authorization_revoked',
        watch_type: 'apple',
      });
      return {
        success: false,
        permissionGranted: false,
        hasData: false,
        connectionState: 'permission_revoked',
        syncStatus: 'error',
        lastSyncAttemptAt: startedAt,
        errorCode: 'healthkit_authorization_revoked',
      };
    }

    if (data.readError === 'read_failed') {
      console.warn('[WearableSync] HealthKit read failed even though authorization is still granted');
      await persistWatchStatus({
        watch_connection_status: 'connected',
        watch_sync_status: 'sync_delayed',
        watch_last_sync_at: startedAt,
        watch_last_error: 'healthkit_read_failed',
        watch_type: 'apple',
      });
      return {
        success: false,
        permissionGranted: true,
        hasData: false,
        connectionState: 'sync_delayed',
        syncStatus: 'sync_delayed',
        lastSyncAttemptAt: startedAt,
        errorCode: 'healthkit_read_failed',
      };
    }

    // Check both legacy dailySamples and new dailySummaries
    const hasAnyData = data.dailySummaries.length > 0 || data.dailySamples.length > 0;

    if (!hasAnyData) {
      console.log('[WearableSync] HealthKit accessible, no samples in 30-day window');
      await persistWatchStatus({
        watch_connection_status: 'connected',
        watch_sync_status: 'waiting_for_data',
        watch_last_sync_at: startedAt,
        watch_last_sample_at: null,
        watch_last_error: null,
        watch_type: 'apple',
      });
      return {
        success: true,
        permissionGranted: true,
        hasData: false,
        connectionState: 'connected_but_waiting_for_data',
        syncStatus: 'waiting_for_data',
        lastSyncAttemptAt: startedAt,
        errorCode: null,
      };
    }

    console.log('[WearableSync] Found', data.dailySummaries.length, 'daily summaries – persisting to backend...');

    const token = await getAuthToken();
    if (!token) {
      console.warn('[WearableSync] No auth token, skipping persist');
      return {
        success: false,
        permissionGranted: true,
        hasData: true,
        connectionState: 'sync_delayed',
        syncStatus: 'sync_delayed',
        lastSyncAttemptAt: startedAt,
        errorCode: 'missing_auth_token',
      };
    }

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

    // Build enriched bulk payload with all metrics
    const samples = data.dailySummaries.map(ds => ({
      summary_date: ds.date,
      hrv: ds.hrv,
      hrv_samples: ds.hrvSamples,
      resting_heart_rate: ds.restingHeartRate,
      heart_rate: ds.heartRate,
      total_sleep_minutes: ds.totalSleepMinutes,
      deep_sleep_minutes: ds.deepSleepMinutes,
      rem_sleep_minutes: ds.remSleepMinutes,
      sleep_score: ds.sleepScore,
    }));

    console.log('[WearableSync] Sending bulk persist request:', samples.length, 'samples with enriched metrics');

    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/persist-wearable-data`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          samples,
          raw_data: {
            synced_at: new Date().toISOString(),
            total_daily_samples: data.dailySummaries.length,
            metrics_available: {
              hrv: data.dailySamples.length,
              rhr: data.dailySummaries.filter(d => d.restingHeartRate !== null).length,
              hr: data.dailySummaries.filter(d => d.heartRate !== null).length,
              sleep: data.dailySummaries.filter(d => d.totalSleepMinutes !== null).length,
            },
          },
        }),
      }
    );

    if (res.ok) {
      const result = await res.json();
      console.log('[WearableSync] ✅ Bulk persist success:', JSON.stringify(result));

      // Save all daily summaries to local store
      for (const ds of data.dailySummaries) {
        saveWearableDataLocally({
          hrv: ds.hrv,
          restingHeartRate: ds.restingHeartRate,
          heartRate: ds.heartRate,
          totalSleepMinutes: ds.totalSleepMinutes,
          deepSleepMinutes: ds.deepSleepMinutes,
          remSleepMinutes: ds.remSleepMinutes,
          sleepScore: ds.sleepScore,
          syncedAt: new Date().toISOString(),
          summaryDate: ds.date,
        });
      }

      return {
        success: true,
        permissionGranted: true,
        hasData: true,
        connectionState: 'connected',
        syncStatus: 'synced',
        lastSyncAttemptAt: startedAt,
        errorCode: null,
      };
    } else {
      const errText = await res.text();
      console.warn('[WearableSync] ⚠️ Persist failed:', res.status, errText);
      await persistWatchStatus({
        watch_connection_status: 'connected',
        watch_sync_status: 'sync_delayed',
        watch_last_sync_at: startedAt,
        watch_last_sample_at: data.latestSampleDate,
        watch_last_error: `persist_failed:${res.status}`,
        watch_type: 'apple',
      });
      return {
        success: false,
        permissionGranted: true,
        hasData: true,
        connectionState: 'sync_delayed',
        syncStatus: 'sync_delayed',
        lastSyncAttemptAt: startedAt,
        errorCode: `persist_failed:${res.status}`,
      };
    }
  } catch (err) {
    console.error('[WearableSync] ⚠️ Sync error:', err);
    if (isHealthKitPermissionGranted()) {
      await persistWatchStatus({
        watch_connection_status: 'connected',
        watch_sync_status: 'sync_delayed',
        watch_last_sync_at: startedAt,
        watch_last_error: err instanceof Error ? err.message : 'unknown_sync_error',
        watch_type: 'apple',
      });
      return {
        success: false,
        permissionGranted: true,
        hasData: false,
        connectionState: 'sync_delayed',
        syncStatus: 'sync_delayed',
        lastSyncAttemptAt: startedAt,
        errorCode: err instanceof Error ? err.message : 'unknown_sync_error',
      };
    }
    return {
      success: false,
      permissionGranted: false,
      hasData: false,
      connectionState: 'error',
      syncStatus: 'error',
      lastSyncAttemptAt: startedAt,
      errorCode: err instanceof Error ? err.message : 'unknown_sync_error',
    };
  }
}
