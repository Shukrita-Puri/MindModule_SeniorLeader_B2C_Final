import { describe, it, expect } from 'vitest';
import { resolveAwaitingSignalsCopy, stripAwaitingLabel } from '@/hooks/useAwaitingSignalsCopy';
import { isMrsVisible } from '@/hooks/useMrsSnapshot';

const calendarOnly = {
  hasCalendar: true,
  hasWearable: false,
  calendarState: 'active',
} as any;

const nothingConnected = {
  hasCalendar: false,
  hasWearable: false,
} as any;

describe('awaiting signals copy parity', () => {
  it('all three cards derive the same string from the same payload', () => {
    for (const payload of [calendarOnly, nothingConnected, undefined]) {
      const mrs = resolveAwaitingSignalsCopy(payload);
      const brief = resolveAwaitingSignalsCopy(payload);
      const plan = resolveAwaitingSignalsCopy(payload);
      expect(brief).toBe(mrs);
      expect(plan).toBe(mrs);
    }
  });

  it('uses the signal-relevant variant', () => {
    expect(resolveAwaitingSignalsCopy(calendarOnly)).toContain('Calendar signal received');
    expect(resolveAwaitingSignalsCopy(nothingConnected).toLowerCase()).toContain('connect your wearable');
  });

  it('does not repeat the Awaiting signals label inside the copy', () => {
    expect(resolveAwaitingSignalsCopy(nothingConnected).toLowerCase()).not.toContain('awaiting signals');
    expect(stripAwaitingLabel('Awaiting signals — connect your wearable.')).toBe(
      'Connect your wearable.',
    );
  });
});

describe('isMrsVisible gate', () => {
  it('is false without a renderable snapshot or live score', () => {
    expect(isMrsVisible(null, null)).toBe(false);
    expect(isMrsVisible({ isRenderable: true, score: null } as any, null)).toBe(false);
    expect(isMrsVisible(undefined, { innerReadinessScore: null })).toBe(false);
  });

  it('is true when the snapshot or the live payload carries a numeric score', () => {
    expect(isMrsVisible({ isRenderable: true, score: 62 } as any, null)).toBe(true);
    expect(isMrsVisible(null, { innerReadinessScore: 71 })).toBe(true);
  });
});
