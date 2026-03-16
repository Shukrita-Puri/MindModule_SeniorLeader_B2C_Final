/**
 * HealthKit integration via Capacitor for native iOS apps.
 * Uses @capgo/capacitor-health (Capacitor 8 compatible).
 * Gracefully degrades on web — all functions are safe to call in any environment.
 */

export interface HRVDailySample {
  date: string;       // YYYY-MM-DD
  hrv: number;        // daily average HRV (ms)
  samples: { value: number; hour: number; timestamp: string }[];
}

export interface HealthKitWearableData {
  /** Latest single HRV value (backward compat) */
  hrv: number | null;
  /** ISO date string of the latest HRV sample, or null */
  latestSampleDate: string | null;
  /** True when HealthKit query succeeded (permission granted) */
  permissionGranted: boolean;
  /** All daily HRV averages grouped by day (up to 30 days) */
  dailySamples: HRVDailySample[];
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
 * Query last 30 days of HRV data, grouped by day with hour-of-day metadata.
 * Returns all daily samples for baseline computation + the latest single value for backward compat.
 */
export async function queryHealthKitData(): Promise<HealthKitWearableData> {
  const empty: HealthKitWearableData = { hrv: null, latestSampleDate: null, permissionGranted: false, dailySamples: [] };

  if (!isNativeApp()) return empty;

  try {
    const { Health } = await import('@capgo/capacitor-health');
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const hrvRes = await (Health as any).readSamples({
      dataType: 'heartRateVariability',
      startDate: thirtyDaysAgo.toISOString(),
      endDate: now.toISOString(),
      // No limit — fetch all samples for 30-day baseline
    });

    // Diagnostic logging
    console.log('[HealthKit] Raw readSamples response keys:', hrvRes ? Object.keys(hrvRes) : 'null/undefined');
    console.log('[HealthKit] Raw readSamples response:', JSON.stringify(hrvRes).slice(0, 500));

    const samples = hrvRes?.samples ?? hrvRes?.data ?? hrvRes?.results ?? hrvRes?.resultData ?? [];

    if (!Array.isArray(samples) || samples.length === 0) {
      console.log('[HealthKit] No HRV samples in 30-day window');
      return { hrv: null, latestSampleDate: null, permissionGranted: true, dailySamples: [] };
    }

    // Group samples by day (YYYY-MM-DD) and capture hour-of-day
    const dailyMap: Record<string, { value: number; hour: number; timestamp: string }[]> = {};

    for (const sample of samples) {
      const sampleDate = sample.endDate ?? sample.date;
      if (!sampleDate) continue;
      const dt = new Date(sampleDate);
      const dayKey = dt.toISOString().split('T')[0];
      const value = Number(sample.value);
      if (isNaN(value) || value <= 0) continue;

      if (!dailyMap[dayKey]) dailyMap[dayKey] = [];
      dailyMap[dayKey].push({
        value,
        hour: dt.getHours(),
        timestamp: dt.toISOString(),
      });
    }

    // Build daily averages
    const dailySamples: HRVDailySample[] = Object.entries(dailyMap)
      .map(([date, daySamples]) => {
        const avg = daySamples.reduce((sum, s) => sum + s.value, 0) / daySamples.length;
        return { date, hrv: Math.round(avg * 10) / 10, samples: daySamples };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // Latest value for backward compat
    const latest = dailySamples[dailySamples.length - 1];
    const latestHrv = latest?.hrv ?? null;
    const latestDate = latest?.date ? new Date(latest.date).toISOString() : null;

    console.log(`[HealthKit] ${samples.length} raw samples → ${dailySamples.length} daily averages, latest: ${latestHrv}`);

    return {
      hrv: latestHrv,
      latestSampleDate: latestDate,
      permissionGranted: true,
      dailySamples,
    };
  } catch (error) {
    console.error('[HealthKit] Query failed:', error);
    return { hrv: null, latestSampleDate: null, permissionGranted: false, dailySamples: [] };
  }
}
