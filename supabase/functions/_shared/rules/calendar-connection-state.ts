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
}

export interface SuccessfulSyncUpdate {
  last_sync: string;
  sync_status: 'synced';
  last_error: null;
  last_error_reason: null;
  last_error_at: null;
  last_sync_delayed_at: null;
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

export function buildRateLimitedUpdate(input: {
  message: string;
  reason: string | null;
  now?: Date;
}): RateLimitedUpdate {
  const ts = nowIso(input.now);
  return {
    sync_status: 'sync_delayed',
    last_error: input.message,
    last_error_reason: input.reason,
    last_error_at: ts,
    last_sync_delayed_at: ts,
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
  };
}
