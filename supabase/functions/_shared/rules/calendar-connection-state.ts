/**
 * Pure builders for `calendar_connections` state updates.
 *
 * These helpers guarantee that every lifecycle transition writes the
 * FULL set of fields it owns — most importantly, a successful sync
 * MUST clear every transient delay/error marker so a previous
 * rate-limit blip does not leave `last_sync_delayed_at` (or friends)
 * pointing at a stale timestamp.
 *
 * All values are plain data so they can be unit-tested without a
 * database or Supabase client.
 */

export interface RateLimitedUpdate {
  sync_status: 'sync_delayed';
  last_error: string;
  last_error_reason: string | null;
  last_error_at: string;
  last_sync_delayed_at: string;
  retry_after_seconds: number;
  next_retry_at: string;
  consecutive_delay_count: number;
}

export interface SuccessfulSyncUpdate {
  last_sync: string;
  sync_status: 'synced';
  last_error: null;
  last_error_reason: null;
  last_error_at: null;
  last_sync_delayed_at: null;
  retry_after_seconds: null;
  next_retry_at: null;
  consecutive_delay_count: 0;
}

export interface AuthFailureUpdate {
  is_active: false;
  sync_status: 'error';
  last_error: string;
  last_error_reason: string | null;
  last_error_at: string;
  // Auth failures are non-transient — reset the streak counter so a
  // future recovery does not inherit a stale exponential backoff.
  consecutive_delay_count: 0;
}

export interface GenericErrorUpdate {
  sync_status: 'error';
  last_error: string;
  last_error_reason: string | null;
  last_error_at: string;
  // Non-transient error → reset the transient-streak counter (see
  // AuthFailureUpdate). The counter tracks *active throttle streaks*,
  // not lifetime failure count.
  consecutive_delay_count: 0;
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

/**
 * Retry-hint policy for calendar `sync_delayed` outcomes.
 *
 * - Honors provider `Retry-After` when present.
 * - Otherwise applies a bounded default so we don't hammer providers
 *   that returned an opaque 429/5xx.
 * - Clamps to [MIN, MAX] to protect against absurd server hints
 *   (e.g. `Retry-After: 86400`) or missing values.
 */
export const RETRY_HINT_MIN_SECONDS = 60;         // 1 minute floor
export const RETRY_HINT_MAX_SECONDS = 60 * 60;    // 1 hour ceiling
export const RETRY_HINT_DEFAULT_SECONDS = 5 * 60; // 5 minute default

/**
 * Exponential backoff progression used when the provider omits an
 * explicit `Retry-After`. Indexed by the number of prior consecutive
 * transient outcomes (0 = first miss, 1 = second miss, ...). Capped at
 * RETRY_HINT_MAX_SECONDS via the general clamp; extra entries beyond
 * the tail all resolve to the max.
 */
export const RETRY_BACKOFF_LADDER_SECONDS = [300, 600, 1200, 2400, 3600] as const;

/**
 * Jitter policy for retry delays.
 *
 * Jitter deterministically spreads retries so many connections that
 * hit the same provider quota at the same second are unlikely to all
 * wake up on the exact same tick. This is collision-REDUCING, not
 * collision-PROOF: with a bounded jitter window and a 32-bit hash,
 * two different connections at the same base delay can and sometimes
 * will land on the same `next_retry_at` second — that's expected and
 * still much better than the pre-jitter lockstep behavior.
 *
 * Policy:
 *   - jitter range is ±JITTER_RATIO of the base delay
 *   - minimum absolute jitter window is JITTER_MIN_SECONDS
 *   - maximum absolute jitter window is JITTER_MAX_SECONDS
 *   - jitter is derived deterministically from a caller-supplied seed
 *     (typically the connection id + attempt count) so the same
 *     (connection, attempt) pair always resolves to the same delay
 *     across process invocations. NEVER use Math.random() here.
 */
export const RETRY_JITTER_RATIO = 0.10;
export const RETRY_JITTER_MIN_SECONDS = 15;
export const RETRY_JITTER_MAX_SECONDS = 300;

/**
 * FNV-1a 32-bit hash of a string. Small, allocation-free, and
 * deterministic across runtimes — good enough to spread a few
 * thousand connection ids across a jitter window.
 */
function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply: h = h * 16777619
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * Compute deterministic jitter in seconds for the given seed and base
 * delay. Returns a signed integer in the range [-window, +window]
 * where `window = clamp(base * RETRY_JITTER_RATIO, MIN, MAX)`.
 *
 * Deterministic: same (seed, base) → same output, every time.
 */
export function computeRetryJitterSeconds(
  seed: string,
  baseDelaySeconds: number,
): number {
  if (!seed || !Number.isFinite(baseDelaySeconds) || baseDelaySeconds <= 0) {
    return 0;
  }
  const rawWindow = Math.floor(baseDelaySeconds * RETRY_JITTER_RATIO);
  const window = Math.max(
    RETRY_JITTER_MIN_SECONDS,
    Math.min(RETRY_JITTER_MAX_SECONDS, rawWindow),
  );
  // Map hash → [0, 2*window] → shift to [-window, +window].
  const span = 2 * window + 1;
  const h = fnv1a32(seed);
  return (h % span) - window;
}

/**
 * Apply deterministic jitter to a resolved base delay and clamp the
 * final result to the global [MIN, MAX] retry window.
 *
 * Returns `{ baseDelaySeconds, jitterSeconds, finalDelaySeconds }` so
 * callers can log the split for debugging.
 */
export function applyJitterToDelay(
  seed: string | null | undefined,
  baseDelaySeconds: number,
): { baseDelaySeconds: number; jitterSeconds: number; finalDelaySeconds: number } {
  const jitterSeconds = seed
    ? computeRetryJitterSeconds(seed, baseDelaySeconds)
    : 0;
  const withJitter = baseDelaySeconds + jitterSeconds;
  const finalDelaySeconds = Math.max(
    RETRY_HINT_MIN_SECONDS,
    Math.min(RETRY_HINT_MAX_SECONDS, withJitter),
  );
  return { baseDelaySeconds, jitterSeconds, finalDelaySeconds };
}

/**
 * Compute the exponential backoff delay for the Nth consecutive
 * transient outcome. `consecutivePriorCount` is the number of prior
 * transient outcomes BEFORE this one (so the very first delayed sync
 * receives ladder[0] = 300s).
 */
export function computeBackoffFromCount(consecutivePriorCount: number): number {
  if (!Number.isFinite(consecutivePriorCount) || consecutivePriorCount < 0) {
    return RETRY_BACKOFF_LADDER_SECONDS[0];
  }
  const idx = Math.min(
    Math.floor(consecutivePriorCount),
    RETRY_BACKOFF_LADDER_SECONDS.length - 1,
  );
  return RETRY_BACKOFF_LADDER_SECONDS[idx];
}

/**
 * Single policy entrypoint for the delay in seconds until the next
 * scheduled retry.
 *
 * Rules (evaluated in order):
 *   1. Explicit provider `Retry-After` (positive finite number) wins,
 *      after clamping to [MIN, MAX].
 *   2. Otherwise apply exponential backoff based on the connection's
 *      prior consecutive transient count. First miss → 300s, doubling
 *      up to 3600s.
 *   3. In all cases the final value is clamped to [MIN, MAX] so a
 *      malformed provider hint or an unexpectedly-huge counter can
 *      never exceed the 1-hour ceiling or dip below the 1-minute
 *      floor.
 */
export function resolveRetryDelaySeconds(
  hint: number | null | undefined,
  opts?: { consecutivePriorCount?: number },
): number {
  const hasExplicitHint =
    typeof hint === 'number' && Number.isFinite(hint) && hint > 0;
  const raw = hasExplicitHint
    ? Math.ceil(hint as number)
    : computeBackoffFromCount(opts?.consecutivePriorCount ?? 0);
  if (raw < RETRY_HINT_MIN_SECONDS) return RETRY_HINT_MIN_SECONDS;
  if (raw > RETRY_HINT_MAX_SECONDS) return RETRY_HINT_MAX_SECONDS;
  return raw;
}

export function computeNextRetryAt(now: Date, delaySeconds: number): string {
  return new Date(now.getTime() + delaySeconds * 1000).toISOString();
}

export function buildRateLimitedUpdate(input: {
  message: string;
  reason: string | null;
  retryAfterSeconds?: number | null;
  /**
   * Count of consecutive transient outcomes BEFORE this one. The
   * builder increments it by one for the row it emits.
   */
  consecutivePriorCount?: number;
  /**
   * Stable per-connection seed for deterministic jitter. Callers
   * should compose something like `${connection.id}:${nextAttempt}` so
   * the same connection gets a different jitter on each attempt but
   * two different connections with the same base delay do NOT collide
   * on the exact same `next_retry_at`. When omitted, no jitter is
   * applied (used by pure unit tests that assert exact delays).
   */
  jitterSeed?: string | null;
  now?: Date;
}): RateLimitedUpdate {
  const now = input.now ?? new Date();
  const ts = now.toISOString();
  const priorCount = Math.max(0, Math.floor(input.consecutivePriorCount ?? 0));
  const baseDelay = resolveRetryDelaySeconds(input.retryAfterSeconds, {
    consecutivePriorCount: priorCount,
  });
  const nextAttempt = priorCount + 1;
  const seed = input.jitterSeed && input.jitterSeed.length > 0
    ? `${input.jitterSeed}:${nextAttempt}`
    : null;
  const { finalDelaySeconds } = applyJitterToDelay(seed, baseDelay);
  return {
    sync_status: 'sync_delayed',
    last_error: input.message,
    last_error_reason: input.reason,
    last_error_at: ts,
    last_sync_delayed_at: ts,
    retry_after_seconds: finalDelaySeconds,
    next_retry_at: computeNextRetryAt(now, finalDelaySeconds),
    consecutive_delay_count: nextAttempt,
  };
}

export function buildAuthFailureUpdate(input: {
  message: string;
  reason: string | null;
  now?: Date;
}): AuthFailureUpdate {
  return {
    is_active: false,
    sync_status: 'error',
    last_error: input.message,
    last_error_reason: input.reason,
    last_error_at: nowIso(input.now),
    consecutive_delay_count: 0,
  };
}

export function buildGenericErrorUpdate(input: {
  message: string;
  reason: string | null;
  now?: Date;
}): GenericErrorUpdate {
  return {
    sync_status: 'error',
    last_error: input.message,
    last_error_reason: input.reason,
    last_error_at: nowIso(input.now),
    consecutive_delay_count: 0,
  };
}

/**
 * Build the state update for a clean successful sync.
 *
 * MUST null every transient delay/error field, so a previous
 * `rate_limited` write does not leave stale `last_sync_delayed_at`
 * (or `last_error_*`) values behind.
 */
export function buildSuccessfulSyncUpdate(now?: Date): SuccessfulSyncUpdate {
  return {
    last_sync: nowIso(now),
    sync_status: 'synced',
    last_error: null,
    last_error_reason: null,
    last_error_at: null,
    last_sync_delayed_at: null,
    retry_after_seconds: null,
    next_retry_at: null,
    consecutive_delay_count: 0,
  };
}

/**
 * Pure predicate — is a connection currently in a scheduler-honored
 * retry window? Callers can use this in scheduler queries to skip
 * throttled rows without treating them as failures.
 */
export function isConnectionEligibleForSync(
  row: { next_retry_at?: string | null },
  now: Date = new Date(),
): boolean {
  if (!row.next_retry_at) return true;
  const t = new Date(row.next_retry_at).getTime();
  if (Number.isNaN(t)) return true;
  return t <= now.getTime();
}
