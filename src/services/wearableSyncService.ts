/**
 * Service to persist HealthKit data to the backend via edge function.
 * Only active on native iOS — no-op on web.
 */
import { isNativeApp, queryHealthKitData, type HealthKitWearableData } from '@/utils/healthKitCapacitor';
import { getAuthToken } from '@/services/authTokenService';
import { saveWearableDataLocally } from '@/services/localDataStore';

/**
 * Query HealthKit and persist the summary to wearable_data via edge function.
 * Safe to call on any platform — returns early on web.
 */
export async function syncHealthKitToBackend(): Promise<boolean> {
  if (!isNativeApp()) return false;

  try {
    const data = await queryHealthKitData();

    // Skip if no HRV data available
    if (data.hrv === null) {
      console.log('[WearableSync] No HealthKit HRV data available, skipping');
      return false;
    }

    const token = await getAuthToken();
    if (!token) {
      console.warn('[WearableSync] No auth token, skipping persist');
      return false;
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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
      // Write-through to local device storage
      saveWearableDataLocally({
        hrv: data.hrv,
        syncedAt: new Date().toISOString(),
        summaryDate: today,
      });
      return true;
    } else {
      console.warn('[WearableSync] ⚠️ Persist failed:', res.status);
      return false;
    }
  } catch (err) {
    console.warn('[WearableSync] ⚠️ Error:', err);
    return false;
  }
}
