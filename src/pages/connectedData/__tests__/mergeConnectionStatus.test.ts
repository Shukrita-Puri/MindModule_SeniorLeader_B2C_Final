import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mergeConnectionStatus } from '../mergeConnectionStatus';

type S = {
  oura?: { status?: string; connected?: boolean | null; lastSync?: string | null };
  appleWatch?: { status?: string; connected?: boolean | null; lastSync?: string | null };
  calendar?: { connected?: boolean };
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('mergeConnectionStatus', () => {
  it('returns incoming when prev is null (initial load)', () => {
    const incoming: S = {
      oura: { status: 'error', connected: null },
      appleWatch: { status: 'ok', connected: false },
    };
    const merged = mergeConnectionStatus<S>(null, incoming);
    expect(merged).toEqual(incoming);
  });

  it('preserves prior Oura state on transient oura.status === "error"', () => {
    const prev: S = {
      oura: { status: 'ok', connected: true, lastSync: '2026-07-05T00:00:00Z' },
      appleWatch: { status: 'ok', connected: false },
    };
    const incoming: S = {
      oura: { status: 'error', connected: null },
      appleWatch: { status: 'ok', connected: true, lastSync: '2026-07-05T01:00:00Z' },
    };
    const merged = mergeConnectionStatus<S>(prev, incoming);
    // Errored branch preserved from prev.
    expect(merged.oura).toEqual(prev.oura);
    // Healthy branch updated from incoming.
    expect(merged.appleWatch).toEqual(incoming.appleWatch);
  });

  it('preserves prior Apple Watch state on transient appleWatch.status === "error"', () => {
    const prev: S = {
      oura: { status: 'ok', connected: false },
      appleWatch: { status: 'ok', connected: true, lastSync: '2026-07-05T00:00:00Z' },
    };
    const incoming: S = {
      oura: { status: 'ok', connected: true, lastSync: '2026-07-05T01:00:00Z' },
      appleWatch: { status: 'error', connected: null },
    };
    const merged = mergeConnectionStatus<S>(prev, incoming);
    expect(merged.appleWatch).toEqual(prev.appleWatch);
    expect(merged.oura).toEqual(incoming.oura);
  });

  it('does not preserve when there is no prior branch to preserve (defensive)', () => {
    const prev: S = { calendar: { connected: true } }; // no wearable state yet
    const incoming: S = {
      oura: { status: 'error', connected: null },
      appleWatch: { status: 'error', connected: null },
    };
    const merged = mergeConnectionStatus<S>(prev, incoming);
    expect(merged.oura).toBe(incoming.oura);
    expect(merged.appleWatch).toBe(incoming.appleWatch);
  });

  it('is stable across multiple sequential merges (no stale-closure regression)', () => {
    // Simulates: fetch #1 (healthy connected), fetch #2 (Oura error, Apple healthy),
    // fetch #3 (both healthy). At every step the prev argument is the LATEST
    // committed state — proving the caller must pass the freshest prev.
    let state: S | null = null;

    state = mergeConnectionStatus<S>(state, {
      oura: { status: 'ok', connected: true, lastSync: 't1' },
      appleWatch: { status: 'ok', connected: true, lastSync: 't1' },
    });
    expect(state.oura?.connected).toBe(true);

    state = mergeConnectionStatus<S>(state, {
      oura: { status: 'error', connected: null },
      appleWatch: { status: 'ok', connected: true, lastSync: 't2' },
    });
    // Oura preserved from t1.
    expect(state.oura?.lastSync).toBe('t1');
    expect(state.oura?.connected).toBe(true);
    expect(state.appleWatch?.lastSync).toBe('t2');

    state = mergeConnectionStatus<S>(state, {
      oura: { status: 'ok', connected: false, lastSync: 't3' },
      appleWatch: { status: 'ok', connected: true, lastSync: 't3' },
    });
    // Healthy incoming now wins.
    expect(state.oura?.lastSync).toBe('t3');
    expect(state.oura?.connected).toBe(false);
  });

  it('preserves the calendar branch untouched (only oura/appleWatch are error-guarded here)', () => {
    const prev: S = { calendar: { connected: true }, oura: { status: 'ok', connected: true } };
    const incoming: S = {
      calendar: { connected: false },
      oura: { status: 'error', connected: null },
    };
    const merged = mergeConnectionStatus<S>(prev, incoming);
    expect(merged.calendar).toEqual({ connected: false });
    expect(merged.oura).toEqual(prev.oura);
  });
});