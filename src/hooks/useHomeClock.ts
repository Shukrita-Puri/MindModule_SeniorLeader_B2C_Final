/**
 * useHomeClock — the single source of "which local day / window are we in"
 * for the executive home cards (MRS, Brief, Plan).
 *
 * Why this exists
 * ---------------
 * On web, every visit is a fresh page load, so `localISODate()` /
 * `currentPeriod()` called during render are always right. The iOS
 * WKWebView is mounted once and stays alive for days: nothing re-renders
 * the tree when the clock crosses 12:00 / 18:00 / 00:00, so the cards keep
 * serving an earlier window's query keys, score, brief and plan.
 *
 * Contract
 * --------
 * - State is computed from `new Date()` on first evaluation, never from a
 *   launch-time constant, so a JS update delivered into a long-lived shell
 *   is correct on first mount with no restart.
 * - The boundary tick is a `setTimeout` scheduled to the exact next
 *   boundary, rescheduled after each transition. Never `setInterval`.
 * - `visibilitychange` (the only foreground event WKWebView fires
 *   reliably) is debounced at 800ms and compares the wall clock against
 *   the stored state: iOS suspends timers while backgrounded, so a missed
 *   rollover is caught here and applied immediately.
 * - The transition is atomic: every cache flush runs synchronously BEFORE
 *   subscribers are notified, so no render frame can observe the new
 *   window while reading an already-cleared old-window cache.
 *
 * Presentation / freshness wiring only — no scoring, copy or backend logic.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  localISODate,
  currentPeriod as currentPeriodLocal,
  msUntilWindowEnd,
  clear as clearPersistent,
  cacheKeys,
} from '@/utils/persistentBriefCache';

export type HomeClockWindow = 'morning' | 'afternoon' | 'evening';

export interface HomeClockState {
  /** YYYY-MM-DD in the user's local clock. */
  dateISO: string;
  /** morning | afternoon | evening in the user's local clock. */
  window: HomeClockWindow;
  /** `${dateISO}|${window}` — convenient composite for cache keying. */
  key: string;
}

const isBrowser = typeof window !== 'undefined';

function computeState(now: Date = new Date()): HomeClockState {
  const dateISO = localISODate(now);
  const window = currentPeriodLocal(now) as HomeClockWindow;
  return { dateISO, window, key: `${dateISO}|${window}` };
}

/** Live state. Computed lazily on first read so SSR never touches `window`. */
let state: HomeClockState = computeState();

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Extra synchronous flush handlers contributed by consumers (e.g. the
 * Brief's `lastGoodBriefRef`, user-scoped localStorage entries). They run
 * inside the atomic transition, before any subscriber re-renders.
 */
export type HomeClockFlushHandler = (leaving: HomeClockState, entering: HomeClockState) => void;
const flushHandlers = new Set<HomeClockFlushHandler>();

export function registerHomeClockFlush(handler: HomeClockFlushHandler): () => void {
  flushHandlers.add(handler);
  return () => { flushHandlers.delete(handler); };
}

function evictLeavingWindowCaches(leaving: HomeClockState) {
  // Scope: ONLY the window just left, addressed by {date}:{window}.
  // Current-window entries and other cached windows stay untouched.
  try {
    clearPersistent(cacheKeys.planData(leaving.dateISO, leaving.window));
    clearPersistent(cacheKeys.planLoaded(leaving.dateISO, leaving.window));
    clearPersistent(cacheKeys.planForceRefresh(leaving.dateISO, leaving.window));
  } catch { /* storage unavailable — non-fatal */ }
  try {
    if (isBrowser) {
      window.sessionStorage.removeItem(cacheKeys.planForceRefresh(leaving.dateISO, leaving.window));
      window.sessionStorage.removeItem(`plan-energy-hash-${leaving.dateISO}-${leaving.window}`);
      window.sessionStorage.removeItem(`plan-jit-checked-${leaving.dateISO}-${leaving.window}`);
    }
  } catch { /* ignore */ }
}

/**
 * Apply a boundary crossing. Everything here is synchronous and completes
 * before `listeners` fire — that is what makes the transition atomic.
 */
function applyTransition(next: HomeClockState) {
  const leaving = state;
  if (leaving.key === next.key) return;

  // 1. Consumer-registered flushes (MRS last-good map, Brief last-good
  //    ref, user-scoped keys, query cancel/invalidate wiring).
  flushHandlers.forEach((handler) => {
    try { handler(leaving, next); } catch { /* one bad handler must not block the rollover */ }
  });

  // 2. Persistent caches for the window just left.
  evictLeavingWindowCaches(leaving);

  // 3. Publish. Subscribers re-render only now, with every stale cache gone.
  state = next;
  listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });
}

/** Recompute from the wall clock and transition if the window/day moved. */
export function syncHomeClock(now: Date = new Date()): boolean {
  const next = computeState(now);
  if (next.key === state.key) return false;
  applyTransition(next);
  return true;
}

export function getHomeClock(): HomeClockState {
  return state;
}

/** Test seam. */
export function __setHomeClockState(next: HomeClockState) {
  state = next;
}

// ── Boundary timer + foreground listener (installed once, browser only) ──

let boundaryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleBoundaryTick() {
  if (!isBrowser) return;
  if (boundaryTimer !== null) clearTimeout(boundaryTimer);
  // +1s guard so we land strictly past the boundary, never a hair before it.
  const delay = msUntilWindowEnd() + 1000;
  boundaryTimer = setTimeout(() => {
    boundaryTimer = null;
    syncHomeClock();
    scheduleBoundaryTick();
  }, delay);
}

let resumeDebounce: ReturnType<typeof setTimeout> | null = null;

function onVisibilityChange() {
  if (typeof document === 'undefined') return;
  if (document.visibilityState !== 'visible') return;
  if (resumeDebounce !== null) clearTimeout(resumeDebounce);
  resumeDebounce = setTimeout(() => {
    resumeDebounce = null;
    // iOS suspends timers while backgrounded, so the boundary tick very
    // often did NOT fire. Compare the wall clock against stored state and
    // force the rollover here rather than waiting for the next tick.
    syncHomeClock();
    scheduleBoundaryTick();
  }, 800);
}

let installed = false;

function install() {
  if (installed || !isBrowser) return;
  installed = true;
  // Recompute immediately: this module may be evaluated by a JS update
  // dropped into a shell that has been alive for days.
  syncHomeClock();
  scheduleBoundaryTick();
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function subscribe(listener: Listener): () => void {
  install();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Subscribe a component to the shared home clock. All three executive
 * cards read `{ dateISO, window }` from here instead of calling
 * `localISODate()` / `currentPeriod()` at render time, so they can never
 * disagree about which window they are showing.
 */
export function useHomeClock(): HomeClockState {
  // Server snapshot is the same pure computation — safe without `window`.
  return useSyncExternalStore(subscribe, getHomeClock, getHomeClock);
}

/**
 * Mount once (App level) to wire the react-query side of a rollover:
 * in-flight fetches for the leaving window are cancelled immediately —
 * we never wait for them to settle — and the executive-home keys are
 * dropped so the cards refetch for the new window.
 */
export function useHomeClockQueryWiring(queryClient: {
  cancelQueries: (filters?: any) => Promise<void> | void;
  removeQueries: (filters?: any) => void;
  invalidateQueries: (filters?: any) => Promise<void> | void;
}) {
  const flush = useCallback<HomeClockFlushHandler>(() => {
    const keys = [
      'mrs-snapshot',
      'outer-readiness',
      'current-brief-snapshot',
      'brief-snapshot',
      'mastery-plan-snapshot',
    ];
    keys.forEach((k) => {
      try {
        // Fire-and-forget: rollover must not await in-flight requests.
        void queryClient.cancelQueries({ queryKey: [k] });
        queryClient.removeQueries({ queryKey: [k] });
        void queryClient.invalidateQueries({ queryKey: [k] });
      } catch { /* ignore */ }
    });
  }, [queryClient]);

  useEffect(() => registerHomeClockFlush(flush), [flush]);
  useEffect(() => {
    // Also force a sync on mount so an update into a live shell settles
    // before the first paint of the cards.
    syncHomeClock();
  }, []);
}
