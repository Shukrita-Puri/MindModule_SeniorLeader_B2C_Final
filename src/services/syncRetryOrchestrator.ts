/**
 * Sync retry orchestrator.
 *
 * Drains the offline-first sync queue when:
 *  - the browser/device comes back online
 *  - the Capacitor app resumes from background
 *  - the auth token has just been refreshed
 *  - manually triggered from the QA debug panel
 *
 * Idempotency relies on the edge functions' upserts. The orchestrator is
 * a singleton — `startSyncOrchestrator()` is safe to call multiple times.
 */

import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  dueItems,
  markFailed,
  removeById,
  type SyncQueueItem,
} from '@/services/syncQueue';
import { postWearableDirect, type WearablePersistPayload } from '@/services/wearableSyncService';
import { postAppleCalendarDirect, type AppleCalendarSyncPayload } from '@/services/appleCalendarSync';
import { emitIntegrationEvent } from '@/utils/integrationTelemetry';

const DRAIN_DEBOUNCE_MS = 5_000;
let lastDrainAt = 0;
let draining = false;
let started = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function processItem(item: SyncQueueItem): Promise<{ ok: boolean; error?: string }> {
  if (item.kind === 'apple-health') {
    const r = await postWearableDirect(item.payload as WearablePersistPayload, item.id);
    return { ok: r.ok, error: r.error };
  }
  if (item.kind === 'apple-calendar') {
    const r = await postAppleCalendarDirect(item.payload as AppleCalendarSyncPayload, item.id);
    return { ok: r.ok, error: r.error };
  }
  return { ok: false, error: 'unknown_kind' };
}

export async function drainQueueNow(reason: string = 'manual'): Promise<{ attempted: number; succeeded: number; failed: number }> {
  const now = Date.now();
  if (draining || now - lastDrainAt < DRAIN_DEBOUNCE_MS) {
    return { attempted: 0, succeeded: 0, failed: 0 };
  }
  draining = true;
  lastDrainAt = now;

  const items = dueItems(now);
  emitIntegrationEvent({
    provider: 'system',
    event: 'queue_drained_start',
    meta: { reason, total: items.length },
  });

  let succeeded = 0;
  let failed = 0;

  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // Skip when truly offline — wait for `online` event.
      emitIntegrationEvent({
        provider: 'system',
        event: 'queue_drained_complete',
        meta: { reason, attempted: 0, skipped: 'offline' },
      });
      return { attempted: 0, succeeded: 0, failed: 0 };
    }
    for (const item of items) {
      // eslint-disable-next-line no-await-in-loop
      const r = await processItem(item);
      if (r.ok) {
        removeById(item.id);
        succeeded += 1;
      } else {
        markFailed(item.id, r.error);
        failed += 1;
      }
    }
  } finally {
    draining = false;
    emitIntegrationEvent({
      provider: 'system',
      event: 'queue_drained_complete',
      meta: { reason, attempted: items.length, succeeded, failed },
    });
  }

  return { attempted: items.length, succeeded, failed };
}

export function startSyncOrchestrator(): void {
  if (started) return;
  started = true;

  // Online listener — drain immediately when network returns.
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      void drainQueueNow('online');
    });
    // Auth-token refresh signal.
    window.addEventListener('mm:auth-token-refreshed', () => {
      void drainQueueNow('auth_refreshed');
    });
  }

  // Capacitor app-resume.
  try {
    if (Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', (state) => {
        if (state.isActive) void drainQueueNow('app_resume');
      });
    }
  } catch (err) {
    console.warn('[syncRetryOrchestrator] App listener setup failed:', err);
  }

  // Periodic poll (web + native, every 60s) — handles the per-item backoff
  // schedule so items become "due" without external triggers.
  intervalHandle = setInterval(() => {
    void drainQueueNow('interval');
  }, 60_000);

  emitIntegrationEvent({ provider: 'system', event: 'listener_registered', meta: { listener: 'sync_orchestrator' } });
}

export function stopSyncOrchestrator(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  started = false;
}
