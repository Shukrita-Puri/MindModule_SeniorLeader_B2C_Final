/**
 * Hook for wearable (Apple Watch / HealthKit) data freshness.
 * 
 * Connection state model:
 * - not_connected: no permission, no data
 * - permission_granted_no_data: HealthKit access verified but no HRV samples
 * - connected_and_synced: HealthKit access + data persisted to backend
 * - reconnect_required: had data before but current access cannot be verified
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { isNativeApp, requestHealthKitPermissions, verifyHealthKitAccess } from '@/utils/healthKitCapacitor';
import { syncHealthKitToBackend, type WearableConnectionState } from '@/services/wearableSyncService';
import { supabase } from '@/integrations/supabase/client';

interface WearableSyncState {
  /** Computed connection state */
  connectionState: WearableConnectionState;
  /** True when HealthKit permission is granted (even without data) */
  hasWearable: boolean;
  /** True when actual HRV data exists in DB */
  hasData: boolean;
  isSyncing: boolean;
  lastSync: Date | null;
  hrv: number | null;
  error: string | null;
  triggerSync: () => Promise<boolean>;
}

const STALE_THRESHOLD_MS = 1 * 60 * 60 * 1000; // 1 hour

export function useWearableSync(): WearableSyncState {
  const { user } = useAuth();
  const [connectionState, setConnectionState] = useState<WearableConnectionState>('not_connected');
  const [hasData, setHasData] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [hrv, setHrv] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  const hasWearable = connectionState === 'permission_granted_no_data' 
    || connectionState === 'connected_and_synced';

  // Fetch latest wearable row from DB
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

        // Check if data is recent (within 7 days) to determine if actively connected
        const updatedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0;
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - updatedAt < sevenDaysMs) {
          setConnectionState('connected_and_synced');
        } else {
          // Old data exists but no recent sync — needs reconnect on native
          setConnectionState(isNativeApp() ? 'reconnect_required' : 'not_connected');
        }
      } else {
        setHasData(false);
        setConnectionState('not_connected');
      }
    } catch (err) {
      console.warn('[useWearableSync] fetch error:', err);
    }
  }, [user?.id]);

  // Trigger a fresh HealthKit → backend sync
  const triggerSync = useCallback(async (): Promise<boolean> => {
    if (!isNativeApp()) return false;

    setIsSyncing(true);
    setError(null);

    try {
      const granted = await requestHealthKitPermissions();
      if (!granted) {
        setError('HealthKit permission not granted');
        setConnectionState('not_connected');
        setIsSyncing(false);
        return false;
      }

      const result = await syncHealthKitToBackend();
      setConnectionState(result.connectionState);

      if (result.connectionState === 'connected_and_synced') {
        await fetchLatestFromDB();
        return true;
      } else if (result.connectionState === 'permission_granted_no_data') {
        // Connected but no HRV samples yet — not an error
        return true;
      } else {
        setError('Sync failed');
        return false;
      }
    } catch (err) {
      console.error('[useWearableSync] sync error:', err);
      setError('Sync failed');
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [fetchLatestFromDB]);

  // Initial load — fetch DB state only, don't assume connection from local cache
  useEffect(() => {
    if (!user?.id || initRef.current) return;
    initRef.current = true;
    fetchLatestFromDB();
  }, [user?.id, fetchLatestFromDB]);

  // Auto-sync if stale and native — but only if we have evidence of prior connection
  useEffect(() => {
    if (connectionState === 'not_connected' || !isNativeApp()) return;
    if (!lastSync || Date.now() - lastSync.getTime() > STALE_THRESHOLD_MS) {
      console.log('[useWearableSync] Data stale, triggering background sync...');
      triggerSync().catch(() => {});
    }
  }, [connectionState, lastSync, triggerSync]);

  return { connectionState, hasWearable, hasData, isSyncing, lastSync, hrv, error, triggerSync };
}
