/**
 * Service to persist HealthKit data to the backend via edge function.
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
 * Query HealthKit and persist the summary to wearable_data via edge function.
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
    if (data.hrv === null) {
      console.log('[WearableSync] HealthKit accessible, no HRV samples in window');
      return { success: true, permissionGranted: data.permissionGranted, hasData: false };
    }

    const token = await getAuthToken();
    if (!token) {
      console.warn('[WearableSync] No auth token, skipping persist');
      return { success: false, permissionGranted: data.permissionGranted, hasData: true };
    }

    const summaryDate = data.latestSampleDate
      ? data.latestSampleDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/persist-wearable-data`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary_date: today,
          hrv: data.hrv,
          raw_data: {
            synced_at: new Date().toISOString(),
          },
        }),
      }
    );

    if (res.ok) {
      console.log('[WearableSync] ✅ HealthKit data persisted for', today);
      saveWearableDataLocally({
        hrv: data.hrv,
        syncedAt: new Date().toISOString(),
        summaryDate: today,
      });
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
