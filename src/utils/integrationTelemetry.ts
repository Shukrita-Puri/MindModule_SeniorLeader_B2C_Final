/**
 * Integration telemetry — lightweight structured event logger for Apple
 * Health and Apple Calendar (and any other integration that wants to opt in).
 *
 * - Always console.logs the event with a JSON payload for production logs.
 * - Maintains an in-memory ring buffer (last 200 events) consumable by the
 *   QA Debug Panel.
 * - Mirrors the most recent buffer to localStorage so it survives reloads in
 *   QA/TestFlight builds.
 *
 * Safe to call from any environment. Never throws.
 */

export type IntegrationProvider =
  | 'apple-health'
  | 'apple-calendar'
  | 'google-calendar'
  | 'microsoft-calendar'
  | 'system';

export type IntegrationEventName =
  // permissions
  | 'permission_request_started'
  | 'permission_granted'
  | 'permission_denied'
  | 'permission_revoked_external'
  // verification
  | 'native_verify_success'
  | 'native_verify_failure'
  // connect / disconnect
  | 'connect_started'
  | 'connect_success'
  | 'connect_failed'
  | 'disconnect_started'
  | 'disconnect_success'
  | 'disconnect_failed'
  | 'disconnect_retry_queued'
  // sync
  | 'sync_started'
  | 'sync_success'
  | 'sync_partial'
  | 'sync_failed'
  | 'sync_stale_detected'
  // listeners / app lifecycle
  | 'app_resume_refresh'
  | 'listener_registered'
  | 'listener_unregistered'
  // generic
  | 'plugin_call_failed'
  | 'qa_action';

export interface IntegrationEvent {
  ts: string;                       // ISO timestamp
  provider: IntegrationProvider;
  event: IntegrationEventName;
  userId?: string | null;
  connectionState?: string | null;
  syncState?: string | null;
  nativePermissionState?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  meta?: Record<string, unknown>;
}

const BUFFER_MAX = 200;
const STORAGE_KEY = 'mm_integration_telemetry_buffer_v1';

let buffer: IntegrationEvent[] = [];

try {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (raw) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) buffer = parsed.slice(-BUFFER_MAX);
  }
} catch {
  // ignore — corrupted buffer is non-fatal
}

type Listener = (events: IntegrationEvent[]) => void;
const listeners = new Set<Listener>();

function persist() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
    }
  } catch {
    // storage full / disabled — ignore
  }
}

export function emitIntegrationEvent(evt: Omit<IntegrationEvent, 'ts'> & { ts?: string }): void {
  try {
    const full: IntegrationEvent = { ts: evt.ts ?? new Date().toISOString(), ...evt };
    buffer.push(full);
    if (buffer.length > BUFFER_MAX) buffer = buffer.slice(-BUFFER_MAX);
    persist();
    // Production-safe structured log: one line, JSON payload, easy to grep.
    // Use console.log so it surfaces in iOS device console / TestFlight logs.
    console.log(`[itel] ${full.provider} ${full.event}`, JSON.stringify(full));
    listeners.forEach((l) => {
      try { l(buffer); } catch { /* ignore listener errors */ }
    });
  } catch {
    // Telemetry must NEVER break the caller.
  }
}

export function getIntegrationEvents(): IntegrationEvent[] {
  return [...buffer];
}

export function clearIntegrationEvents(): void {
  buffer = [];
  persist();
  listeners.forEach((l) => { try { l(buffer); } catch { /* */ } });
}

export function subscribeIntegrationEvents(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
