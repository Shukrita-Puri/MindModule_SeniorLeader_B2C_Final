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
  /** Read path failed even though permission is still granted */
  readError: 'authorization_denied' | 'read_failed' | null;
  /** All daily HRV averages grouped by day (up to 30 days) */
  dailySamples: HRVDailySample[];
}

import { Capacitor } from '@capacitor/core';

const HEALTHKIT_READ_TYPES = ['heartRateVariability'] as const;

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
 * 
 * IMPORTANT: On iOS, requestAuthorization() resolves even if user denies.
 * We verify actual access by checking HealthKit authorization status afterward.
 */
export async function requestHealthKitPermissions(): Promise<boolean> {
  if (!isNativeApp()) {
    console.log('[HealthKit] Not native platform, skipping permission request');
    return false;
  }

  try {
    const { Health } = await import('@capgo/capacitor-health');

    console.log('[HealthKit] Requesting authorization for heartRateVariability...');
    const authResult = await Health.requestAuthorization({
      read: [...HEALTHKIT_READ_TYPES],
      write: [],
    });
    console.log('[HealthKit] requestAuthorization() result:', JSON.stringify(authResult));

    const verified = await verifyHealthKitAccess();
    console.log('[HealthKit] Permission verification result:', verified);
    return verified;
  } catch (error) {
    console.error('[HealthKit] Permission request threw error:', error);
    return false;
  }
}

export async function getHealthKitAuthorization(): Promise<{
  permissionGranted: boolean;
  readAuthorized: string[];
  readDenied: string[];
}> {
  if (!isNativeApp()) {
    return { permissionGranted: false, readAuthorized: [], readDenied: [...HEALTHKIT_READ_TYPES] };
  }

  try {
    const { Health } = await import('@capgo/capacitor-health');
    const status = await Health.checkAuthorization({
      read: [...HEALTHKIT_READ_TYPES],
      write: [],
    });

    const readAuthorized = status.readAuthorized ?? [];
    const readDenied = status.readDenied ?? [];
    const permissionGranted = HEALTHKIT_READ_TYPES.every((type) => readAuthorized.includes(type));

    console.log('[HealthKit] checkAuthorization:', JSON.stringify({ readAuthorized, readDenied, permissionGranted }));
    return { permissionGranted, readAuthorized, readDenied };
  } catch (error) {
    console.error('[HealthKit] checkAuthorization failed:', error);
    return { permissionGranted: false, readAuthorized: [], readDenied: [...HEALTHKIT_READ_TYPES] };
  }
}

/**
 * Verify that HealthKit HRV permission is actually granted.
 * Uses HealthKit authorization status instead of sample freshness.
 */
export async function verifyHealthKitAccess(): Promise<boolean> {
  if (!isNativeApp()) return false;

  try {
    const authorization = await getHealthKitAuthorization();
    return authorization.permissionGranted;
  } catch (error) {
    console.error('[HealthKit] Verification read failed (permission likely denied):', error);
    return false;
  }
}

/**
 * Query last 30 days of HRV data, grouped by day with hour-of-day metadata.
 * Returns all daily samples for baseline computation + the latest single value for backward compat.
 */
export async function queryHealthKitData(): Promise<HealthKitWearableData> {
  const empty: HealthKitWearableData = {
    hrv: null,
    latestSampleDate: null,
    permissionGranted: false,
    readError: 'authorization_denied',
    dailySamples: [],
  };

  if (!isNativeApp()) return empty;

  try {
    const authorization = await getHealthKitAuthorization();
    if (!authorization.permissionGranted) {
      console.warn('[HealthKit] queryHealthKitData aborted: authorization not granted');
      return empty;
    }

    const { Health } = await import('@capgo/capacitor-health');
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    console.log('[HealthKit] queryHealthKitData: reading 30-day HRV window...');

    const hrvRes = await Health.readSamples({
      dataType: 'heartRateVariability',
      startDate: thirtyDaysAgo.toISOString(),
      endDate: now.toISOString(),
      // No limit — fetch all samples for 30-day baseline
    });

    // Diagnostic logging
    console.log('[HealthKit] Raw readSamples response keys:', hrvRes ? Object.keys(hrvRes) : 'null/undefined');
    console.log('[HealthKit] Raw readSamples response:', JSON.stringify(hrvRes).slice(0, 500));

    const rawRes = hrvRes as any;
    const samples = rawRes?.samples ?? rawRes?.data ?? rawRes?.results ?? rawRes?.resultData ?? [];

    if (!Array.isArray(samples) || samples.length === 0) {
      console.log('[HealthKit] No HRV samples in 30-day window (permission granted, no data)');
      return { hrv: null, latestSampleDate: null, permissionGranted: true, readError: null, dailySamples: [] };
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
      readError: null,
      dailySamples,
    };
  } catch (error) {
    console.error('[HealthKit] Query failed:', error);
    return { hrv: null, latestSampleDate: null, permissionGranted: true, readError: 'read_failed', dailySamples: [] };
  }
}
