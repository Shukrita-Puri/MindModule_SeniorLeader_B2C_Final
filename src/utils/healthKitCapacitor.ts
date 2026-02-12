/**
 * HealthKit integration via Capacitor for native iOS apps.
 * Gracefully degrades on web — all functions are safe to call in any environment.
 */

export interface HealthKitWearableData {
  hrv: number | null;
  restingHeartRate: number | null;
  sleepEfficiency: number | null;
  activeEnergy: number | null;
  steps: number | null;
}

/** Returns true when running inside the Capacitor native shell */
export function isNativeApp(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform;
}

/**
 * Request HealthKit read/write permissions.
 * Resolves `true` if granted, `false` if denied or unavailable.
 */
export async function requestHealthKitPermissions(): Promise<boolean> {
  if (!isNativeApp()) return false;

  try {
    const { CapacitorHealthkit } = await import('@perfood/capacitor-healthkit');

    const readPermissions = [
      'heartRateVariabilitySDNN',
      'restingHeartRate',
      'sleepAnalysis',
      'activeEnergyBurned',
      'stepCount',
    ];
    const writePermissions = ['mindfulSession'];

    await CapacitorHealthkit.requestAuthorization({
      all: [],
      read: readPermissions,
      write: writePermissions,
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
    const { CapacitorHealthkit } = await import('@perfood/capacitor-healthkit');
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const opts = { startDate: dayAgo.toISOString(), endDate: now.toISOString() };

    const [hrvRes, rhrRes, sleepRes, energyRes, stepsRes] = await Promise.allSettled([
      CapacitorHealthkit.queryHKitSampleType({ ...opts, sampleName: 'heartRateVariabilitySDNN', limit: 1 }),
      CapacitorHealthkit.queryHKitSampleType({ ...opts, sampleName: 'restingHeartRate', limit: 1 }),
      CapacitorHealthkit.queryHKitSampleType({ ...opts, sampleName: 'sleepAnalysis', limit: 0 }),
      CapacitorHealthkit.queryHKitSampleType({ ...opts, sampleName: 'activeEnergyBurned', limit: 0 }),
      CapacitorHealthkit.queryHKitSampleType({ ...opts, sampleName: 'stepCount', limit: 0 }),
    ]);

    const val = (r: PromiseSettledResult<any>) =>
      r.status === 'fulfilled' && r.value?.resultData?.length
        ? Number(r.value.resultData[0].value)
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
