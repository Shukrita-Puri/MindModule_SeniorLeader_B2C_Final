import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getHomeClock,
  syncHomeClock,
  registerHomeClockFlush,
  __setHomeClockState,
} from '@/hooks/useHomeClock';
import { cacheKeys } from '@/utils/persistentBriefCache';

function stateFor(dateISO: string, window: 'morning' | 'afternoon' | 'evening') {
  return { dateISO, window, key: `${dateISO}|${window}` };
}

describe('useHomeClock rollover', () => {
  beforeEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    __setHomeClockState(stateFor('2026-09-02', 'morning'));
  });

  it('computes the correct window mid-lifecycle (update into a live shell)', () => {
    // Shell has been alive since the morning; a JS update lands at 14:00.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T14:00:00'));
    expect(syncHomeClock()).toBe(true);
    expect(getHomeClock()).toMatchObject({ dateISO: '2026-09-02', window: 'afternoon' });
    vi.useRealTimers();
  });

  it('is a no-op inside the same window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T09:00:00'));
    expect(syncHomeClock()).toBe(false);
    vi.useRealTimers();
  });

  it('catches a rollover missed while backgrounded', () => {
    vi.useFakeTimers();
    // No tick fired between 11:00 and 19:00 — iOS suspended the timer.
    vi.setSystemTime(new Date('2026-09-02T19:30:00'));
    expect(syncHomeClock()).toBe(true);
    expect(getHomeClock().window).toBe('evening');
    vi.useRealTimers();
  });

  it('flushes caches before publishing the new state (atomic)', () => {
    const observed: string[] = [];
    const unregister = registerHomeClockFlush((leaving, entering) => {
      // Subscribers must not yet see `entering` while flushes run.
      observed.push(`${leaving.key}->${entering.key}:${getHomeClock().key}`);
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T13:00:00'));
    syncHomeClock();
    vi.useRealTimers();
    unregister();
    expect(observed).toEqual([
      '2026-09-02|morning->2026-09-02|afternoon:2026-09-02|morning',
    ]);
    expect(getHomeClock().key).toBe('2026-09-02|afternoon');
  });

  it('evicts only the leaving window keys', () => {
    const leaving = cacheKeys.planData('2026-09-02', 'morning');
    const staying = cacheKeys.planData('2026-09-02', 'afternoon');
    const otherDay = cacheKeys.planData('2026-09-01', 'evening');
    [leaving, staying, otherDay].forEach((k) =>
      window.localStorage.setItem(k, JSON.stringify({ v: 1, exp: Number.MAX_SAFE_INTEGER })),
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T13:00:00'));
    syncHomeClock();
    vi.useRealTimers();

    expect(window.localStorage.getItem(leaving)).toBeNull();
    expect(window.localStorage.getItem(staying)).not.toBeNull();
    expect(window.localStorage.getItem(otherDay)).not.toBeNull();
  });

  it('crosses the day boundary', () => {
    __setHomeClockState(stateFor('2026-09-02', 'evening'));
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T00:30:00'));
    expect(syncHomeClock()).toBe(true);
    // 00:30 is still the previous "evening" window, but the DATE moved.
    expect(getHomeClock()).toMatchObject({ dateISO: '2026-09-03', window: 'evening' });
    vi.useRealTimers();
  });
});
