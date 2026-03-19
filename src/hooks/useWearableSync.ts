/**
 * Hook for wearable (Apple Watch / HealthKit) status.
 *
 * Connection state model:
 * - disconnected: user has not connected or explicitly disconnected
 * - connected: HealthKit permission is valid and sync is healthy
 * - connected_but_waiting_for_data: HealthKit permission is valid, but no recent HRV samples exist yet
 * - sync_delayed: HealthKit permission is valid, but the latest read/persist attempt was delayed or temporary failed
 * - permission_revoked: HealthKit authorization is no longer valid
 * - error: unexpected unrecoverable failure
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { isNativeApp, requestHealthKitPermissions, verifyHealthKitAccess } from '@/utils/healthKitCapacitor';
import { syncHealthKitToBackend, isHealthKitPermissionGranted, type WearableConnectionState } from '@/services/wearableSyncService';
import { supabase } from '@/integrations/supabase/client';

interface WearableSyncState {
  connectionState: WearableConnectionState;
  hasWearable: boolean;
  hasData: boolean;
  isSyncing: boolean;
  lastSync: Date | null;
  hrv: number | null;
  error: string | null;
  triggerSync: () => Promise<boolean>;
}

/** Auto-sync cadence: 30 minutes */
const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;

export function useWearableSync(): WearableSyncState {
  const { user } = useAuth();
  const [connectionState, setConnectionState] = useState<WearableConnectionState>('disconnected');
  const [hasData, setHasData] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [hrv, setHrv] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);
  const syncingRef = useRef(false); // guard against duplicate syncs
  const lastSyncRef = useRef<Date | null>(null); // mutable ref for interval checks

  const hasWearable = connectionState === 'connected'
    || connectionState === 'connected_but_waiting_for_data'
    || connectionState === 'sync_delayed';

  // Keep mutable ref in sync
  useEffect(() => { lastSyncRef.current = lastSync; }, [lastSync]);

  // ---- Fetch latest wearable row from DB ----
  const fetchLatestFromDB = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error: dbErr } = await supabase
        .from('wearable_data')
        .select('hrv, updated_at, summary_date')
        .eq('user_id', user.id)
        .order('summary_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dbErr) {
        console.warn('[useWearableSync] DB fetch error:', dbErr);
        return;
      }

      if (data) {
        setHasData(true);
        setHrv(data.hrv ? Number(data.hrv) : null);
        setLastSync(data.updated_at ? new Date(data.updated_at) : null);
      } else {
        setHasData(false);
        setHrv(null);
        setLastSync(null);
      }
    } catch (err) {
      console.warn('[useWearableSync] fetch error:', err);
    }
  }, [user?.id]);

  // ---- Core sync: HealthKit → backend ----
  const runSync = useCallback(async (silent = false): Promise<boolean> => {
    if (!isNativeApp()) return false;
    if (syncingRef.current) {
      console.log('[useWearableSync] Sync already in progress, skipping');
      return false;
    }

    syncingRef.current = true;
    if (!silent) setIsSyncing(true);
    setError(null);

    try {
      console.log('[useWearableSync] Running sync...');
      const result = await syncHealthKitToBackend();
      console.log('[useWearableSync] Sync result:', result.connectionState, 'hasData:', result.hasData);

      setConnectionState(result.connectionState);

      if (result.connectionState === 'connected') {
        await fetchLatestFromDB();
        return true;
      } else if (
        result.connectionState === 'connected_but_waiting_for_data'
        || result.connectionState === 'sync_delayed'
      ) {
        return true;
      } else {
        if (!silent) setError('Sync could not complete');
        return false;
      }
    } catch (err) {
      console.error('[useWearableSync] sync error:', err);
      if (!silent) setError('Sync failed');
      return false;
    } finally {
      syncingRef.current = false;
      if (!silent) setIsSyncing(false);
    }
  }, [fetchLatestFromDB]);

  // ---- Public triggerSync (manual button) ----
  const triggerSync = useCallback(async (): Promise<boolean> => {
    if (!isNativeApp()) return false;

    setIsSyncing(true);
    setError(null);

    try {
      // Always re-request permission on manual trigger to handle first-time + re-grant
      const granted = await requestHealthKitPermissions();
      if (!granted) {
        setError('HealthKit permission not granted');
        setConnectionState('permission_revoked');
        setIsSyncing(false);
        return false;
      }
      // Permission confirmed — run full sync
      return await runSync(false);
    } catch (err) {
      console.error('[useWearableSync] triggerSync error:', err);
      setError('Sync failed');
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [runSync]);

  // ---- Sync if stale (called on init, resume, interval) ----
  const syncIfStale = useCallback(async () => {
    if (!isNativeApp() || !user?.id) return;

    // Only auto-sync if we have evidence of prior permission
    if (!isHealthKitPermissionGranted()) {
      console.log('[useWearableSync] No cached permission flag, skipping auto-sync');
      return;
    }

    const now = Date.now();
    const last = lastSyncRef.current?.getTime() ?? 0;
    const elapsed = now - last;

    if (elapsed > AUTO_SYNC_INTERVAL_MS) {
      console.log('[useWearableSync] Data stale (' + Math.round(elapsed / 60000) + 'min), triggering background sync...');
      await runSync(true);
    } else {
      console.log('[useWearableSync] Data fresh (' + Math.round(elapsed / 60000) + 'min), skipping sync');
    }
  }, [user?.id, runSync]);

  // ---- Initial load: fetch DB then determine state via live permission check ----
  useEffect(() => {
    if (!user?.id || initRef.current) return;
    initRef.current = true;

    (async () => {
      // 1. Fetch DB state first (for HRV display)
      await fetchLatestFromDB();

      // 2. On native, verify live permission + sync if stale
      if (isNativeApp() && isHealthKitPermissionGranted()) {
        console.log('[useWearableSync] Init: cached permission exists, verifying live access...');
        const liveAccess = await verifyHealthKitAccess();
        if (liveAccess) {
          console.log('[useWearableSync] Init: live HealthKit access confirmed');
          await syncIfStale();
        } else {
          console.log('[useWearableSync] Init: live HealthKit access DENIED — marking permission_revoked');
          setConnectionState('permission_revoked');
        }
      } else if (!isNativeApp()) {
        // Web: rely on DB data only for display
        // connectionState stays whatever fetchLatestFromDB set (not_connected if no data)
      }
    })();
  }, [user?.id, fetchLatestFromDB, syncIfStale]);

  // ---- App resume listener (foreground) ----
  useEffect(() => {
    if (!isNativeApp() || !user?.id) return;

    let cleanup: (() => void) | null = null;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('appStateChange', (state) => {
          if (state.isActive) {
            console.log('[useWearableSync] App resumed to foreground — checking sync freshness');
            syncIfStale();
          }
        });
        cleanup = () => listener.remove();
      } catch (err) {
        console.warn('[useWearableSync] Could not register app state listener:', err);
      }
    })();

    return () => { cleanup?.(); };
  }, [user?.id, syncIfStale]);

  // ---- 30-minute interval fallback ----
  useEffect(() => {
    if (!isNativeApp() || !user?.id) return;

    const interval = setInterval(() => {
      syncIfStale();
    }, AUTO_SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [user?.id, syncIfStale]);

  return { connectionState, hasWearable, hasData, isSyncing, lastSync, hrv, error, triggerSync };
}
