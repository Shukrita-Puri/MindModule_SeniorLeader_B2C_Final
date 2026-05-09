/**
 * Apple Calendar sync service — native iOS only.
 *
 * Reads events via the AppleCalendar Capacitor plugin and posts them to the
 * `sync-apple-calendar` edge function (authenticated with Auth0 Bearer token).
 */

import { fetchAppleCalendarEvents, isAppleCalendarSupported } from '@/utils/appleCalendar';
import { getAuthToken } from '@/services/authTokenService';
import { emitIntegrationEvent } from '@/utils/integrationTelemetry';
import { describeFetchError, getSupabaseFunctionHeaders, getSupabaseFunctionUrl, readResponseBody } from '@/utils/supabaseFunctions';
import { enqueue as queueEnqueue } from '@/services/syncQueue';
import { isSimulatedOffline, consumeSimulatedSyncFailure } from '@/utils/integrationQaHelpers';

export interface AppleCalendarSyncResult {
  success: boolean;
  eventCount?: number;
  error?: string;
}

export interface AppleCalendarSyncPayload {
  windowStart: string;
  windowEnd: string;
  events: unknown[];
}

/**
 * Direct POST to sync-apple-calendar. Used by both foreground sync and the
 * retry orchestrator. Does NOT enqueue on its own.
 */
export async function postAppleCalendarDirect(payload: AppleCalendarSyncPayload, idempotencyKey?: string): Promise<{ ok: boolean; status: number; error?: string; eventCount?: number }> {
  if (isSimulatedOffline()) return { ok: false, status: 0, error: 'simulated_offline' };
  if (consumeSimulatedSyncFailure()) return { ok: false, status: 500, error: 'simulated_failure' };
  const token = await getAuthToken();
  if (!token) return { ok: false, status: 0, error: 'missing_auth_token' };
  const url = getSupabaseFunctionUrl('sync-apple-calendar');
  try {
    const headers = getSupabaseFunctionHeaders(token);
    if (idempotencyKey) (headers as Record<string, string>)['X-Outbox-Item-Id'] = idempotencyKey;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const bodyText = await readResponseBody(res);
    let data: { success?: boolean; error?: string; eventCount?: number } = {};
    try { data = bodyText ? JSON.parse(bodyText) : {}; } catch { data = {}; }
    if (!res.ok || data?.success === false) {
      return { ok: false, status: res.status, error: data.error || bodyText || `http_${res.status}` };
    }
    return { ok: true, status: res.status, eventCount: data.eventCount };
  } catch (err) {
    return { ok: false, status: 0, error: describeFetchError(err) };
  }
}

// Sync window: [today-2d, today+8d] — same as Google routine sync.
function defaultSyncWindow(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 2);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setDate(end.getDate() + 8);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function syncAppleCalendarToBackend(): Promise<AppleCalendarSyncResult> {
  if (!isAppleCalendarSupported()) {
    return { success: false, error: 'Apple Calendar is only available on iOS' };
  }
  emitIntegrationEvent({ provider: 'apple-calendar', event: 'sync_started' });

  const { start, end } = defaultSyncWindow();

  let events;
  try {
    events = await fetchAppleCalendarEvents(start, end);
  } catch (err) {
    console.error('[appleCalendarSync] fetchEvents failed:', err);
    emitIntegrationEvent({
      provider: 'apple-calendar',
      event: 'sync_failed',
      errorCode: 'fetch_events_failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: err instanceof Error ? err.message : 'Failed to read Apple Calendar' };
  }

  const token = await getAuthToken();
  if (!token) {
    emitIntegrationEvent({ provider: 'apple-calendar', event: 'sync_failed', errorCode: 'missing_auth_token' });
    return { success: false, error: 'Authentication required' };
  }

  const url = getSupabaseFunctionUrl('sync-apple-calendar');
  try {
    emitIntegrationEvent({
      provider: 'apple-calendar',
      event: 'sync_started',
      meta: {
        phase: 'backend_post',
        url,
        eventCount: events.length,
        online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
      },
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: getSupabaseFunctionHeaders(token),
      body: JSON.stringify({
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
        events,
      }),
    });
    const bodyText = await readResponseBody(res);
    let data: { success?: boolean; error?: string; eventCount?: number } = {};
    try {
      data = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      data = { success: false, error: bodyText || `HTTP ${res.status}` };
    }
    if (!res.ok) {
      emitIntegrationEvent({
        provider: 'apple-calendar',
        event: 'sync_failed',
        errorCode: `http_${res.status}`,
        errorMessage: data.error || bodyText || res.statusText,
        meta: { url, eventCount: events.length },
      });
      try {
        queueEnqueue('apple-calendar', {
          windowStart: start.toISOString(),
          windowEnd: end.toISOString(),
          events,
        }, `http_${res.status}`);
      } catch { /* */ }
      return { success: false, error: data.error || bodyText || `Sync failed (${res.status})` };
    }
    if (data?.success === false) {
      emitIntegrationEvent({
        provider: 'apple-calendar',
        event: 'sync_failed',
        errorCode: 'backend_returned_error',
        errorMessage: data.error,
      });
      try {
        queueEnqueue('apple-calendar', {
          windowStart: start.toISOString(),
          windowEnd: end.toISOString(),
          events,
        }, 'backend_returned_error');
      } catch { /* */ }
      return { success: false, error: data.error || 'Sync failed' };
    }
    emitIntegrationEvent({
      provider: 'apple-calendar',
      event: 'sync_success',
      meta: { eventCount: data.eventCount ?? events.length },
    });
    return { success: true, eventCount: data.eventCount ?? events.length };
  } catch (err) {
    const errorMessage = describeFetchError(err);
    console.error('[appleCalendarSync] sync-apple-calendar failed:', errorMessage, err);
    try {
      queueEnqueue('apple-calendar', {
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
        events,
      }, errorMessage);
    } catch { /* */ }
    emitIntegrationEvent({
      provider: 'apple-calendar',
      event: 'sync_failed',
      errorCode: 'network_error',
      errorMessage,
      meta: {
        url,
        online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
        supabaseUrlConfigured: !!import.meta.env.VITE_SUPABASE_URL,
        projectIdConfigured: !!import.meta.env.VITE_SUPABASE_PROJECT_ID,
      },
    });
    return { success: false, error: errorMessage || 'Sync failed' };
  }
}
