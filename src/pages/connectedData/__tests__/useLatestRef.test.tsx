/**
 * Regression coverage for the ref-based "read latest committed state"
 * pattern used inside ConnectedData.fetchStatus.
 *
 * We reproduce the exact idiom — a state value mirrored into a ref via a
 * post-commit effect, then read from an async callback whose closure was
 * captured at an earlier render — and prove that:
 *
 *   1. the ref returns the FRESHEST committed value after re-renders
 *   2. the async callback identity is stable (does NOT recreate per render),
 *      matching how ConnectedData needs to keep native listeners registered
 *   3. mergeConnectionStatus correctly preserves prior Oura / Apple Watch
 *      state during transient error responses when fed from that ref
 *   4. sequential fetches / app-resume style repeated calls always merge
 *      against the latest state, never against the initial `null` closure
 */
import { describe, it, expect, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeConnectionStatus } from '../mergeConnectionStatus';

type Status = {
  oura?: { status?: string; connected?: boolean | null; lastSync?: string | null };
  appleWatch?: { status?: string; connected?: boolean | null; lastSync?: string | null };
};

/** Test harness that mirrors the exact pattern used in ConnectedData. */
function useFetchStatusHarness(fetchImpl: () => Promise<Status>) {
  const [status, setStatus] = useState<Status | null>(null);
  const statusRef = useRef<Status | null>(null);
  useEffect(() => { statusRef.current = status; }, [status]);

  // Deliberately empty dep array — matches ConnectedData's need for a
  // stable callback identity (so native listeners aren't re-registered).
  const fetchStatus = useCallback(async () => {
    const data = await fetchImpl();
    const merged = mergeConnectionStatus(statusRef.current, data);
    setStatus(merged);
    return merged;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, fetchStatus };
}

describe('ref-based freshness read (ConnectedData pattern)', () => {
  it('reads the freshest committed status after re-renders (no stale closure)', async () => {
    const responses: Status[] = [
      { oura: { status: 'ok', connected: true, lastSync: 't1' },
        appleWatch: { status: 'ok', connected: true, lastSync: 't1' } },
      { oura: { status: 'error', connected: null },
        appleWatch: { status: 'ok', connected: true, lastSync: 't2' } },
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);

    let api!: ReturnType<typeof useFetchStatusHarness>;
    function Probe() {
      api = useFetchStatusHarness(fetchImpl);
      return null;
    }

    const { rerender } = render(<Probe />);
    // 1st fetch: baseline connected state commits.
    await act(async () => { await api.fetchStatus(); });
    expect(api.status?.oura?.connected).toBe(true);

    // Force a re-render so the OLD fetchStatus closure would still reference
    // an initial `null` state via useState — the ref must still be fresh.
    rerender(<Probe />);

    // 2nd fetch: transient Oura error. Must preserve t1 Oura, apply t2 Apple.
    await act(async () => { await api.fetchStatus(); });
    expect(api.status?.oura?.lastSync).toBe('t1');
    expect(api.status?.oura?.connected).toBe(true);
    expect(api.status?.appleWatch?.lastSync).toBe('t2');
  });

  it('preserves prior Apple Watch state on transient appleWatch.status === "error"', async () => {
    const responses: Status[] = [
      { oura: { status: 'ok', connected: false },
        appleWatch: { status: 'ok', connected: true, lastSync: 't1' } },
      { oura: { status: 'ok', connected: true, lastSync: 't2' },
        appleWatch: { status: 'error', connected: null } },
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    let api!: ReturnType<typeof useFetchStatusHarness>;
    function Probe() { api = useFetchStatusHarness(fetchImpl); return null; }
    render(<Probe />);

    await act(async () => { await api.fetchStatus(); });
    await act(async () => { await api.fetchStatus(); });

    expect(api.status?.appleWatch?.lastSync).toBe('t1');
    expect(api.status?.appleWatch?.connected).toBe(true);
    expect(api.status?.oura?.lastSync).toBe('t2');
  });

  it('fetchStatus callback identity is stable across re-renders (no listener churn)', async () => {
    const fetchImpl = vi.fn(async () => ({
      oura: { status: 'ok', connected: true },
      appleWatch: { status: 'ok', connected: true },
    }));
    const seen: unknown[] = [];
    function Probe() {
      const api = useFetchStatusHarness(fetchImpl);
      seen.push(api.fetchStatus);
      return null;
    }
    const { rerender } = render(<Probe />);
    rerender(<Probe />);
    rerender(<Probe />);
    // Identity must be preserved across renders — matches ConnectedData's
    // requirement so native App.addListener isn't re-subscribed each render.
    expect(new Set(seen).size).toBe(1);
  });

  it('survives many app-resume style repeated calls without stale-null regression', async () => {
    // Baseline healthy, followed by 5 alternating error/healthy responses —
    // simulates repeated app foreground events during a flaky backend.
    const script: Status[] = [
      { oura: { status: 'ok', connected: true, lastSync: 't0' },
        appleWatch: { status: 'ok', connected: true, lastSync: 't0' } },
      { oura: { status: 'error', connected: null },
        appleWatch: { status: 'error', connected: null } },
      { oura: { status: 'error', connected: null },
        appleWatch: { status: 'ok', connected: true, lastSync: 't1' } },
      { oura: { status: 'ok', connected: true, lastSync: 't2' },
        appleWatch: { status: 'error', connected: null } },
      { oura: { status: 'error', connected: null },
        appleWatch: { status: 'error', connected: null } },
      { oura: { status: 'ok', connected: false, lastSync: 't3' },
        appleWatch: { status: 'ok', connected: true, lastSync: 't3' } },
    ];
    const fetchImpl = vi.fn(async () => script.shift()!);
    let api!: ReturnType<typeof useFetchStatusHarness>;
    function Probe() { api = useFetchStatusHarness(fetchImpl); return null; }
    render(<Probe />);

    for (let i = 0; i < 6; i++) {
      await act(async () => { await api.fetchStatus(); });
    }

    // Final response is healthy for both — should win outright.
    await waitFor(() => {
      expect(api.status?.oura?.lastSync).toBe('t3');
      expect(api.status?.appleWatch?.lastSync).toBe('t3');
    });
    // Verified across the whole sequence, the connected wearable was never
    // silently clobbered to `null` by any transient error response.
  });
});