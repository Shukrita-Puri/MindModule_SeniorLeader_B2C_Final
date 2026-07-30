import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config/devMode', () => ({
  DEV_MODE: false,
  DEV_USER: { id: 'dev-user' },
}));

vi.mock('@/services/authTokenService', () => ({
  getAuthToken: vi.fn().mockResolvedValue('auth-token'),
}));

const mockInvoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    from: vi.fn(),
  },
}));

import { saveCheckin } from '@/utils/dailyCheckins';

beforeEach(() => {
  mockInvoke.mockReset();
  if (typeof window !== 'undefined') {
    window.localStorage?.clear();
  }
});

describe('W4 — saveCheckin atomic persistence', () => {
  it('sends all four slider dimensions in a single SAVE_CHECKIN request', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        data: {
          id: 'row-1',
          checkin_date: '2026-07-17',
          time_window: 'morning',
          outcome: 'steady',
          clarity_level: 4,
          emotion_level: 3,
          pressure_level: 2,
          regulation_level: 5,
        },
      },
      error: null,
    });

    const result = await saveCheckin({
      checkin_date: '2026-07-17',
      time_window: 'morning',
      outcome: 'steady',
      skipped: false,
      timestamp: '2026-07-17T09:00:00.000Z',
      state_tags: ['calm'],
      clarity_level: 4,
      emotion_level: 3,
      pressure_level: 2,
      regulation_level: 5,
      data_sources: { check_in: true },
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [fn, opts] = mockInvoke.mock.calls[0];
    expect(fn).toBe('daily-checkins');
    const body = (opts as { body: { action: string; checkinData: Record<string, unknown> } }).body;
    expect(body.action).toBe('SAVE_CHECKIN');
    expect(body.checkinData).toMatchObject({
      clarity_level: 4,
      emotion_level: 3,
      pressure_level: 2,
      regulation_level: 5,
    });
    // Never fabricate confidence_level from clarity.
    expect(body.checkinData.confidence_level).toBeUndefined();
    expect(result?.id).toBe('row-1');
  });

  it('never copies clarity_level into confidence_level', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { data: { id: 'row-2' } }, error: null });

    await saveCheckin({
      checkin_date: '2026-07-17',
      time_window: 'morning',
      outcome: 'steady',
      skipped: false,
      timestamp: '2026-07-17T09:00:00.000Z',
      clarity_level: 5,
      emotion_level: 5,
      pressure_level: 5,
      regulation_level: 5,
    });

    const body = (mockInvoke.mock.calls[0][1] as { body: { checkinData: Record<string, unknown> } }).body;
    expect(body.checkinData.confidence_level).toBeUndefined();
  });
});
