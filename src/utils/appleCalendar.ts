/**
 * Apple Calendar (EventKit) bridge — native iOS only.
 *
 * Talks to the AppleCalendarPlugin Swift class via Capacitor.registerPlugin.
 * On web, every method short-circuits to a "not supported" response.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

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
}

const AppleCalendar = registerPlugin<AppleCalendarPlugin>('AppleCalendar');

export function isAppleCalendarSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

export async function requestAppleCalendarPermission(): Promise<boolean> {
  if (!isAppleCalendarSupported()) return false;
  try {
    const res = await AppleCalendar.requestPermission();
    console.log('[appleCalendar] requestPermission result:', JSON.stringify(res));
    return !!res.granted && isAppleCalendarAuthorizedStatus(res.status);
  } catch (err) {
    console.error('[appleCalendar] requestPermission failed:', err);
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
  const res = await AppleCalendar.fetchEvents({
    startISO: windowStart.toISOString(),
    endISO: windowEnd.toISOString(),
  });
  return res.events ?? [];
}
