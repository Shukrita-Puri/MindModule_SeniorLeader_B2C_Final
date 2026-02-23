/**
 * HealthKit integration via Capacitor for native iOS apps.
 * Uses @capgo/capacitor-health (Capacitor 8 compatible).
 * Gracefully degrades on web — all functions are safe to call in any environment.
 */

export interface HealthKitWearableData {
  hrv: number | null;
  restingHeartRate: number | null;
  sleepEfficiency: number | null;
  activeEnergy: number | null;
  steps: number | null;
}

import { Capacitor } from '@capacitor/core';

/** Returns true when running inside the Capacitor native shell */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Request HealthKit read/write permissions.
 * Resolves `true` if granted, `false` if denied or unavailable.
 */
export async function requestHealthKitPermissions(): Promise<boolean> {
  if (!isNativeApp()) return false;

  try {
    const { Health } = await import('@capgo/capacitor-health');

    await Health.requestAuthorization({
      read: [
        'heartRateVariability',
        'restingHeartRate',
        'sleep',
        'calories',
        'steps',
      ],
      write: [],
    });

    console.log('[HealthKit] Permissions granted');
    return true;
  } catch (error) {
    console.error('[HealthKit] Permission request failed:', error);
    return false;
  }
}

/**
 * Query latest HealthKit data (last 24 h).
 * Returns null values for any metric that cannot be read.
 */
export async function queryHealthKitData(): Promise<HealthKitWearableData> {
  const empty: HealthKitWearableData = {
    hrv: null,
    restingHeartRate: null,
    sleepEfficiency: null,
    activeEnergy: null,
    steps: null,
  };

  if (!isNativeApp()) return empty;

  try {
    const { Health } = await import('@capgo/capacitor-health');
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const opts = { startDate: dayAgo.toISOString(), endDate: now.toISOString(), bucket: 'day' as const };

    const [hrvRes, rhrRes, sleepRes, energyRes, stepsRes] = await Promise.allSettled([
      Health.queryAggregated({ ...opts, dataType: 'heartRateVariability' }),
      Health.queryAggregated({ ...opts, dataType: 'restingHeartRate' }),
      Health.queryAggregated({ ...opts, dataType: 'sleep' }),
      Health.queryAggregated({ ...opts, dataType: 'calories' }),
      Health.queryAggregated({ ...opts, dataType: 'steps' }),
    ]);

    const val = (r: PromiseSettledResult<any>) =>
      r.status === 'fulfilled' && r.value?.samples?.length
        ? Number(r.value.samples[0].value)
        : null;

    return {
      hrv: val(hrvRes),
      restingHeartRate: val(rhrRes),
      sleepEfficiency: val(sleepRes),
      activeEnergy: val(energyRes),
      steps: val(stepsRes),
    };
  } catch (error) {
    console.error('[HealthKit] Query failed:', error);
    return empty;
  }
}
