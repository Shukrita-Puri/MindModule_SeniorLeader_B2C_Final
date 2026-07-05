/**
 * Apple Calendar (EventKit) bridge — native iOS only.
 *
 * Talks to the AppleCalendarPlugin Swift class via Capacitor.registerPlugin.
 * On web, every method short-circuits to a "not supported" response.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { emitIntegrationEvent } from './integrationTelemetry';
import { toast } from 'sonner';

export interface AppleCalendarEvent {
  external_id: string;
  title: string;
  start_time: string;
  end_time: string;
  is_organizer: boolean;
  attendees_count: number;
  is_recurring: boolean;
  event_metadata: Record<string, unknown>;
}

interface AppleCalendarPlugin {
  requestPermission(): Promise<{ granted: boolean; status: string }>;
  getPermissionStatus(): Promise<{ status: string }>;
  fetchEvents(opts: { startISO: string; endISO: string }): Promise<{ events: AppleCalendarEvent[] }>;
  addListener(eventName: 'calendarStoreChanged', listener: (data: { at: number }) => void): Promise<{ remove: () => Promise<void> }>;
}

const AppleCalendar = registerPlugin<AppleCalendarPlugin>('AppleCalendar');
const APPLE_CALENDAR_MANUAL_DISCONNECT_KEY = 'apple_calendar_manual_disconnect';

export function markAppleCalendarManuallyDisconnected(): void {
  try {
    localStorage.setItem(APPLE_CALENDAR_MANUAL_DISCONNECT_KEY, '1');
  } catch {
    // localStorage may be unavailable in rare WebView states; fail open.
  }
}

export function clearAppleCalendarManualDisconnect(): void {
  try {
    localStorage.removeItem(APPLE_CALENDAR_MANUAL_DISCONNECT_KEY);
  } catch {
    // localStorage may be unavailable in rare WebView states; fail open.
  }
}

export function wasAppleCalendarManuallyDisconnected(): boolean {
  try {
    return localStorage.getItem(APPLE_CALENDAR_MANUAL_DISCONNECT_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Show explicit guidance after an in-app Apple Calendar disconnect.
 *
 * Disconnecting inside the app removes our access token / backend record but
 * does NOT revoke the underlying EventKit permission that iOS grants to the
 * native shell. Users who want to fully remove device-level calendar access
 * must do it in iOS Settings → Privacy & Security → Calendars.
 *
 * Kept as a single shared helper so every Apple Calendar disconnect entry
 * point (settings screen, provider picker, background retry drainage) emits
 * the same message. Uses a long-lived sonner toast so the user can still
 * read it after navigating away from the disconnect button.
 */
export function showAppleCalendarPermissionRevokeNotice(): void {
  emitIntegrationEvent({
    provider: 'apple-calendar',
    event: 'permission_revoke_notice_shown',
  });
  toast.info(
    'Apple Calendar disconnected in Mind Module. To fully revoke device calendar access, also go to iOS Settings → Privacy & Security → Calendars and remove Mind Module.',
    { duration: 10000 },
  );
}

export function isAppleCalendarSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

export async function requestAppleCalendarPermission(): Promise<boolean> {
  if (!isAppleCalendarSupported()) return false;
  emitIntegrationEvent({ provider: 'apple-calendar', event: 'permission_request_started' });
  try {
    const res = await AppleCalendar.requestPermission();
    console.log('[appleCalendar] requestPermission result:', JSON.stringify(res));
    const ok = !!res.granted && isAppleCalendarAuthorizedStatus(res.status);
    emitIntegrationEvent({
      provider: 'apple-calendar',
      event: ok ? 'permission_granted' : 'permission_denied',
      nativePermissionState: res.status,
    });
    return ok;
  } catch (err) {
    console.error('[appleCalendar] requestPermission failed:', err);
    emitIntegrationEvent({
      provider: 'apple-calendar',
      event: 'plugin_call_failed',
      errorMessage: err instanceof Error ? err.message : String(err),
      meta: { call: 'requestPermission' },
    });
    return false;
  }
}

export async function getAppleCalendarPermissionStatus(): Promise<string> {
  if (!isAppleCalendarSupported()) return 'unsupported';
  try {
    const res = await AppleCalendar.getPermissionStatus();
    console.log('[appleCalendar] getPermissionStatus result:', JSON.stringify(res));
    return res.status;
  } catch (err) {
    console.error('[appleCalendar] getPermissionStatus failed:', err);
    emitIntegrationEvent({
      provider: 'apple-calendar',
      event: 'plugin_call_failed',
      errorMessage: err instanceof Error ? err.message : String(err),
      meta: { call: 'getPermissionStatus' },
    });
    return 'unknown';
  }
}

export function isAppleCalendarAuthorizedStatus(status: string | null | undefined): boolean {
  return status === 'authorized' || status === 'fullAccess';
}

export async function verifyAppleCalendarPermission(): Promise<boolean> {
  const status = await getAppleCalendarPermissionStatus();
  return isAppleCalendarAuthorizedStatus(status);
}

export async function fetchAppleCalendarEvents(
  windowStart: Date,
  windowEnd: Date
): Promise<AppleCalendarEvent[]> {
  if (!isAppleCalendarSupported()) return [];
  try {
    const res = await AppleCalendar.fetchEvents({
      startISO: windowStart.toISOString(),
      endISO: windowEnd.toISOString(),
    });
    return res.events ?? [];
  } catch (err) {
    emitIntegrationEvent({
      provider: 'apple-calendar',
      event: 'plugin_call_failed',
      errorMessage: err instanceof Error ? err.message : String(err),
      meta: { call: 'fetchEvents' },
    });
    throw err;
  }
}

/**
 * Subscribe to native EKEventStoreChanged notifications. The native plugin
 * emits `calendarStoreChanged` whenever the user adds/edits/deletes events
 * on the device (Apple Calendar app, iCloud subscriptions, etc.). Callers
 * should debounce internally — events can arrive in bursts.
 *
 * Returns an unsubscribe function. Safe no-op on web.
 */
export async function onAppleCalendarStoreChanged(
  callback: () => void
): Promise<() => void> {
  if (!isAppleCalendarSupported()) return () => { /* noop */ };
  try {
    const handle = await AppleCalendar.addListener('calendarStoreChanged', () => {
      emitIntegrationEvent({ provider: 'apple-calendar', event: 'listener_registered', meta: { source: 'eventStoreChanged' } });
      try { callback(); } catch (err) { console.warn('[appleCalendar] store-changed callback failed:', err); }
    });
    return () => { void handle.remove(); };
  } catch (err) {
    console.warn('[appleCalendar] addListener calendarStoreChanged failed:', err);
    return () => { /* noop */ };
  }
}
