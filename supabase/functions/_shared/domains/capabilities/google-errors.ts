/**
 * Classify Google Calendar API error responses.
 *
 * The previous sync path treated any non-401 error as a generic hard
 * failure. Google, however, uses HTTP 403 for BOTH permission errors
 * (`insufficientPermissions`, `forbidden`) AND for rate-limit / quota
 * conditions (`quotaExceeded`, `rateLimitExceeded`, `userRateLimitExceeded`,
 * `dailyLimitExceeded`, `dailyLimitExceededUnreg`). Keying only on the
 * status code therefore misclassifies temporary throttling as either a
 * hard failure or, worse, as an auth failure that flips the connection
 * `is_active = false` — turning a transient quota blip into a "please
 * reconnect" event for the user.
 *
 * This module is a PURE function so it can be unit-tested in isolation.
 */

export type GoogleCalendarErrorKind =
  | 'rate_limited'   // temporary — sync_delayed, keep connection active
  | 'auth_failed'    // 401 or true 403 auth/permission — needs reconnect
  | 'other_error';   // generic failure — surface but don't disconnect

export interface GoogleCalendarErrorClassification {
  kind: GoogleCalendarErrorKind;
  /** Machine-readable reason token, e.g. 'quotaExceeded', 'userRateLimitExceeded', 'insufficientPermissions'. */
  reason: string | null;
  /** Free-text Google error message, when present. */
  message: string | null;
  /** Seconds to wait before retrying, parsed from Retry-After header when present. */
  retryAfterSeconds: number | null;
}

/** Google error `reason` tokens that indicate temporary rate-limit / quota conditions. */
const RATE_LIMIT_REASONS = new Set([
  'quotaExceeded',
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'dailyLimitExceeded',
  'dailyLimitExceededUnreg',
  'variableTermLimitExceeded',
  'backendError',            // 5xx-style transient — treat as delayed
]);

/** Google error `reason` tokens that indicate a real auth/permission failure. */
const AUTH_REASONS = new Set([
  'authError',
  'invalidCredentials',
  'insufficientPermissions',
  'forbidden',
  'accessNotConfigured',
  'requiredAccessLevel',
]);

function parseRetryAfter(header: string | null | undefined): number | null {
  if (!header) return null;
  const s = header.trim();
  if (!s) return null;
  // Retry-After may be seconds or an HTTP-date. Try seconds first.
  const asInt = Number(s);
  if (Number.isFinite(asInt) && asInt >= 0) return Math.floor(asInt);
  const asDate = Date.parse(s);
  if (Number.isFinite(asDate)) {
    const delta = Math.floor((asDate - Date.now()) / 1000);
    return delta > 0 ? delta : 0;
  }
  return null;
}

/**
 * Classify a Google Calendar API error.
 *
 * `status` is the HTTP status code, `bodyText` is the raw response body
 * (JSON string) and `headers` is any Headers-like object exposing `get()`.
 */
export function classifyGoogleCalendarError(
  status: number,
  bodyText: string,
  headers?: { get(name: string): string | null } | null,
): GoogleCalendarErrorClassification {
  let payload: unknown = null;
  if (bodyText) {
    try { payload = JSON.parse(bodyText); } catch { /* non-JSON body */ }
  }
  const err = (payload as { error?: { errors?: Array<{ reason?: string; message?: string }>; message?: string; status?: string } } | null)?.error ?? null;
  const firstReason = err?.errors?.find((e) => typeof e?.reason === 'string')?.reason ?? null;
  const message = err?.errors?.find((e) => typeof e?.message === 'string')?.message ?? err?.message ?? null;
  const retryAfterSeconds = parseRetryAfter(headers?.get('retry-after') ?? headers?.get('Retry-After') ?? null);

  // 429 is always rate-limited regardless of body shape.
  if (status === 429) {
    return { kind: 'rate_limited', reason: firstReason ?? 'rateLimitExceeded', message, retryAfterSeconds };
  }

  // 403 splits: reason token disambiguates quota vs. real permission errors.
  if (status === 403) {
    if (firstReason && RATE_LIMIT_REASONS.has(firstReason)) {
      return { kind: 'rate_limited', reason: firstReason, message, retryAfterSeconds };
    }
    if (firstReason && AUTH_REASONS.has(firstReason)) {
      return { kind: 'auth_failed', reason: firstReason, message, retryAfterSeconds };
    }
    // Google occasionally omits the errors[] array for permission failures;
    // fall back to treating a bare 403 as auth to preserve prior behavior for
    // real forbidden responses (never rate-limit them by accident).
    return { kind: 'auth_failed', reason: firstReason ?? 'forbidden', message, retryAfterSeconds };
  }

  if (status === 401) {
    return { kind: 'auth_failed', reason: firstReason ?? 'unauthorized', message, retryAfterSeconds };
  }

  // Transient upstream errors from Google are best treated as delayed too.
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return { kind: 'rate_limited', reason: firstReason ?? 'backendError', message, retryAfterSeconds };
  }

  return { kind: 'other_error', reason: firstReason, message, retryAfterSeconds };
}