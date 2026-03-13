/**
 * HealthKit integration via Capacitor for native iOS apps.
 * Uses @capgo/capacitor-health (Capacitor 8 compatible).
 * Gracefully degrades on web — all functions are safe to call in any environment.
 */

export interface HealthKitWearableData {
  hrv: number | null;
  /** ISO date string of the latest HRV sample, or null */
  latestSampleDate: string | null;
  /** True when HealthKit query succeeded (permission granted), regardless of sample count */
  permissionGranted: boolean;
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
      read: ['heartRateVariability'],
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
  const empty: HealthKitWearableData = { hrv: null, latestSampleDate: null, permissionGranted: false };

  if (!isNativeApp()) return empty;

  try {
    const { Health } = await import('@capgo/capacitor-health');
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const hrvRes = await (Health as any).readSamples({
      dataType: 'heartRateVariability',
      startDate: thirtyDaysAgo.toISOString(),
      endDate: now.toISOString(),
      limit: 50,
    });

    const samples = hrvRes?.samples ?? hrvRes?.data ?? [];
    let hrv: number | null = null;
    let latestSampleDate: string | null = null;
    if (Array.isArray(samples) && samples.length > 0) {
      const sorted = [...samples].sort(
        (a: any, b: any) => new Date(b.endDate ?? b.date ?? 0).getTime() - new Date(a.endDate ?? a.date ?? 0).getTime()
      );
      hrv = Number(sorted[0].value);
      if (isNaN(hrv)) hrv = null;
      const sampleDate = sorted[0].endDate ?? sorted[0].date;
      if (sampleDate) latestSampleDate = new Date(sampleDate).toISOString();
    }
    console.log(`[HealthKit] HRV readSamples returned ${samples.length} sample(s), latest: ${hrv}`);

    return { hrv, latestSampleDate, permissionGranted: true };
  } catch (error) {
    console.error('[HealthKit] Query failed:', error);
    return { hrv: null, permissionGranted: false };
  }
}
