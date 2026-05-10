/**
 * Apple Integrations Debug Panel — gated by `isQaDebugEnabled()`.
 * Renders nothing for normal users.
 *
 * Surfaces:
 *   - native permission states
 *   - DB-derived connection states
 *   - last sync timestamps & stale flags
 *   - cached telemetry events
 *   - QA action buttons (force sync, simulate revoked, clear cache, re-verify)
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  isQaDebugEnabled,
  setQaDebugEnabled,
  qaReverifyAppleNative,
  qaForceHealthSync,
  qaForceAppleCalendarSync,
  qaClearLocalIntegrationCaches,
  qaPlatformInfo,
  isSimulatedRevokedPermission,
  setSimulatedRevokedPermission,
  isSimulatedStaleSync,
  setSimulatedStaleSync,
  getPendingDisconnects,
  isSimulatedOffline,
  setSimulatedOffline,
  isSimulatedSyncFailure,
  setSimulatedSyncFailure,
} from '@/utils/integrationQaHelpers';
import { peekAll as peekSyncQueue, depthByKind as queueDepthByKind, clear as clearSyncQueue } from '@/services/syncQueue';
import { drainQueueNow } from '@/services/syncRetryOrchestrator';
import {
  getNativeSyncDiagnostics,
  getNativeOutboxItems,
  flushNativeOutbox,
  clearNativeOutbox,
  type NativeOutboxDiagnostics,
  type NativeOutboxItem,
} from '@/utils/nativeBackgroundSync';
import {
  getIntegrationEvents,
  clearIntegrationEvents,
  subscribeIntegrationEvents,
  type IntegrationEvent,
} from '@/utils/integrationTelemetry';
import {
  clearAllScheduledLocalNotifications,
  dumpPendingLocalNotifications,
  getNotificationDiagnostics,
  refreshNotificationPermissions,
  sendLocalTestNotificationNow,
  type NotificationDiagnostics,
} from '@/utils/notificationDiagnostics';

interface DerivedSnapshot {
  appleHealthLabel?: string;
  appleHealthLastSync?: string | null;
  appleHealthSyncStatus?: string | null;
  appleHealthConnectionStatus?: string | null;
  appleCalendarLabel?: string;
  appleCalendarLastSync?: string | null;
  appleCalendarPermissionStatus?: string | null;
}

export default function AppleIntegrationsDebugPanel({ derived }: { derived: DerivedSnapshot }) {
  const enabled = isQaDebugEnabled();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<IntegrationEvent[]>(() => getIntegrationEvents());
  const [verifyResult, setVerifyResult] = useState<Awaited<ReturnType<typeof qaReverifyAppleNative>> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, force] = useState(0);
  const [nativeDiag, setNativeDiag] = useState<NativeOutboxDiagnostics | null>(null);
  const [nativeOutbox, setNativeOutbox] = useState<Record<string, NativeOutboxItem[]>>({});
  const [notificationDiag, setNotificationDiag] = useState<NotificationDiagnostics | null>(null);

  useEffect(() => {
    return subscribeIntegrationEvents((evts) => setEvents([...evts]));
  }, []);

  const refreshNative = async () => {
    const [d, items, notif] = await Promise.all([getNativeSyncDiagnostics(), getNativeOutboxItems(), getNotificationDiagnostics()]);
    setNativeDiag(d);
    setNativeOutbox(items);
    setNotificationDiag(notif);
  };

  useEffect(() => {
    if (!open) return;
    refreshNative();
    const id = setInterval(refreshNative, 5000);
    return () => clearInterval(id);
  }, [open]);

  const platform = useMemo(() => qaPlatformInfo(), []);
  const pending = getPendingDisconnects();
  const queueItems = peekSyncQueue();
  const queueDepth = queueDepthByKind();

  if (!enabled) return null;

  const recent = events.slice(-30).reverse();

  const run = async (label: string, fn: () => Promise<unknown> | unknown) => {
    setBusy(label);
    try { await fn(); } finally { setBusy(null); }
  };

  return (
    <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-4 py-2 text-xs font-mono text-muted-foreground hover:text-foreground"
      >
        {open ? '▾' : '▸'} QA · Apple Integrations Debug
        <span className="ml-2 opacity-60">
          ({platform.platform}{platform.isNative ? ' · native' : ' · web'} · events {events.length})
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 text-xs font-mono text-foreground/80">
          <section>
            <div className="font-semibold text-foreground">Platform</div>
            <pre className="mt-1 whitespace-pre-wrap break-all">
{JSON.stringify(platform, null, 2)}
            </pre>
          </section>

          <section>
            <div className="font-semibold text-foreground">Derived UI state</div>
            <pre className="mt-1 whitespace-pre-wrap break-all">
{JSON.stringify(derived, null, 2)}
            </pre>
          </section>

          <section>
            <div className="font-semibold text-foreground">Native verification (last run)</div>
            <pre className="mt-1 whitespace-pre-wrap break-all">
{verifyResult ? JSON.stringify(verifyResult, null, 2) : '— not run —'}
            </pre>
          </section>

          <section>
            <div className="font-semibold text-foreground">Pending disconnect retries</div>
            <pre className="mt-1 whitespace-pre-wrap break-all">
{pending.length ? JSON.stringify(pending, null, 2) : 'none'}
            </pre>
          </section>

          <section>
            <div className="font-semibold text-foreground">
              Offline sync queue (health: {queueDepth['apple-health']}, calendar: {queueDepth['apple-calendar']})
            </div>
            <pre className="mt-1 whitespace-pre-wrap break-all max-h-40 overflow-auto">
{queueItems.length ? JSON.stringify(queueItems.map(i => ({
  id: i.id, kind: i.kind, attempts: i.attempts, lastError: i.lastError, nextAttemptAt: i.nextAttemptAt,
})), null, 2) : 'empty'}
            </pre>
          </section>

          <section>
            <div className="font-semibold text-foreground">
              Native iOS outbox (
              health: {nativeDiag?.outboxDepth?.['apple-health'] ?? '—'},
              calendar: {nativeDiag?.outboxDepth?.['apple-calendar'] ?? '—'})
            </div>
            <pre className="mt-1 whitespace-pre-wrap break-all">
{nativeDiag ? JSON.stringify(nativeDiag, null, 2) : '— web/non-ios or unavailable —'}
            </pre>
            <pre className="mt-1 whitespace-pre-wrap break-all max-h-40 overflow-auto">
{Object.keys(nativeOutbox).length
  ? JSON.stringify(
      Object.fromEntries(Object.entries(nativeOutbox).map(([k, arr]) => [
        k,
        arr.map((it) => ({
          id: it.id, retryCount: it.retryCount, lastError: it.lastError, lastAttemptAt: it.lastAttemptAt, createdAt: it.createdAt,
        })),
      ])),
      null,
      2,
    )
  : 'empty'}
            </pre>
            <div className="flex flex-wrap gap-2 mt-2">
              <Button size="sm" variant="outline" disabled={!!busy}
                onClick={() => run('flushNative', () => flushNativeOutbox().then(refreshNative))}>
                Flush native outbox
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy}
                onClick={() => run('clearNativeHealth', () => clearNativeOutbox('apple-health').then(refreshNative))}>
                Clear native health
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy}
                onClick={() => run('clearNativeCal', () => clearNativeOutbox('apple-calendar').then(refreshNative))}>
                Clear native calendar
              </Button>
              <Button size="sm" variant="ghost" disabled={!!busy}
                onClick={refreshNative}>
                Refresh native
              </Button>
            </div>
          </section>

          <section>
            <div className="font-semibold text-foreground">Notifications</div>
            <pre className="mt-1 whitespace-pre-wrap break-all max-h-48 overflow-auto">
{notificationDiag ? JSON.stringify(notificationDiag, null, 2) : '— unavailable —'}
            </pre>
            <div className="flex flex-wrap gap-2 mt-2">
              <Button size="sm" variant="outline" disabled={!!busy}
                onClick={() => run('localTest', async () => setNotificationDiag(await sendLocalTestNotificationNow()))}>
                Send local test now
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy}
                onClick={() => run('notifPerm', async () => setNotificationDiag(await refreshNotificationPermissions()))}>
                Refresh notification permission
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy}
                onClick={() => run('pendingNotif', async () => setNotificationDiag(await dumpPendingLocalNotifications()))}>
                Dump pending notifications
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy}
                onClick={() => run('clearNotif', async () => setNotificationDiag(await clearAllScheduledLocalNotifications()))}>
                Clear scheduled notifications
              </Button>
            </div>
          </section>

          <section className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" disabled={!!busy}
              onClick={() => run('verify', async () => setVerifyResult(await qaReverifyAppleNative()))}>
              Re-verify native
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy}
              onClick={() => run('healthSync', qaForceHealthSync)}>
              Force Health sync
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy}
              onClick={() => run('calSync', qaForceAppleCalendarSync)}>
              Force Apple Cal sync
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy}
              onClick={() => { qaClearLocalIntegrationCaches(); force((n) => n + 1); }}>
              Clear local caches
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy}
              onClick={() => { setSimulatedRevokedPermission(!isSimulatedRevokedPermission()); force((n) => n + 1); }}>
              {isSimulatedRevokedPermission() ? '✓ Simulated revoked' : 'Simulate revoked'}
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy}
              onClick={() => { setSimulatedStaleSync(!isSimulatedStaleSync()); force((n) => n + 1); }}>
              {isSimulatedStaleSync() ? '✓ Simulated stale' : 'Simulate stale'}
            </Button>
            <Button size="sm" variant="ghost" disabled={!!busy}
              onClick={() => clearIntegrationEvents()}>
              Clear telemetry
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy}
              onClick={() => run('drain', () => drainQueueNow('qa_manual').then(() => force(n => n + 1)))}>
              Drain queue now
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy}
              onClick={() => { clearSyncQueue(); force(n => n + 1); }}>
              Clear sync queue
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy}
              onClick={() => { setSimulatedOffline(!isSimulatedOffline()); force(n => n + 1); }}>
              {isSimulatedOffline() ? '✓ Simulated offline' : 'Simulate offline'}
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy}
              onClick={() => { setSimulatedSyncFailure(!isSimulatedSyncFailure()); force(n => n + 1); }}>
              {isSimulatedSyncFailure() ? '✓ One-shot failure armed' : 'Arm one-shot failure'}
            </Button>
            <Button size="sm" variant="ghost"
              onClick={() => { setQaDebugEnabled(false); window.location.reload(); }}>
              Hide panel
            </Button>
          </section>

          <section>
            <div className="font-semibold text-foreground">Recent telemetry (last 30, newest first)</div>
            <div className="mt-1 max-h-72 overflow-auto space-y-1">
              {recent.length === 0 && <div className="opacity-60">no events yet</div>}
              {recent.map((e, i) => (
                <div key={i} className="border-l-2 border-border pl-2">
                  <div>
                    <span className="opacity-60">{e.ts.replace('T', ' ').slice(5, 19)}</span>
                    {' · '}
                    <span className="font-semibold">{e.provider}</span>
                    {' · '}
                    <span>{e.event}</span>
                  </div>
                  {(e.errorCode || e.errorMessage) && (
                    <div className="text-destructive">
                      {e.errorCode}{e.errorMessage ? `: ${e.errorMessage}` : ''}
                    </div>
                  )}
                  {e.meta && (
                    <div className="opacity-70 break-all">{JSON.stringify(e.meta)}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
