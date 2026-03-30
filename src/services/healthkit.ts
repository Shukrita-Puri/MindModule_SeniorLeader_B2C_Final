import { Capacitor } from '@capacitor/core';

export async function requestHRVPermission() {
  if (!Capacitor.isNativePlatform()) {
    console.warn('[HealthKit] Not on native platform, skipping');
    return;
  }
  const { Health } = await import('@capgo/capacitor-health');
  return Health.requestAuthorization({
    read: ['heartRateVariability', 'restingHeartRate', 'heartRate', 'sleep'],
    write: [],
  });
}

export async function getHRV(days = 7) {
  if (!Capacitor.isNativePlatform()) {
    console.warn('[HealthKit] Not on native platform, skipping');
    return { samples: [] };
  }
  const { Health } = await import('@capgo/capacitor-health');
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const res = await (Health as any).readSamples({
    dataType: 'heartRateVariability',
    startDate: startDate.toISOString(),
    endDate: now.toISOString(),
    limit: 100,
  });

  return { samples: res?.samples ?? res?.data ?? [] };
}
