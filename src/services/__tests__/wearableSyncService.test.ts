import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies BEFORE importing the service under test.
vi.mock('@/utils/healthKitCapacitor', () => ({
  isNativeApp: () => true,
  verifyHealthKitAccess: vi.fn(),
  getHealthKitAccessStatus: vi.fn(),
  queryHealthKitData: vi.fn(),
}));

vi.mock('@/services/authTokenService', () => ({
  getAuthToken: vi.fn(async () => 'test-token'),
}));

vi.mock('@/services/localDataStore', () => ({
  saveWearableDataLocally: vi.fn(),
}));

vi.mock('@/utils/integrationTelemetry', () => ({
  emitIntegrationEvent: vi.fn(),
}));

vi.mock('@/services/syncQueue', () => ({
  enqueue: vi.fn(),
}));

vi.mock('@/utils/integrationQaHelpers', () => ({
  isSimulatedOffline: () => false,
  isSimulatedSyncFailure: () => false,
  consumeSimulatedSyncFailure: () => false,
}));

vi.mock('@/utils/nativeBackgroundSync', () => ({
  forceNativeHealthSync: vi.fn(async () => true),
}));

import {
  verifyHealthKitAccess,
  getHealthKitAccessStatus,
  queryHealthKitData,
} from '@/utils/healthKitCapacitor';
import { forceNativeHealthSync } from '@/utils/nativeBackgroundSync';
import { syncHealthKitToBackend } from '../wearableSyncService';

type FetchCall = {
  url: string;
  body: Record<string, unknown>;
};

function installFetchSpy(
  handler: (body: Record<string, unknown>) => { status: number; body?: unknown },
): FetchCall[] {
  const calls: FetchCall[] = [];
  (globalThis as unknown as { fetch: typeof fetch }).fetch = (async (
    url: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const parsedBody = init?.body ? JSON.parse(init.body as string) : {};
    calls.push({ url: String(url), body: parsedBody });
    const { status, body } = handler(parsedBody);
    return new Response(JSON.stringify(body ?? { success: true }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }) as Response;
  }) as typeof fetch;
  return calls;
}

const okAccess = {
  permissionGranted: true,
  readAuthorized: ['heartRateVariability'],
  readDenied: [],
  temporarilyUnavailable: false,
  explicitDenied: false,
  errorMessage: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  (import.meta as unknown as { env: Record<string, string> }).env =
    (import.meta as unknown as { env: Record<string, string> }).env ?? {};
  (import.meta as unknown as { env: Record<string, string> }).env.VITE_SUPABASE_PROJECT_ID =
    'test-proj';
});

describe('syncHealthKitToBackend – no-data / fallback path', () => {
  it('does NOT persist native_healthkit_fallback_triggered as watch_last_error when HealthKit returns empty', async () => {
    (verifyHealthKitAccess as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (getHealthKitAccessStatus as ReturnType<typeof vi.fn>).mockResolvedValue(okAccess);
    (queryHealthKitData as ReturnType<typeof vi.fn>).mockResolvedValue({
      hrv: null,
      latestSampleDate: null,
      permissionGranted: true,
      readError: null,
      dailySamples: [],
      dailySummaries: [],
    });
    (forceNativeHealthSync as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const calls = installFetchSpy(() => ({ status: 200 }));
    const result = await syncHealthKitToBackend();

    expect(result.connectionState).toBe('connected_but_waiting_for_data');
    expect(result.syncStatus).toBe('waiting_for_data');
    expect(result.errorCode).toBeNull();
    expect(forceNativeHealthSync).toHaveBeenCalledTimes(1);

    // Every update_status call must have watch_last_error explicitly null.
    const statusUpdates = calls.filter((c) => c.body.action === 'update_status');
    expect(statusUpdates.length).toBeGreaterThan(0);
    for (const c of statusUpdates) {
      expect(c.body.watch_last_error ?? null).toBeNull();
    }
    // The final persisted status must be waiting_for_data (not sync_delayed).
    const last = statusUpdates[statusUpdates.length - 1];
    expect(last.body.watch_sync_status).toBe('waiting_for_data');
  });

  it('still returns waiting_for_data (no error) even if native fallback fails to start', async () => {
    (verifyHealthKitAccess as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (getHealthKitAccessStatus as ReturnType<typeof vi.fn>).mockResolvedValue(okAccess);
    (queryHealthKitData as ReturnType<typeof vi.fn>).mockResolvedValue({
      hrv: null,
      latestSampleDate: null,
      permissionGranted: true,
      readError: null,
      dailySamples: [],
      dailySummaries: [],
    });
    (forceNativeHealthSync as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const calls = installFetchSpy(() => ({ status: 200 }));
    const result = await syncHealthKitToBackend();

    expect(result.syncStatus).toBe('waiting_for_data');
    expect(result.errorCode).toBeNull();
    const statusUpdates = calls.filter((c) => c.body.action === 'update_status');
    const last = statusUpdates[statusUpdates.length - 1];
    expect(last.body.watch_sync_status).toBe('waiting_for_data');
    expect(last.body.watch_last_error ?? null).toBeNull();
  });

  it('preserves healthkit_read_failed as a persisted watch_last_error', async () => {
    (verifyHealthKitAccess as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (getHealthKitAccessStatus as ReturnType<typeof vi.fn>).mockResolvedValue(okAccess);
    (queryHealthKitData as ReturnType<typeof vi.fn>).mockResolvedValue({
      hrv: null,
      latestSampleDate: null,
      permissionGranted: true,
      readError: 'read_failed',
      dailySamples: [],
      dailySummaries: [],
    });

    const calls = installFetchSpy(() => ({ status: 200 }));
    const result = await syncHealthKitToBackend();
    expect(result.errorCode).toBe('healthkit_read_failed');
    const statusUpdates = calls.filter((c) => c.body.action === 'update_status');
    const last = statusUpdates[statusUpdates.length - 1];
    expect(last.body.watch_last_error).toBe('healthkit_read_failed');
    expect(last.body.watch_sync_status).toBe('sync_delayed');
  });

  it('marks permission_revoked when verify fails without temporary flag', async () => {
    (verifyHealthKitAccess as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (getHealthKitAccessStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...okAccess,
      permissionGranted: false,
      readAuthorized: [],
      readDenied: ['heartRateVariability'],
      explicitDenied: true,
    });

    const calls = installFetchSpy(() => ({ status: 200 }));
    const result = await syncHealthKitToBackend();
    expect(result.connectionState).toBe('permission_revoked');
    expect(result.errorCode).toBe('healthkit_authorization_revoked');
    const statusUpdates = calls.filter((c) => c.body.action === 'update_status');
    const last = statusUpdates[statusUpdates.length - 1];
    expect(last.body.watch_connection_status).toBe('permission_revoked');
  });

  it('marks synced when real samples are present and persist succeeds', async () => {
    (verifyHealthKitAccess as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (getHealthKitAccessStatus as ReturnType<typeof vi.fn>).mockResolvedValue(okAccess);
    (queryHealthKitData as ReturnType<typeof vi.fn>).mockResolvedValue({
      hrv: 55,
      latestSampleDate: '2026-07-10T00:00:00.000Z',
      permissionGranted: true,
      readError: null,
      dailySamples: [{ date: '2026-07-10', hrv: 55, samples: [] }],
      dailySummaries: [{
        date: '2026-07-10',
        hrv: 55,
        hrvSamples: [],
        restingHeartRate: 60,
        heartRate: 72,
        hrSamples: [],
        totalSleepMinutes: 420,
        deepSleepMinutes: 60,
        remSleepMinutes: 90,
        sleepScore: 88,
      }],
    });

    installFetchSpy(() => ({ status: 200, body: { success: true, inserted: 1 } }));
    const result = await syncHealthKitToBackend();
    expect(result.success).toBe(true);
    expect(result.hasData).toBe(true);
    expect(result.dbPersisted).toBe(true);
    expect(result.syncStatus).toBe('synced');
    expect(result.connectionState).toBe('connected');
    expect(result.errorCode).toBeNull();
  });
});