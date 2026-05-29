import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchTravelState,
  getCachedTravelState,
  startTimezoneWatcher,
  type TravelStateSnapshot,
} from '@/services/travelStateService';

/**
 * Subscribes to the user's travel state. Cache-first for instant paint,
 * refreshes from DB in the background, and starts the JS-side timezone
 * watcher once per mount.
 */
export function useTravelState() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<TravelStateSnapshot | null>(() => getCachedTravelState());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    fetchTravelState(user.id)
      .then((s) => { if (!cancelled) setSnapshot(s); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    const stop = startTimezoneWatcher();
    return stop;
  }, []);

  const refresh = async () => {
    if (!user?.id) return;
    const next = await fetchTravelState(user.id);
    setSnapshot(next);
  };

  return { snapshot, loading, refresh };
}