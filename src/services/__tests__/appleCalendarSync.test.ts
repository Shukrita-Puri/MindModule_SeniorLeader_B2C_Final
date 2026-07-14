import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/appleCalendar', () => ({
  isAppleCalendarSupported: () => true,
}));

const forceNativeCalendarSync = vi.fn();
vi.mock('@/utils/nativeBackgroundSync', () => ({
  forceNativeCalendarSync: (...args: unknown[]) => forceNativeCalendarSync(...args),
}));

const emitIntegrationEvent = vi.fn();
vi.mock('@/utils/integrationTelemetry', () => ({
  emitIntegrationEvent: (...args: unknown[]) => emitIntegrationEvent(...args),
}));

import { syncAppleCalendarToBackend } from '@/services/appleCalendarSync';

describe('syncAppleCalendarToBackend', () => {
  beforeEach(() => {
    forceNativeCalendarSync.mockReset();
    emitIntegrationEvent.mockReset();
  });

  it('returns success:true without an invented eventCount when native resolves', async () => {
    forceNativeCalendarSync.mockResolvedValueOnce(undefined);
    const res = await syncAppleCalendarToBackend({ reason: 'manual' });
    expect(res).toEqual({ success: true });
    // No fake zero count in the result.
    expect('eventCount' in res).toBe(false);
    // Telemetry must not fabricate a count either.
    for (const call of emitIntegrationEvent.mock.calls) {
      expect(JSON.stringify(call)).not.toMatch(/"eventCount":\s*0/);
    }
  });

  it('invokes the native bridge exactly once per call', async () => {
    forceNativeCalendarSync.mockResolvedValue(undefined);
    await syncAppleCalendarToBackend({ reason: 'connect' });
    expect(forceNativeCalendarSync).toHaveBeenCalledTimes(1);
  });

  it('returns success:false when the native bridge rejects', async () => {
    forceNativeCalendarSync.mockRejectedValueOnce(new Error('boom'));
    const res = await syncAppleCalendarToBackend({ reason: 'manual' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('boom');
    expect('eventCount' in res).toBe(false);
    expect(emitIntegrationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'sync_failed' }),
    );
  });
});