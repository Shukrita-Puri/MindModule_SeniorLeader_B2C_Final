/**
 * Offline-first sync queue (localStorage-backed).
 *
 * Used by foreground Apple Health and Apple Calendar sync paths to safely
 * persist payloads when the network/auth/server is unavailable. The native
 * iOS background sync bridge uses its own Keychain outbox for the
 * background-execution path; this module covers the foreground / web path.
 *
 * Idempotency is delegated to the edge functions, which upsert on
 * `(user_id, summary_date)` for wearables and `(user_id, provider, external_id)`
 * for calendar events. Re-posting the same payload is therefore safe.
 */

import { emitIntegrationEvent } from '@/utils/integrationTelemetry';

export type SyncQueueKind = 'apple-health' | 'apple-calendar';

export interface SyncQueueItem<P = unknown> {
  id: string;
  kind: SyncQueueKind;
  payload: P;
  enqueuedAt: string;
  attempts: number;
  lastError?: string | null;
  nextAttemptAt: string;
}

const STORAGE_KEY = 'mm.syncQueue.v1';
const PER_KIND_CAP = 50;

function safeRead(): SyncQueueItem[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SyncQueueItem[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(items: SyncQueueItem[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  } catch {
    /* storage full / disabled — ignore */
  }
}

function genId(): string {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* */ }
  return `sq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function enqueue<P>(kind: SyncQueueKind, payload: P, lastError?: string | null): SyncQueueItem<P> {
  const items = safeRead();
  const sameKind = items.filter((i) => i.kind === kind);
  if (sameKind.length >= PER_KIND_CAP) {
    // Drop oldest of this kind
    const oldest = sameKind[0];
    const idx = items.findIndex((i) => i.id === oldest.id);
    if (idx >= 0) items.splice(idx, 1);
    emitIntegrationEvent({
      provider: kind === 'apple-health' ? 'apple-health' : 'apple-calendar',
      event: 'queue_overflow',
      meta: { droppedId: oldest.id, cap: PER_KIND_CAP },
    });
  }
  const item: SyncQueueItem<P> = {
    id: genId(),
    kind,
    payload,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: lastError ?? null,
    nextAttemptAt: new Date().toISOString(),
  };
  items.push(item as SyncQueueItem);
  safeWrite(items);
  emitIntegrationEvent({
    provider: kind === 'apple-health' ? 'apple-health' : 'apple-calendar',
    event: 'queue_enqueued',
    meta: { id: item.id, depth: items.filter((i) => i.kind === kind).length, lastError },
  });
  return item;
}

export function peekAll(): SyncQueueItem[] {
  return safeRead();
}

export function depthByKind(): Record<SyncQueueKind, number> {
  const items = safeRead();
  return {
    'apple-health': items.filter((i) => i.kind === 'apple-health').length,
    'apple-calendar': items.filter((i) => i.kind === 'apple-calendar').length,
  };
}

export function removeById(id: string): void {
  const items = safeRead().filter((i) => i.id !== id);
  safeWrite(items);
}

/** Backoff schedule (ms): 30s, 2m, 5m, 15m, 60m. After max attempts → drop. */
const BACKOFF_MS = [30_000, 120_000, 300_000, 900_000, 3_600_000];
const MAX_ATTEMPTS = 5;

export function markFailed(id: string, err: string | null | undefined): void {
  const items = safeRead();
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return;
  const item = items[idx];
  item.attempts += 1;
  item.lastError = err ?? null;
  if (item.attempts >= MAX_ATTEMPTS) {
    items.splice(idx, 1);
    safeWrite(items);
    emitIntegrationEvent({
      provider: item.kind === 'apple-health' ? 'apple-health' : 'apple-calendar',
      event: 'queue_item_dropped',
      meta: { id, attempts: item.attempts, lastError: item.lastError },
    });
    return;
  }
  const delay = BACKOFF_MS[Math.min(item.attempts - 1, BACKOFF_MS.length - 1)];
  item.nextAttemptAt = new Date(Date.now() + delay).toISOString();
  items[idx] = item;
  safeWrite(items);
  emitIntegrationEvent({
    provider: item.kind === 'apple-health' ? 'apple-health' : 'apple-calendar',
    event: 'queue_item_retry',
    meta: { id, attempts: item.attempts, nextAttemptAt: item.nextAttemptAt, lastError: err },
  });
}

export function clear(): void {
  safeWrite([]);
  emitIntegrationEvent({ provider: 'system', event: 'queue_cleared' });
}

export function clearByKind(kind: SyncQueueKind): void {
  const items = safeRead().filter((i) => i.kind !== kind);
  safeWrite(items);
  emitIntegrationEvent({
    provider: kind === 'apple-health' ? 'apple-health' : 'apple-calendar',
    event: 'queue_cleared',
    meta: { kind },
  });
}

export function dueItems(now: number = Date.now()): SyncQueueItem[] {
  return safeRead().filter((i) => new Date(i.nextAttemptAt).getTime() <= now);
}
