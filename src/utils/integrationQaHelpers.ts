/**
 * Developer/QA helper utilities for Apple integrations.
 * These are gated by `isQaDebugEnabled()` and are safe to call from anywhere.
 */

import { Capacitor } from '@capacitor/core';
import { isNativeApp, verifyHealthKitAccess, getHealthKitAuthorization } from '@/utils/healthKitCapacitor';
import { getAppleCalendarPermissionStatus, isAppleCalendarSupported } from '@/utils/appleCalendar';
import { syncHealthKitToBackend, clearHealthKitPermission } from '@/services/wearableSyncService';
import { syncAppleCalendarToBackend } from '@/services/appleCalendarSync';
import { clearLocalCalendarData, clearLocalWearableData } from '@/services/localDataStore';
import { emitIntegrationEvent } from './integrationTelemetry';

const QA_FLAG_KEY = 'mm_qa_debug_enabled';
const SIM_REVOKED_KEY = 'mm_sim_apple_health_revoked';
const SIM_STALE_KEY = 'mm_sim_apple_health_stale';

/**
 * QA debug surface is enabled when ANY of:
 *  - app is in dev (`import.meta.env.DEV`)
 *  - localStorage flag set
 *  - URL contains `?qa=1`
 *  - running on a non-production iOS build (TestFlight is signalled by the
 *    `MM_TESTFLIGHT` build-time flag, which we expose via env)
 */
export function isQaDebugEnabled(): boolean {
  try {
    if (import.meta.env?.DEV) return true;
    if (import.meta.env?.VITE_MM_QA_DEBUG === 'true' || import.meta.env?.VITE_MM_QA_DEBUG === '1') return true;
    if (typeof window !== 'undefined') {
      if (window.location.search.includes('qa=1')) {
        try { localStorage.setItem(QA_FLAG_KEY, '1'); } catch { /* */ }
        return true;
      }
    }
    if (typeof localStorage !== 'undefined' && localStorage.getItem(QA_FLAG_KEY) === '1') return true;
  } catch {
    // ignore
  }
  return false;
}

export function setQaDebugEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(QA_FLAG_KEY, '1');
    else localStorage.removeItem(QA_FLAG_KEY);
  } catch { /* */ }
}

export function isSimulatedRevokedPermission(): boolean {
  try { return localStorage.getItem(SIM_REVOKED_KEY) === '1'; } catch { return false; }
}
export function isSimulatedStaleSync(): boolean {
  try { return localStorage.getItem(SIM_STALE_KEY) === '1'; } catch { return false; }
}
export function setSimulatedRevokedPermission(on: boolean): void {
  try { on ? localStorage.setItem(SIM_REVOKED_KEY, '1') : localStorage.removeItem(SIM_REVOKED_KEY); } catch { /* */ }
  emitIntegrationEvent({ provider: 'apple-health', event: 'qa_action', meta: { action: 'simulate_revoked', on } });
}
export function setSimulatedStaleSync(on: boolean): void {
  try { on ? localStorage.setItem(SIM_STALE_KEY, '1') : localStorage.removeItem(SIM_STALE_KEY); } catch { /* */ }
  emitIntegrationEvent({ provider: 'apple-health', event: 'qa_action', meta: { action: 'simulate_stale', on } });
}

/** Re-run native verification for both Apple integrations. */
export async function qaReverifyAppleNative(): Promise<{
  healthKitAuthorized: boolean;
  healthKitDetail: { readAuthorized: string[]; readDenied: string[] };
  appleCalendarStatus: string;
}> {
  const native = isNativeApp();
  emitIntegrationEvent({ provider: 'system', event: 'qa_action', meta: { action: 'reverify_native', native } });
  const healthKitAuthorized = native ? await verifyHealthKitAccess() : false;
  const healthKitDetail = native
    ? await getHealthKitAuthorization().then(a => ({ readAuthorized: a.readAuthorized, readDenied: a.readDenied }))
    : { readAuthorized: [], readDenied: [] };
  const appleCalendarStatus = isAppleCalendarSupported() ? await getAppleCalendarPermissionStatus() : 'unsupported';
  return { healthKitAuthorized, healthKitDetail, appleCalendarStatus };
}

/** Force a fresh Apple Health sync (no UI side effects). */
export async function qaForceHealthSync() {
  emitIntegrationEvent({ provider: 'apple-health', event: 'qa_action', meta: { action: 'force_sync' } });
  return syncHealthKitToBackend();
}

/** Force a fresh Apple Calendar sync (no UI side effects). */
export async function qaForceAppleCalendarSync() {
  emitIntegrationEvent({ provider: 'apple-calendar', event: 'qa_action', meta: { action: 'force_sync' } });
  return syncAppleCalendarToBackend();
}

/** Clear all cached integration state (does NOT touch backend). */
export function qaClearLocalIntegrationCaches() {
  emitIntegrationEvent({ provider: 'system', event: 'qa_action', meta: { action: 'clear_local_caches' } });
  try { clearLocalCalendarData(); } catch { /* */ }
  try { clearLocalWearableData(); } catch { /* */ }
  try { clearHealthKitPermission(); } catch { /* */ }
  try { localStorage.removeItem('contextConnections'); } catch { /* */ }
}

export function qaPlatformInfo() {
  return {
    isNative: isNativeApp(),
    platform: Capacitor.getPlatform(),
    isAppleCalendarSupported: isAppleCalendarSupported(),
    dev: !!import.meta.env?.DEV,
  };
}

/** Backend-disconnect retry queue (used when network/backend disconnect fails). */
export interface PendingDisconnect {
  provider: 'apple-health' | 'apple-calendar';
  queuedAt: string;
  attempts: number;
}
const RETRY_KEY = 'mm_pending_integration_disconnects_v1';

export function getPendingDisconnects(): PendingDisconnect[] {
  try {
    const raw = localStorage.getItem(RETRY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function queuePendingDisconnect(provider: PendingDisconnect['provider']) {
  try {
    const existing = getPendingDisconnects().filter(p => p.provider !== provider);
    existing.push({ provider, queuedAt: new Date().toISOString(), attempts: 0 });
    localStorage.setItem(RETRY_KEY, JSON.stringify(existing));
    emitIntegrationEvent({ provider, event: 'disconnect_retry_queued', meta: { reason: 'backend_unreachable' } });
  } catch { /* */ }
}

export function clearPendingDisconnect(provider: PendingDisconnect['provider']) {
  try {
    const remaining = getPendingDisconnects().filter(p => p.provider !== provider);
    localStorage.setItem(RETRY_KEY, JSON.stringify(remaining));
  } catch { /* */ }
}