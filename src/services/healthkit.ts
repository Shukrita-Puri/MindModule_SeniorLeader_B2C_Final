import { Health } from '@capgo/capacitor-health';

export async function requestHRVPermission() {
  return Health.requestAuthorization({
    read: ['heartRateVariability'],
    write: [],
  });
}

export async function getHRV(days = 7) {
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  return Health.queryAggregated({
    dataType: 'heartRateVariability',
    startDate: startDate.toISOString(),
    endDate: now.toISOString(),
    bucket: 'day',
  });
}
