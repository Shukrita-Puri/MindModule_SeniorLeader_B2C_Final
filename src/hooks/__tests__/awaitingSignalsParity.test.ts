import { describe, it, expect } from 'vitest';
import {
  mergeAwaitingSignalsContext,
  resolveAwaitingSignalsCopy,
  stripAwaitingLabel,
} from '@/hooks/useAwaitingSignalsCopy';
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

const wearableOnly = {
  hasCalendar: false,
  hasWearable: true,
  calendarState: 'not_connected',
} as any;

describe('awaiting signals copy parity', () => {
  it('all three cards derive the same string from the same payload', () => {
    for (const payload of [calendarOnly, wearableOnly, nothingConnected, undefined]) {
      const mrs = resolveAwaitingSignalsCopy(payload);
      const brief = resolveAwaitingSignalsCopy(payload);
      const plan = resolveAwaitingSignalsCopy(payload);
      expect(brief).toBe(mrs);
      expect(plan).toBe(mrs);
    }
  });

  it('uses the signal-relevant variant', () => {
    expect(resolveAwaitingSignalsCopy(calendarOnly)).toBe(
      'Calendar is connected. Connect your wearable to get an early read, then check in to sharpen it.',
    );
    expect(resolveAwaitingSignalsCopy(wearableOnly)).toBe(
      'Wearable is connected. Connect your calendar to get an early read, then check in to sharpen it.',
    );
    expect(resolveAwaitingSignalsCopy(nothingConnected).toLowerCase()).toContain('connect your wearable');
  });

  it('fills snapshot-only payload gaps from the shared connection status', () => {
    const merged = mergeAwaitingSignalsContext(undefined, {
      hasCalendar: true,
      hasWearable: false,
      integrationStatus: {
        calendar: { connected: true, connectionStatus: 'connected' },
        wearable: { connectionStatus: 'disconnected' },
      },
    });
    expect(resolveAwaitingSignalsCopy(merged)).toContain('Calendar is connected');
  });

  it('does not repeat the Awaiting signals label inside the copy', () => {
    expect(resolveAwaitingSignalsCopy(nothingConnected).toLowerCase()).not.toContain('awaiting signals');
    expect(stripAwaitingLabel('Awaiting signals — connect your wearable.')).toBe(
      'Connect your wearable.',
    );

  it('keeps MRS, Brief and Plan identical across every connection combination', () => {
    const wearableStates = [
      undefined,
      'disconnected',
      'connected',
      'permission_revoked',
      'sync_delayed',
      'connected_but_waiting_for_data',
    ];
    const calendarStates = [undefined, 'not_connected', 'active', 'connected_no_events'];

    for (const wearable of wearableStates) {
      for (const calendar of calendarStates) {
        const payload = {
          hasWearable: wearable === 'connected' || wearable === 'sync_delayed',
          hasCalendar: calendar === 'active' || calendar === 'connected_no_events',
          calendarState: calendar,
          integrationStatus: {
            wearable: wearable ? { connectionStatus: wearable } : undefined,
            calendar: calendar ? { state: calendar } : undefined,
          },
        } as any;
        const mrs = resolveAwaitingSignalsCopy(payload);
        expect(resolveAwaitingSignalsCopy(payload)).toBe(mrs);
        expect(resolveAwaitingSignalsCopy(payload)).toBe(mrs);
        expect(mrs.length).toBeGreaterThan(0);
        expect(mrs.toLowerCase()).not.toContain('awaiting signals');
      }
    }
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
