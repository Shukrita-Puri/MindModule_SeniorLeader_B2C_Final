/**
 * Apple Calendar sync service — native iOS only.
 *
 * Reads events via the AppleCalendar Capacitor plugin and posts them to the
 * `sync-apple-calendar` edge function (authenticated with Auth0 Bearer token).
 */

import { fetchAppleCalendarEvents, isAppleCalendarSupported } from '@/utils/appleCalendar';
import { getAuthToken } from '@/services/authTokenService';

export interface AppleCalendarSyncResult {
  success: boolean;
  eventCount?: number;
  error?: string;
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

  const { start, end } = defaultSyncWindow();

  let events;
  try {
    events = await fetchAppleCalendarEvents(start, end);
  } catch (err) {
    console.error('[appleCalendarSync] fetchEvents failed:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to read Apple Calendar' };
  }

  const token = await getAuthToken();
  if (!token) {
    return { success: false, error: 'Authentication required' };
  }

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  try {
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/sync-apple-calendar`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          windowStart: start.toISOString(),
          windowEnd: end.toISOString(),
          events,
        }),
      }
    );
    const data = await res.json();
    if (data?.success === false) {
      return { success: false, error: data.error || 'Sync failed' };
    }
    return { success: true, eventCount: data.eventCount ?? events.length };
  } catch (err) {
    console.error('[appleCalendarSync] sync-apple-calendar failed:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Sync failed' };
  }
}