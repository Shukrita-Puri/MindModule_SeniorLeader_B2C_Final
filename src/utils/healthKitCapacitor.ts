/**
 * HealthKit integration via Capacitor for native iOS apps.
 * Uses @capgo/capacitor-health (Capacitor 8 compatible).
 * Gracefully degrades on web – all functions are safe to call in any environment.
 *
 * Reads: HRV, Resting Heart Rate, Heart Rate, Sleep Analysis
 */

export interface HRVDailySample {
  date: string;       // YYYY-MM-DD
  hrv: number;        // daily average HRV (ms)
  samples: { value: number; hour: number; timestamp: string }[];
}

export interface DailyWearableSummary {
  date: string;                          // YYYY-MM-DD
  hrv: number | null;                    // daily average HRV (ms)
  hrvSamples: { value: number; hour: number; timestamp: string }[];
  restingHeartRate: number | null;       // daily average RHR (bpm)
  heartRate: number | null;              // daily average HR (bpm)
  /** Per-sample HR readings for the day (true event-window peak source). */
  hrSamples: { t: string; v: number }[];
  totalSleepMinutes: number | null;      // total sleep duration
  deepSleepMinutes: number | null;       // deep sleep stage
  remSleepMinutes: number | null;        // REM sleep stage
  sleepScore: number | null;             // computed sleep efficiency 0-100
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
  /** All daily HRV averages grouped by day (up to 30 days) – backward compat */
  dailySamples: HRVDailySample[];
  /** Enriched daily summaries with all metrics */
  dailySummaries: DailyWearableSummary[];
}

import { Capacitor } from '@capacitor/core';

const HEALTHKIT_READ_TYPES = [
  'heartRateVariability',
  'restingHeartRate',
  'heartRate',
  'sleep',
] as const;

interface HealthReader {
  readSamples(opts: { dataType: string; startDate: string; endDate: string }): Promise<unknown>;
}

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
  if (!isNativeApp()) {
    console.log('[HealthKit] Not native platform, skipping permission request');
    return false;
  }

  try {
    const { Health } = await import('@capgo/capacitor-health');

    console.log('[HealthKit] Requesting authorization for:', HEALTHKIT_READ_TYPES.join(', '));
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
    const message = error instanceof Error ? error.message : String(error);
    if (/entitlement|healthkit|unavailable|not available/i.test(message)) {
      console.error('[HealthKit] Developer configuration issue: HealthKit may be unavailable or the app may be missing the HealthKit entitlement.', {
        error: message,
      });
    }
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
    // HRV is the minimum required metric – others are optional
    const permissionGranted = readAuthorized.includes('heartRateVariability');

    console.log('[HealthKit] checkAuthorization:', JSON.stringify({ readAuthorized, readDenied, permissionGranted }));
    return { permissionGranted, readAuthorized, readDenied };
  } catch (error) {
    console.error('[HealthKit] checkAuthorization failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (/entitlement|healthkit|unavailable|not available/i.test(message)) {
      console.error('[HealthKit] Developer configuration issue: HealthKit authorization check failed because HealthKit may be unavailable or missing entitlement.', {
        error: message,
      });
    }
    return { permissionGranted: false, readAuthorized: [], readDenied: [...HEALTHKIT_READ_TYPES] };
  }
}

/**
 * Verify that HealthKit HRV permission is actually granted.
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

/** Safe read helper – returns empty array if metric is not authorized or read fails */
async function safeReadSamples(
  Health: HealthReader,
  dataType: string,
  startDate: string,
  endDate: string,
  label: string,
): Promise<Record<string, unknown>[]> {
  try {
    const res = await Health.readSamples({ dataType, startDate, endDate });
    const raw = res as Record<string, unknown> | null;
    const samples = raw?.samples ?? raw?.data ?? raw?.results ?? raw?.resultData ?? [];
    console.log(`[HealthKit] ${label}: ${Array.isArray(samples) ? samples.length : 0} samples`);
    return Array.isArray(samples) ? samples as Record<string, unknown>[] : [];
  } catch (err) {
    console.warn(`[HealthKit] ${label} read failed (non-fatal):`, err);
    return [];
  }
}

/**
 * Query last 30 days of HRV, RHR, HR, and Sleep data.
 * Groups by day and returns enriched daily summaries.
 */
export async function queryHealthKitData(): Promise<HealthKitWearableData> {
  const empty: HealthKitWearableData = {
    hrv: null,
    latestSampleDate: null,
    permissionGranted: false,
    readError: 'authorization_denied',
    dailySamples: [],
    dailySummaries: [],
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
    const startISO = thirtyDaysAgo.toISOString();
    const endISO = now.toISOString();

    console.log('[HealthKit] queryHealthKitData: reading 30-day window for all metrics...');

    // Read all metrics in parallel – each one is fault-tolerant
    const [hrvSamples, rhrSamples, hrSamples, sleepSamples] = await Promise.all([
      safeReadSamples(Health, 'heartRateVariability', startISO, endISO, 'HRV'),
      safeReadSamples(Health, 'restingHeartRate', startISO, endISO, 'RHR'),
      safeReadSamples(Health, 'heartRate', startISO, endISO, 'HR'),
      safeReadSamples(Health, 'sleep', startISO, endISO, 'Sleep'),
    ]);

    console.log(`[HealthKit] Raw counts – HRV: ${hrvSamples.length}, RHR: ${rhrSamples.length}, HR: ${hrSamples.length}, Sleep: ${sleepSamples.length}`);

    // ---- Group HRV by day ----
    const hrvByDay: Record<string, { value: number; hour: number; timestamp: string }[]> = {};
    for (const s of hrvSamples) {
      const sDate = s.endDate ?? s.date;
      if (!sDate) continue;
      const dt = new Date(sDate);
      const dayKey = dt.toISOString().split('T')[0];
      const value = Number(s.value);
      if (isNaN(value) || value <= 0) continue;
      if (!hrvByDay[dayKey]) hrvByDay[dayKey] = [];
      hrvByDay[dayKey].push({ value, hour: dt.getHours(), timestamp: dt.toISOString() });
    }

    // ---- Group RHR by day (average) ----
    const rhrByDay: Record<string, number[]> = {};
    for (const s of rhrSamples) {
      const sDate = s.endDate ?? s.date;
      if (!sDate) continue;
      const dayKey = new Date(sDate).toISOString().split('T')[0];
      const value = Number(s.value);
      if (isNaN(value) || value <= 0) continue;
      if (!rhrByDay[dayKey]) rhrByDay[dayKey] = [];
      rhrByDay[dayKey].push(value);
    }

    // ---- Group HR by day (average) ----
    const hrByDay: Record<string, number[]> = {};
    // Per-sample HR for true event-window peaks (used by cause-effect engine).
    const hrSamplesByDay: Record<string, { t: string; v: number }[]> = {};
    for (const s of hrSamples) {
      const sDate = s.endDate ?? s.date;
      if (!sDate) continue;
      const dayKey = new Date(sDate).toISOString().split('T')[0];
      const value = Number(s.value);
      if (isNaN(value) || value <= 0) continue;
      if (!hrByDay[dayKey]) hrByDay[dayKey] = [];
      hrByDay[dayKey].push(value);
      const startISO = s.startDate ?? s.date ?? sDate;
      if (!hrSamplesByDay[dayKey]) hrSamplesByDay[dayKey] = [];
      hrSamplesByDay[dayKey].push({ t: new Date(startISO).toISOString(), v: Math.round(value) });
    }

    // ---- Group Sleep by day ----
    // @capgo/capacitor-health emits one sample per state region.
    // iOS emits two parallel streams:
    //   (a) per-stage: 'deep' | 'rem' | 'light' | 'core' | 'awake'  (Apple Watch w/ stages)
    //   (b) umbrella: 'asleep' | 'inBed'                            (older devices / iPhone-only)
    // Bug: the prior aggregator double-counted when both streams existed because 'asleep'
    // overlaps with deep+rem+light. Fix: bucket per-stage and umbrella separately,
    // then prefer per-stage total when present, else fall back to umbrella 'asleep'.
    interface SleepBucket {
      perStageMinutes: number;   // deep + rem + light + core (excl. awake)
      asleepUmbrellaMinutes: number; // 'asleep'
      deepMinutes: number;
      remMinutes: number;
      inBedMinutes: number;
    }
    const sleepByDay: Record<string, SleepBucket> = {};
    for (const s of sleepSamples) {
      const startDate = s.startDate ?? s.date;
      const endDate = s.endDate ?? s.date;
      if (!startDate || !endDate) continue;
      // Attribute to wake-up day (end of sleep block)
      const dayKey = new Date(endDate).toISOString().split('T')[0];
      const durationMs = new Date(endDate).getTime() - new Date(startDate).getTime();
      const durationMin = Math.round(durationMs / 60000);
      if (durationMin <= 0) continue;

      if (!sleepByDay[dayKey]) {
        sleepByDay[dayKey] = {
          perStageMinutes: 0,
          asleepUmbrellaMinutes: 0,
          deepMinutes: 0,
          remMinutes: 0,
          inBedMinutes: 0,
        };
      }
      const bucket = sleepByDay[dayKey];
      const state = (s.sleepState ?? s.value ?? s.category ?? '').toString().toLowerCase();

      if (state.includes('deep')) {
        bucket.deepMinutes += durationMin;
        bucket.perStageMinutes += durationMin;
      } else if (state.includes('rem')) {
        bucket.remMinutes += durationMin;
        bucket.perStageMinutes += durationMin;
      } else if (state.includes('core') || state.includes('light')) {
        bucket.perStageMinutes += durationMin;
      } else if (state.includes('asleepunspecified') || state === 'asleep') {
        // umbrella – only used as a fallback when per-stage data is absent
        bucket.asleepUmbrellaMinutes += durationMin;
      } else if (state.includes('inbed') || state.includes('in_bed') || state === 'inbed') {
        bucket.inBedMinutes += durationMin;
      }
      // 'awake' periods are intentionally excluded from total sleep.
    }

    // ---- Merge all days ----
    const allDays = new Set([
      ...Object.keys(hrvByDay),
      ...Object.keys(rhrByDay),
      ...Object.keys(hrByDay),
      ...Object.keys(sleepByDay),
    ]);

    const dailySummaries: DailyWearableSummary[] = [];
    const dailySamples: HRVDailySample[] = []; // backward compat

    for (const day of Array.from(allDays).sort()) {
      const hrvDay = hrvByDay[day];
      const rhrDay = rhrByDay[day];
      const hrDay = hrByDay[day];
      const sleepDay = sleepByDay[day];

      const hrvAvg = hrvDay ? Math.round((hrvDay.reduce((s, v) => s + v.value, 0) / hrvDay.length) * 10) / 10 : null;
      const rhrAvg = rhrDay ? Math.round(rhrDay.reduce((s, v) => s + v, 0) / rhrDay.length) : null;
      const hrAvg = hrDay ? Math.round(hrDay.reduce((s, v) => s + v, 0) / hrDay.length) : null;

      // Prefer per-stage total when present (modern Apple Watch); fall back to 'asleep' umbrella otherwise.
      // This avoids double-counting the same sleep block from both data streams.
      let totalSleep: number | null = null;
      if (sleepDay) {
        if (sleepDay.perStageMinutes > 0) {
          totalSleep = sleepDay.perStageMinutes;
        } else if (sleepDay.asleepUmbrellaMinutes > 0) {
          totalSleep = sleepDay.asleepUmbrellaMinutes;
        }
      }
      const deepSleep = sleepDay?.deepMinutes ?? null;
      const remSleep = sleepDay?.remMinutes ?? null;
      const inBed = sleepDay?.inBedMinutes ?? null;

      // Simple sleep efficiency: asleep / (asleep + inBed) * 100
      let sleepScore: number | null = null;
      if (totalSleep !== null && inBed !== null && (totalSleep + inBed) > 0) {
        sleepScore = Math.round((totalSleep / (totalSleep + inBed)) * 100);
      } else if (totalSleep !== null && totalSleep > 0) {
        // No inBed data – estimate based on duration (7-9h = 85-95)
        const hours = totalSleep / 60;
        sleepScore = hours >= 7 ? Math.min(95, Math.round(70 + hours * 3)) : Math.max(30, Math.round(hours * 10));
      }

      dailySummaries.push({
        date: day,
        hrv: hrvAvg,
        hrvSamples: hrvDay ?? [],
        restingHeartRate: rhrAvg,
        heartRate: hrAvg,
        hrSamples: hrSamplesByDay[day] ?? [],
        totalSleepMinutes: totalSleep,
        deepSleepMinutes: deepSleep,
        remSleepMinutes: remSleep,
        sleepScore,
      });

      // Backward compat dailySamples (HRV-only)
      if (hrvAvg !== null && hrvDay) {
        dailySamples.push({ date: day, hrv: hrvAvg, samples: hrvDay });
      }
    }

    // Latest value for backward compat
    const latestHrvDay = dailySamples[dailySamples.length - 1];
    const latestHrv = latestHrvDay?.hrv ?? null;
    const latestDate = latestHrvDay?.date ? new Date(latestHrvDay.date).toISOString() : null;

    const hasAnyData = dailySummaries.length > 0;

    console.log(`[HealthKit] ${dailySummaries.length} daily summaries created (${dailySamples.length} with HRV)`);

    if (!hasAnyData) {
      return { hrv: null, latestSampleDate: null, permissionGranted: true, readError: null, dailySamples: [], dailySummaries: [] };
    }

    return {
      hrv: latestHrv,
      latestSampleDate: latestDate,
      permissionGranted: true,
      readError: null,
      dailySamples,
      dailySummaries,
    };
  } catch (error) {
    console.error('[HealthKit] Query failed:', error);
    return { hrv: null, latestSampleDate: null, permissionGranted: true, readError: 'read_failed', dailySamples: [], dailySummaries: [] };
  }
}
