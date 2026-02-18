import { CapacitorHealthkit } from '@perfood/capacitor-healthkit';

export async function requestHRVPermission() {
  return CapacitorHealthkit.requestAuthorization({
    all: [],
    read: ['heartRateVariabilitySDNN'],
    write: [],
  });
}

export async function getHRV(days = 7) {
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  return CapacitorHealthkit.queryHKitSampleType({
    sampleName: 'heartRateVariabilitySDNN',
    startDate: startDate.toISOString(),
    endDate: now.toISOString(),
    limit: 10,
  });
}
