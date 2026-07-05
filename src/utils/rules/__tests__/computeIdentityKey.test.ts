import { describe, it, expect } from 'vitest';
import { computeIdentityKey } from '../calendar-merge';

describe('computeIdentityKey', () => {
  const base = {
    title: 'Weekly Board Sync',
    start_time: '2026-07-06T14:00:00.000Z',
    end_time: '2026-07-06T15:00:00.000Z',
  };

  it('produces the same key for mirrored rows across Apple / Google / Microsoft', () => {
    const apple = computeIdentityKey({ ...base, provider: 'apple' });
    const google = computeIdentityKey({ ...base, provider: 'google' });
    const microsoft = computeIdentityKey({ ...base, provider: 'microsoft' });
    expect(apple).not.toBeNull();
    expect(apple).toBe(google);
    expect(apple).toBe(microsoft);
  });

  it('normalizes title noise (Re:, Accepted:, timezone suffix, brackets)', () => {
    const raw = computeIdentityKey({ ...base, title: 'Weekly Board Sync' });
    const rePrefixed = computeIdentityKey({ ...base, title: 'Re: Weekly Board Sync' });
    const accepted = computeIdentityKey({ ...base, title: 'Accepted: Weekly Board Sync' });
    const tzSuffix = computeIdentityKey({ ...base, title: 'Weekly Board Sync (GMT+1)' });
    const bracketed = computeIdentityKey({ ...base, title: '[External] Weekly Board Sync' });
    expect(rePrefixed).toBe(raw);
    expect(accepted).toBe(raw);
    expect(tzSuffix).toBe(raw);
    expect(bracketed).toBe(raw);
  });

  it('accepts camelCase and snake_case time fields identically', () => {
    const snake = computeIdentityKey({
      title: base.title,
      start_time: base.start_time,
      end_time: base.end_time,
    });
    const camel = computeIdentityKey({
      title: base.title,
      startTime: base.start_time,
      endTime: base.end_time,
    });
    expect(camel).toBe(snake);
  });

  it('returns null when title or times are missing', () => {
    expect(computeIdentityKey({ ...base, title: null })).toBeNull();
    expect(computeIdentityKey({ ...base, title: '   ' })).toBeNull();
    expect(computeIdentityKey({ ...base, start_time: null })).toBeNull();
    expect(computeIdentityKey({ ...base, end_time: 'not-a-date' })).toBeNull();
  });

  it('distinguishes different start times and durations', () => {
    const a = computeIdentityKey(base);
    const shifted = computeIdentityKey({ ...base, start_time: '2026-07-06T14:30:00.000Z', end_time: '2026-07-06T15:30:00.000Z' });
    const longer = computeIdentityKey({ ...base, end_time: '2026-07-06T16:00:00.000Z' });
    expect(a).not.toBe(shifted);
    expect(a).not.toBe(longer);
  });
});