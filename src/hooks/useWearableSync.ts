/**
 * Hook for wearable (Apple Watch / HealthKit) data freshness.
 * Mirrors the useCalendarSync pattern: check staleness, trigger sync, refresh UI.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { isNativeApp, requestHealthKitPermissions } from '@/utils/healthKitCapacitor';
import { syncHealthKitToBackend } from '@/services/wearableSyncService';
import { supabase } from '@/integrations/supabase/client';

interface WearableSyncState {
  hasWearable: boolean;
  isSyncing: boolean;
  lastSync: Date | null;
  hrv: number | null;
  error: string | null;
  triggerSync: () => Promise<boolean>;
}

const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours — same as calendar

export function useWearableSync(): WearableSyncState {
  const { user } = useAuth();
  const [hasWearable, setHasWearable] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [hrv, setHrv] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

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
        setHasWearable(true);
        setHrv(data.hrv ? Number(data.hrv) : null);
        setLastSync(data.updated_at ? new Date(data.updated_at) : null);
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
      // Re-check permissions
      const granted = await requestHealthKitPermissions();
      if (!granted) {
        setError('HealthKit permission not granted');
        setIsSyncing(false);
        return false;
      }

      const ok = await syncHealthKitToBackend();
      if (ok) {
        // Refresh from DB to get the persisted values
        await fetchLatestFromDB();
        return true;
      } else {
        setError('No new HealthKit data available');
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

  // Initial load: fetch DB state, auto-sync if stale
  useEffect(() => {
    if (!user?.id || initRef.current) return;
    initRef.current = true;

    const init = async () => {
      await fetchLatestFromDB();
    };
    init();
  }, [user?.id, fetchLatestFromDB]);

  // After initial DB fetch, auto-sync if stale and native
  useEffect(() => {
    if (!hasWearable || !isNativeApp()) return;
    if (!lastSync || Date.now() - lastSync.getTime() > STALE_THRESHOLD_MS) {
      console.log('[useWearableSync] Data stale, triggering background sync...');
      triggerSync().catch(() => {});
    }
  }, [hasWearable, lastSync, triggerSync]);

  return { hasWearable, isSyncing, lastSync, hrv, error, triggerSync };
}
