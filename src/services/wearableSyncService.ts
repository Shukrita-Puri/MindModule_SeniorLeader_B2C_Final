/**
 * Service to persist HealthKit data to the backend via edge function.
 * Only active on native iOS — no-op on web.
 */
import { isNativeApp, queryHealthKitData, type HealthKitWearableData } from '@/utils/healthKitCapacitor';
import { getAuthToken } from '@/services/authTokenService';

/**
 * Query HealthKit and persist the summary to wearable_data via edge function.
 * Safe to call on any platform — returns early on web.
 */
export async function syncHealthKitToBackend(): Promise<boolean> {
  if (!isNativeApp()) return false;

  try {
    const data = await queryHealthKitData();

    // Skip if all values are null (no data available)
    if (
      data.hrv === null &&
      data.restingHeartRate === null &&
      data.steps === null &&
      data.activeEnergy === null &&
      data.sleepEfficiency === null
    ) {
      console.log('[WearableSync] No HealthKit data available, skipping');
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
          resting_heart_rate: data.restingHeartRate,
          steps: data.steps,
          active_calories: data.activeEnergy,
          // sleepEfficiency from HealthKit doesn't map directly to sleep_score or total_sleep_minutes
          // Store it in raw_data for now
          raw_data: {
            sleep_efficiency: data.sleepEfficiency,
            synced_at: new Date().toISOString(),
          },
        }),
      }
    );

    if (res.ok) {
      console.log('[WearableSync] ✅ HealthKit data persisted for', today);
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
