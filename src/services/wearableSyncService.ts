/**
 * Service to persist HealthKit data to the backend via edge function.
 * Syncs ALL daily wearable summaries (HRV, RHR, HR, Sleep – up to 30 days) in a single bulk request.
 * Only active on native iOS – no-op on web.
 */
import { isNativeApp, queryHealthKitData, verifyHealthKitAccess } from '@/utils/healthKitCapacitor';
import { getAuthToken } from '@/services/authTokenService';
import { saveWearableDataLocally } from '@/services/localDataStore';
import { emitIntegrationEvent } from '@/utils/integrationTelemetry';
import { enqueue as queueEnqueue } from '@/services/syncQueue';
import { isSimulatedOffline, isSimulatedSyncFailure, consumeSimulatedSyncFailure } from '@/utils/integrationQaHelpers';

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
  /** Whether wearable data was persisted to the database (not just local cache) */
  dbPersisted: boolean;
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

export interface WearablePersistPayload {
  samples: Array<Record<string, unknown>>;
  raw_data?: Record<string, unknown>;
}

/**
 * Direct POST to persist-wearable-data. Used by both the foreground
 * sync path and by the retry orchestrator (when draining the offline
 * queue). Does NOT enqueue on its own — caller handles failure.
 */
export async function postWearableDirect(payload: WearablePersistPayload, idempotencyKey?: string): Promise<{ ok: boolean; status: number; error?: string }> {
  if (isSimulatedOffline()) {
    return { ok: false, status: 0, error: 'simulated_offline' };
  }
  if (consumeSimulatedSyncFailure()) {
    return { ok: false, status: 500, error: 'simulated_failure' };
  }
  const token = await getAuthToken();
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  if (!token || !projectId) return { ok: false, status: 0, error: 'missing_auth_or_project' };
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) headers['X-Outbox-Item-Id'] = idempotencyKey;
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/persist-wearable-data`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: text || `http_${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'network_error' };
  }
}

export async function disconnectAppleHealthFromBackend(): Promise<boolean> {
  emitIntegrationEvent({ provider: 'apple-health', event: 'disconnect_started' });
  const token = await getAuthToken();
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

  if (!token || !projectId) {
    console.warn('[WearableSync] Cannot disconnect watch in backend: missing auth token or project id');
    emitIntegrationEvent({
      provider: 'apple-health',
      event: 'disconnect_failed',
      errorCode: 'missing_auth_or_project',
    });
    return false;
  }

  try {
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
      emitIntegrationEvent({
        provider: 'apple-health',
        event: 'disconnect_failed',
        errorCode: `http_${res.status}`,
        errorMessage: errText.slice(0, 200),
      });
      return false;
    }

    clearHealthKitPermission();
    emitIntegrationEvent({ provider: 'apple-health', event: 'disconnect_success' });
    return true;
  } catch (err) {
    emitIntegrationEvent({
      provider: 'apple-health',
      event: 'disconnect_failed',
      errorCode: 'network_error',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Query HealthKit and persist ALL daily summaries to wearable_data via edge function.
 * Now includes HRV, RHR, HR, and Sleep metrics.
 * Returns structured result with explicit connection state.
 */
export async function syncHealthKitToBackend(): Promise<WearableSyncResult> {
  const startedAt = new Date().toISOString();
  emitIntegrationEvent({ provider: 'apple-health', event: 'sync_started' });

  const fail = (
    overrides: Partial<WearableSyncResult>,
  ): WearableSyncResult => ({
    success: false,
    permissionGranted: false,
    hasData: false,
    dbPersisted: false,
    connectionState: 'disconnected',
    syncStatus: 'unknown',
    lastSyncAttemptAt: startedAt,
    errorCode: null,
    ...overrides,
  });

  if (!isNativeApp()) {
    console.log('[WearableSync] Not native app, skipping sync');
    emitIntegrationEvent({ provider: 'apple-health', event: 'sync_failed', errorCode: 'not_native' });
    return fail({ errorCode: 'not_native' });
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
      emitIntegrationEvent({
        provider: 'apple-health',
        event: 'permission_revoked_external',
        nativePermissionState: 'unauthorized',
      });
      await persistWatchStatus({
        watch_connection_status: 'permission_revoked',
        watch_sync_status: 'error',
        watch_last_sync_at: startedAt,
        watch_last_error: 'healthkit_authorization_revoked',
        watch_type: 'apple',
      });
      return fail({
        connectionState: 'permission_revoked',
        syncStatus: 'error',
        errorCode: 'healthkit_authorization_revoked',
      });
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
      return fail({
        connectionState: 'permission_revoked',
        syncStatus: 'error',
        errorCode: 'healthkit_authorization_revoked',
      });
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
      return fail({
        permissionGranted: true,
        connectionState: 'sync_delayed',
        syncStatus: 'sync_delayed',
        errorCode: 'healthkit_read_failed',
      });
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
        dbPersisted: true, // status was persisted even though no sample data
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
      return fail({
        permissionGranted: true,
        hasData: true,
        connectionState: 'sync_delayed',
        syncStatus: 'sync_delayed',
        errorCode: 'missing_auth_token',
      });
    }

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

    // Build enriched bulk payload with all metrics
    const samples = data.dailySummaries.map(ds => ({
      summary_date: ds.date,
      hrv: ds.hrv,
      hrv_samples: ds.hrvSamples,
      resting_heart_rate: ds.restingHeartRate,
      heart_rate: ds.heartRate,
      hr_samples: ds.hrSamples,
      total_sleep_minutes: ds.totalSleepMinutes,
      deep_sleep_minutes: ds.deepSleepMinutes,
      rem_sleep_minutes: ds.remSleepMinutes,
      sleep_score: ds.sleepScore,
    }));

    console.log('[WearableSync] Sending bulk persist request:', samples.length, 'samples with enriched metrics');

    // --- Persist to DB with one retry on failure ---
    let persistRes: Response | null = null;
    let persistError: string | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        persistRes = await fetch(
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

        if (persistRes.ok) {
          persistError = null;
          break; // success
        }

        persistError = await persistRes.text();
        console.warn(`[WearableSync] Persist attempt ${attempt} failed:`, persistRes.status, persistError);

        if (attempt < 2) {
          // brief pause before retry
          await new Promise(r => setTimeout(r, 1500));
        }
      } catch (fetchErr) {
        persistError = fetchErr instanceof Error ? fetchErr.message : 'network_error';
        console.warn(`[WearableSync] Persist attempt ${attempt} threw:`, persistError);
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    }

    // Always save local cache as convenience fallback
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

    if (persistRes?.ok) {
      const result = await persistRes.json();
      console.log('[WearableSync] ✅ DB persist confirmed:', JSON.stringify(result));
      emitIntegrationEvent({
        provider: 'apple-health',
        event: 'sync_success',
        connectionState: 'connected',
        syncState: 'synced',
        meta: { samples: samples.length },
      });
      return {
        success: true,
        permissionGranted: true,
        hasData: true,
        dbPersisted: true,
        connectionState: 'connected',
        syncStatus: 'synced',
        lastSyncAttemptAt: startedAt,
        errorCode: null,
      };
    } else {
      // DB persist failed after retry – report as sync_delayed, NOT success
      const errorCode = `persist_failed:${persistRes?.status ?? 'network'}`;
      console.warn('[WearableSync] ⚠️ DB persist failed after retry:', errorCode, persistError);
      // Offline-first: enqueue payload so the retry orchestrator can flush it later.
      try {
        queueEnqueue('apple-health', {
          samples,
          raw_data: {
            synced_at: new Date().toISOString(),
            total_daily_samples: data.dailySummaries.length,
            queued_from: 'foreground',
          },
        }, errorCode);
      } catch (qerr) {
        console.warn('[WearableSync] queue enqueue failed:', qerr);
      }
      emitIntegrationEvent({
        provider: 'apple-health',
        event: 'sync_partial',
        connectionState: 'sync_delayed',
        syncState: 'sync_delayed',
        errorCode,
        errorMessage: persistError ?? undefined,
      });
      await persistWatchStatus({
        watch_connection_status: 'connected',
        watch_sync_status: 'sync_delayed',
        watch_last_sync_at: startedAt,
        watch_last_sample_at: data.latestSampleDate,
        watch_last_error: errorCode,
        watch_type: 'apple',
      });
      return {
        success: false,
        permissionGranted: true,
        hasData: true,
        dbPersisted: false,
        connectionState: 'sync_delayed',
        syncStatus: 'sync_delayed',
        lastSyncAttemptAt: startedAt,
        errorCode,
      };
    }
  } catch (err) {
    console.error('[WearableSync] ⚠️ Sync error:', err);
    const errorCode = err instanceof Error ? err.message : 'unknown_sync_error';
    emitIntegrationEvent({
      provider: 'apple-health',
      event: 'sync_failed',
      errorCode,
    });
    if (isHealthKitPermissionGranted()) {
      await persistWatchStatus({
        watch_connection_status: 'connected',
        watch_sync_status: 'sync_delayed',
        watch_last_sync_at: startedAt,
        watch_last_error: errorCode,
        watch_type: 'apple',
      });
      return fail({
        permissionGranted: true,
        connectionState: 'sync_delayed',
        syncStatus: 'sync_delayed',
        errorCode,
      });
    }
    return fail({
      connectionState: 'error',
      syncStatus: 'error',
      errorCode,
    });
  }
}
