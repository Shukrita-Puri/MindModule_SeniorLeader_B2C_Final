/**
 * Service to persist HealthKit data to the backend via edge function.
 * Syncs ALL daily HRV samples (up to 30 days) in a single bulk request.
 * Only active on native iOS — no-op on web.
 */
import { isNativeApp, queryHealthKitData, type HealthKitWearableData } from '@/utils/healthKitCapacitor';
import { getAuthToken } from '@/services/authTokenService';
import { saveWearableDataLocally } from '@/services/localDataStore';

const WEARABLE_PERMISSION_KEY = 'healthkit_permission_granted';

/** Mark HealthKit permission as granted in local storage */
export function markHealthKitPermissionGranted(): void {
  try { localStorage.setItem(WEARABLE_PERMISSION_KEY, 'true'); } catch {}
}

/** Check if HealthKit permission was previously granted */
export function isHealthKitPermissionGranted(): boolean {
  try { return localStorage.getItem(WEARABLE_PERMISSION_KEY) === 'true'; } catch { return false; }
}

/** Clear HealthKit permission flag (for disconnect) */
export function clearHealthKitPermission(): void {
  try { localStorage.removeItem(WEARABLE_PERMISSION_KEY); } catch {}
}

export interface WearableSyncResult {
  success: boolean;
  permissionGranted: boolean;
  hasData: boolean;
}

/**
 * Query HealthKit and persist ALL daily summaries to wearable_data via edge function.
 * Returns structured result distinguishing permission state from data availability.
 */
export async function syncHealthKitToBackend(): Promise<WearableSyncResult> {
  if (!isNativeApp()) return { success: false, permissionGranted: false, hasData: false };

  try {
    const data = await queryHealthKitData();

    if (data.permissionGranted) {
      markHealthKitPermissionGranted();
    }

    // Permission granted but no HRV samples — still a successful connection
    if (data.dailySamples.length === 0) {
      console.log('[WearableSync] HealthKit accessible, no HRV samples in 30-day window. permissionGranted:', data.permissionGranted);
      return { success: true, permissionGranted: data.permissionGranted, hasData: false };
    }

    console.log('[WearableSync] Found', data.dailySamples.length, 'daily HRV samples — proceeding to bulk persist');

    const token = await getAuthToken();
    if (!token) {
      console.warn('[WearableSync] No auth token, skipping persist');
      return { success: false, permissionGranted: data.permissionGranted, hasData: true };
    }

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

    // Build bulk payload: array of daily samples with hrv_samples JSONB
    const samples = data.dailySamples.map(ds => ({
      summary_date: ds.date,
      hrv: ds.hrv,
      hrv_samples: ds.samples, // [{value, hour, timestamp}]
    }));

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
      console.log('[WearableSync] ✅ Bulk HRV data persisted:', data.dailySamples.length, 'days');
      // Save latest to local store for backward compat
      const latest = data.dailySamples[data.dailySamples.length - 1];
      if (latest) {
        saveWearableDataLocally({
          hrv: latest.hrv,
          syncedAt: new Date().toISOString(),
          summaryDate: latest.date,
        });
      }
      return { success: true, permissionGranted: true, hasData: true };
    } else {
      console.warn('[WearableSync] ⚠️ Persist failed:', res.status);
      return { success: false, permissionGranted: true, hasData: true };
    }
  } catch (err) {
    console.warn('[WearableSync] ⚠️ Error:', err);
    return { success: false, permissionGranted: false, hasData: false };
  }
}
