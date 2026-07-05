/**
 * Classify Microsoft Graph errors returned from the calendar event
 * fetch endpoint (`/me/calendarview`, `/me/events`).
 *
 * The previous sync path treated everything except HTTP 401 as a
 * generic hard failure. Graph, however, uses 429 for throttling and
 * 503/504 for transient upstream issues that should NOT flip the
 * connection to disconnected — they should become `sync_delayed`
 * (mirroring the Google classifier's `rate_limited` bucket).
 *
 * Kept as a PURE function so it can be unit-tested without any
 * network access and without touching the database.
 *
 * Internally delegates status-code bucketing to
 * `classifyMicrosoftSubscriptionError` so subscription lifecycle and
 * event fetch share the same "what does status N mean?" table. The
 * event-fetch classifier layers on Graph error-body parsing (`code`,
 * `message`) plus Retry-After extraction so callers can persist a
 * proper `last_error_reason` and surface a retry hint.
 */

import { classifyMicrosoftSubscriptionError } from './microsoft-graph-subscription.ts';

export type MicrosoftCalendarErrorKind =
  | 'rate_limited'   // temporary — sync_delayed, keep connection active
  | 'auth_failed'    // 401 or true 403 auth/permission — needs reconnect
  | 'other_error';   // generic failure — surface but don't disconnect

export interface MicrosoftCalendarErrorClassification {
  kind: MicrosoftCalendarErrorKind;
  /** Machine-readable Graph error `code`, e.g. 'InvalidAuthenticationToken', 'TooManyRequests'. */
  reason: string | null;
  /** Free-text Graph error message when present. */
  message: string | null;
  /** Seconds to wait before retrying, from Retry-After header when present. */
  retryAfterSeconds: number | null;
}

function parseRetryAfter(header: string | null | undefined): number | null {
  if (!header) return null;
  const s = header.trim();
  if (!s) return null;
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
 * Classify a Microsoft Graph calendar-event API error.
 *
 * `status` is the HTTP status, `bodyText` is the raw response body
 * (Graph errors are JSON: `{ error: { code, message } }`), and
 * `headers` is any Headers-like object exposing `get()`.
 */
export function classifyMicrosoftCalendarError(
  status: number,
  bodyText: string,
  headers?: { get(name: string): string | null } | null,
): MicrosoftCalendarErrorClassification {
  let payload: unknown = null;
  if (bodyText) {
    try { payload = JSON.parse(bodyText); } catch { /* non-JSON body */ }
  }
  const err = (payload as { error?: { code?: string; message?: string } } | null)?.error ?? null;
  const reason = typeof err?.code === 'string' ? err.code : null;
  const message = typeof err?.message === 'string' ? err.message : null;
  const retryAfterSeconds = parseRetryAfter(
    headers?.get('retry-after') ?? headers?.get('Retry-After') ?? null,
  );

  // 404 on an event-fetch endpoint is not a subscription-gone scenario —
  // it's a generic "resource not found" (e.g. deleted mailbox). Do not
  // disconnect, but do surface it as an error rather than a delay.
  if (status === 404) {
    return { kind: 'other_error', reason: reason ?? 'not_found', message, retryAfterSeconds };
  }

  const bucket = classifyMicrosoftSubscriptionError(status);
  if (bucket === 'auth_failed') {
    return {
      kind: 'auth_failed',
      reason: reason ?? (status === 401 ? 'unauthorized' : 'forbidden'),
      message,
      retryAfterSeconds,
    };
  }
  if (bucket === 'rate_limited') {
    return {
      kind: 'rate_limited',
      reason: reason ?? (status === 429 ? 'TooManyRequests' : `http_${status}`),
      message,
      retryAfterSeconds,
    };
  }
  return { kind: 'other_error', reason, message, retryAfterSeconds };
}