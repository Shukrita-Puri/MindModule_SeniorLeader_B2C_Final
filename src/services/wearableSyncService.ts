/**
 * Service to persist HealthKit data to the backend via edge function.
 * Syncs ALL daily HRV samples (up to 30 days) in a single bulk request.
 * Only active on native iOS — no-op on web.
 */
import { isNativeApp, queryHealthKitData, verifyHealthKitAccess, type HealthKitWearableData } from '@/utils/healthKitCapacitor';
import { getAuthToken } from '@/services/authTokenService';
import { saveWearableDataLocally } from '@/services/localDataStore';

const WEARABLE_PERMISSION_KEY = 'healthkit_permission_granted';

/** Mark HealthKit permission as granted in local storage */
export function markHealthKitPermissionGranted(): void {
  try { localStorage.setItem(WEARABLE_PERMISSION_KEY, 'true'); } catch {}
}

/** Check if HealthKit permission was previously granted (local cache only — NOT authoritative) */
export function isHealthKitPermissionGranted(): boolean {
  try { return localStorage.getItem(WEARABLE_PERMISSION_KEY) === 'true'; } catch { return false; }
}

/** Clear HealthKit permission flag (for disconnect) */
export function clearHealthKitPermission(): void {
  try { localStorage.removeItem(WEARABLE_PERMISSION_KEY); } catch {}
}

export type WearableConnectionState = 
  | 'not_connected'
  | 'permission_granted_no_data'
  | 'connected_and_synced'
  | 'reconnect_required';

export interface WearableSyncResult {
  success: boolean;
  permissionGranted: boolean;
  hasData: boolean;
  connectionState: WearableConnectionState;
}

/**
 * Query HealthKit and persist ALL daily summaries to wearable_data via edge function.
 * Returns structured result with explicit connection state.
 */
export async function syncHealthKitToBackend(): Promise<WearableSyncResult> {
  const notConnected: WearableSyncResult = { 
    success: false, permissionGranted: false, hasData: false, connectionState: 'not_connected' 
  };

  if (!isNativeApp()) {
    console.log('[WearableSync] Not native app, skipping sync');
    return notConnected;
  }

  try {
    console.log('[WearableSync] Starting sync — verifying HealthKit access first...');
    
    // Step 1: Verify current HealthKit access (not just cached flag)
    const hasAccess = await verifyHealthKitAccess();
    if (!hasAccess) {
      console.warn('[WearableSync] HealthKit access verification failed — permission likely revoked');
      clearHealthKitPermission(); // Clear stale local flag
      return { success: false, permissionGranted: false, hasData: false, connectionState: 'reconnect_required' };
    }

    console.log('[WearableSync] HealthKit access verified, querying 30-day data...');
    const data = await queryHealthKitData();

    if (data.permissionGranted) {
      markHealthKitPermissionGranted();
    } else {
      console.warn('[WearableSync] queryHealthKitData returned permissionGranted=false despite access check passing');
      clearHealthKitPermission();
      return { success: false, permissionGranted: false, hasData: false, connectionState: 'reconnect_required' };
    }

    // Permission granted but no HRV samples — still a successful connection
    if (data.dailySamples.length === 0) {
      console.log('[WearableSync] HealthKit accessible, no HRV samples in 30-day window');
      return { success: true, permissionGranted: true, hasData: false, connectionState: 'permission_granted_no_data' };
    }

    console.log('[WearableSync] Found', data.dailySamples.length, 'daily HRV samples — persisting to backend...');

    const token = await getAuthToken();
    if (!token) {
      console.warn('[WearableSync] No auth token, skipping persist');
      return { success: false, permissionGranted: true, hasData: true, connectionState: 'permission_granted_no_data' };
    }

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

    // Build bulk payload
    const samples = data.dailySamples.map(ds => ({
      summary_date: ds.date,
      hrv: ds.hrv,
      hrv_samples: ds.samples,
    }));

    console.log('[WearableSync] Sending bulk persist request:', samples.length, 'samples');

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
            total_daily_samples: data.dailySamples.length,
          },
        }),
      }
    );

    if (res.ok) {
      const result = await res.json();
      console.log('[WearableSync] ✅ Bulk persist success:', JSON.stringify(result));
      // Save latest to local store for backward compat
      const latest = data.dailySamples[data.dailySamples.length - 1];
      if (latest) {
        saveWearableDataLocally({
          hrv: latest.hrv,
          syncedAt: new Date().toISOString(),
          summaryDate: latest.date,
        });
      }
      return { success: true, permissionGranted: true, hasData: true, connectionState: 'connected_and_synced' };
    } else {
      const errText = await res.text();
      console.warn('[WearableSync] ⚠️ Persist failed:', res.status, errText);
      return { success: false, permissionGranted: true, hasData: true, connectionState: 'permission_granted_no_data' };
    }
  } catch (err) {
    console.error('[WearableSync] ⚠️ Sync error:', err);
    return { success: false, permissionGranted: false, hasData: false, connectionState: 'not_connected' };
  }
}
