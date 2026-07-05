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
}

export interface AuthFailureUpdate {
  is_active: false;
  sync_status: 'error';
  last_error: string;
  last_error_reason: string | null;
  last_error_at: string;
}

export interface GenericErrorUpdate {
  sync_status: 'error';
  last_error: string;
  last_error_reason: string | null;
  last_error_at: string;
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

export function resolveRetryDelaySeconds(hint: number | null | undefined): number {
  const raw = typeof hint === 'number' && Number.isFinite(hint) && hint > 0
    ? Math.ceil(hint)
    : RETRY_HINT_DEFAULT_SECONDS;
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
  now?: Date;
}): RateLimitedUpdate {
  const now = input.now ?? new Date();
  const ts = now.toISOString();
  const delaySeconds = resolveRetryDelaySeconds(input.retryAfterSeconds);
  return {
    sync_status: 'sync_delayed',
    last_error: input.message,
    last_error_reason: input.reason,
    last_error_at: ts,
    last_sync_delayed_at: ts,
    retry_after_seconds: delaySeconds,
    next_retry_at: computeNextRetryAt(now, delaySeconds),
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
