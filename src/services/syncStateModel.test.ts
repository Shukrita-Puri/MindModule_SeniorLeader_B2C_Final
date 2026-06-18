import { describe, expect, it } from 'vitest';
import { deriveSyncState } from './syncStateModel';

describe('deriveSyncState', () => {
  it('marks an old Apple Calendar sync as stale', () => {
    const past = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const state = deriveSyncState({
      backendConnectionState: 'connected',
      backendSyncStatus: 'synced',
      lastSyncAt: past,
      staleThresholdHours: 24,
    });

    expect(state).toBe('stale');
  });

  it('marks a connected provider with no sync as never_synced', () => {
    const state = deriveSyncState({
      backendConnectionState: 'connected',
      backendSyncStatus: 'synced',
      lastSyncAt: null,
    });

    expect(state).toBe('never_synced');
  });
});
