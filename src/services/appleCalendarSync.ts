/**
 * Apple Calendar sync service — native-authoritative trigger only.
 *
 * As of the native-authority rollout (see docs/APPLE_HEALTH_NATIVE_AUTHORITY.md
 * for the mirror-architecture on wearables), the JS layer is NOT permitted to:
 *   - read EventKit and POST to `sync-apple-calendar`
 *   - write durable Apple `calendar_connections` presence/last_sync
 *
 * The only authoritative writer is the native iOS bridge
 * `AppleCalendarBackgroundSyncBridge` which reads EventKit, enqueues to the
 * native outbox, and POSTs to `sync-apple-calendar`. That edge function stamps
 * `status_source='native-ios'` + `status_authoritative_at=now()` on the
 * connection row, and `calendar-auth update_status` for Apple is a rejected
 * no-op.
 *
 * This module retains the `syncAppleCalendarToBackend` name (many call sites)
 * but is now a thin trigger that fans out to the native bridge on iOS. On web
 * or non-iOS native it returns an unsupported result. It never uploads events
 * itself.
 */

import { isAppleCalendarSupported } from '@/utils/appleCalendar';
import { emitIntegrationEvent } from '@/utils/integrationTelemetry';
import { forceNativeCalendarSync } from '@/utils/nativeBackgroundSync';

export interface AppleCalendarSyncResult {
  success: boolean;
  eventCount?: number;
  error?: string;
}

/**
 * Retained for compatibility only. Kept exported so existing type imports do
 * not break. New code must not use this shape.
 */
export interface AppleCalendarSyncPayload {
  windowStart: string;
  windowEnd: string;
  events: unknown[];
}

/**
 * Native-authority trigger. Delegates to the native iOS bridge which owns
 * both the EventKit read and the authoritative POST to `sync-apple-calendar`.
 *
 * The result is fire-and-forget: the native bridge finishes its own drain and
 * the connection row is stamped by the edge function. The JS layer never sees
 * a per-sync event count from here — the caller should re-read
 * `calendar_connections.last_sync` to observe truth.
 */
export async function syncAppleCalendarToBackend(
  options?: { reason?: string },
): Promise<AppleCalendarSyncResult> {
  const reason = options?.reason ?? 'manual';
  if (!isAppleCalendarSupported()) {
    return { success: false, error: 'Apple Calendar is only available on iOS' };
  }
  emitIntegrationEvent({
    provider: 'apple-calendar',
    event: 'sync_started',
    meta: { reason, source: 'native-trigger' },
  });
  try {
    await forceNativeCalendarSync();
    emitIntegrationEvent({
      provider: 'apple-calendar',
      event: 'sync_success',
      meta: { reason, source: 'native-trigger', delegated: true },
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitIntegrationEvent({
      provider: 'apple-calendar',
      event: 'sync_failed',
      errorCode: 'native_trigger_failed',
      errorMessage: message,
      meta: { reason },
    });
    return { success: false, error: message };
  }
}
