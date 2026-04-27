/**
 * Safe localStorage JSON parsing helpers.
 *
 * Direct `JSON.parse(localStorage.getItem(...))` can throw if the stored value
 * is corrupted (partial write, schema mismatch, manual edit). When that happens
 * inside a React render or navigation handler, the whole app can blank.
 *
 * These helpers return a default and self-clean the bad key.
 */

export function safeJsonParse<T>(key: string, defaultValue: T): T {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    if (raw == null || raw === 'null' || raw === '') return defaultValue;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[safeStorage] Corrupted localStorage key "${key}", clearing.`, err);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
    return defaultValue;
  }
}

/** Convenience for the common practice queue array shape. */
export function safeReadPracticeQueue(): any[] | null {
  return safeJsonParse<any[] | null>('practiceQueue', null);
}

/** Convenience for jit intervention payload (object | null). */
export function safeReadJitInterventionData<T = any>(): T | null {
  return safeJsonParse<T | null>('jitInterventionData', null);
}

/** Safely read the numeric queueIndex; returns NaN if missing/invalid. */
export function safeReadQueueIndex(): number {
  try {
    const raw = window.localStorage.getItem('queueIndex');
    const n = parseInt(raw || '', 10);
    return Number.isFinite(n) ? n : NaN;
  } catch {
    return NaN;
  }
}