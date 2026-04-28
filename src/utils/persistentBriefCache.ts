/**
 * persistentBriefCache — small TTL-aware localStorage helper.
 *
 * Used by the four scripted pages (Brief, Plan, Insights, Onboarding Results)
 * to survive a full app reopen while still expiring on the natural boundary
 * (window crossover for time-of-day briefs/plans, day rollover for Insights,
 * onboarding rerun for Results).
 *
 * Reads return null when the entry is missing, expired, or malformed. Writes
 * silently swallow quota errors. All keys should be namespaced with the user
 * id so a multi-user device can't leak content between accounts.
 */
export interface PersistentEntry<T> {
  v: T;
  /** Absolute epoch millis when this entry expires. Use Infinity for "no TTL". */
  exp: number;
}

export function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistentEntry<T>;
    if (!parsed || typeof parsed !== 'object' || !('v' in parsed) || !('exp' in parsed)) return null;
    if (typeof parsed.exp === 'number' && Date.now() > parsed.exp) {
      try { window.localStorage.removeItem(key); } catch { /* ignore */ }
      return null;
    }
    return parsed.v;
  } catch {
    return null;
  }
}

export function write<T>(key: string, value: T, ttlMs: number): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: PersistentEntry<T> = {
      v: value,
      exp: Number.isFinite(ttlMs) ? Date.now() + ttlMs : Number.MAX_SAFE_INTEGER,
    };
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* quota exceeded or storage unavailable — silent */
  }
}

export function clear(key: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}

/**
 * Sweep all localStorage keys matching any of the given prefixes.
 * Used by sign-out to drop per-user cached payloads.
 */
export function clearByPrefixes(prefixes: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (prefixes.some(p => k.startsWith(p))) toRemove.push(k);
    }
    toRemove.forEach(k => {
      try { window.localStorage.removeItem(k); } catch { /* ignore */ }
    });
  } catch { /* ignore */ }
}

/**
 * Compute the millis remaining until the end of the current time-of-day
 * window (Morning ends at 12:00, Afternoon ends at 18:00, Evening ends at
 * 05:00 the next day). Boundaries match the standardized windows used
 * across the app. Always positive — if "now" is somehow past the boundary,
 * returns 1ms so the next read fetches fresh.
 */
export function msUntilWindowEnd(now: Date = new Date()): number {
  const hour = now.getHours();
  const end = new Date(now);
  end.setMinutes(0, 0, 0);
  if (hour < 5) {
    // Pre-dawn → still in previous "evening" window, ends at 05:00 today.
    end.setHours(5, 0, 0, 0);
  } else if (hour < 12) {
    end.setHours(12, 0, 0, 0);
  } else if (hour < 18) {
    end.setHours(18, 0, 0, 0);
  } else {
    // Evening → ends at 05:00 the next day.
    end.setDate(end.getDate() + 1);
    end.setHours(5, 0, 0, 0);
  }
  const ms = end.getTime() - now.getTime();
  return Math.max(ms, 1);
}

/**
 * Compute the millis remaining until midnight (local time). Used for
 * day-scoped caches like Insights' `script-done` flag.
 */
export function msUntilMidnight(now: Date = new Date()): number {
  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  return Math.max(end.getTime() - now.getTime(), 1);
}

/** Cache-key builders — keep all key shapes in one place. */
export const cacheKeys = {
  brief: (userId: string, period: string, dateISO: string) =>
    `prb-cache:${userId}:${period}:${dateISO}`,
  /**
   * Per-window cache for the *awaiting signals* gating decision (no
   * check-in AND no fresh wearable). We persist this so a no-signal user
   * doesn't re-hit `compute-outer-readiness` on every mount / focus /
   * iOS foreground. TTL is bound to the end of the current time window.
   */
  briefAwaiting: (userId: string, period: string, dateISO: string) =>
    `prb-awaiting:${userId}:${period}:${dateISO}`,
  planData: (dateISO: string, period: string) =>
    `plan-data-${dateISO}-${period}`,
  planLoaded: (dateISO: string, period: string) =>
    `plan-loaded-${dateISO}-${period}`,
  insightsScriptDone: (userId: string, dateISO: string) =>
    `insights-script-done:${userId}:${dateISO}`,
  /**
   * Per-day cache for the three Insights section payloads
   * (statePatterns, tinyWinsInsights, semanticAnalysis). When present we
   * hydrate sections synchronously on mount so the scripted loader is
   * skipped on revisit and the silent refresh updates in place. Auto-
   * expires at midnight via msUntilMidnight().
   */
  insightsData: (userId: string, dateISO: string) =>
    `insights-data:${userId}:${dateISO}`,
  onboardingResults: (userId: string) =>
    `onboarding-results-cache:${userId}`,
};

/**
 * Local-date helper. The Brief and Plan windows (Morning/Afternoon/Evening)
 * are expressed in the user's local clock. Using `new Date().toISOString()`
 * yields a UTC date that can disagree with the local date around midnight
 * (e.g. 23:30 local in UTC+5 returns tomorrow's UTC date), which can cause
 * the cache to hydrate yesterday's or tomorrow's payload by accident.
 *
 * Returns YYYY-MM-DD in the user's local clock.
 */
export function localISODate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Current time-of-day window in the user's local clock. Matches the
 * standardized windows used everywhere else in the app:
 *   Morning   05:00 – 11:59
 *   Afternoon 12:00 – 17:59
 *   Evening   18:00 – 04:59 (next day)
 * Pre-dawn (00:00–04:59) is still the previous "evening" window.
 */
export function currentPeriod(now: Date = new Date()): 'morning' | 'afternoon' | 'evening' {
  const h = now.getHours();
  if (h < 5) return 'evening';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

/** Prefixes used by `clearByPrefixes` on sign-out. */
export const cacheKeyPrefixes = [
  'prb-cache:',
  'prb-awaiting:',
  'plan-data-',
  'plan-loaded-',
  'insights-script-done:',
  'insights-data:',
  'onboarding-results-cache:',
];
