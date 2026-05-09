import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { type CalendarEvent } from '@/utils/historicalPatternEngine';
import { clearLocalCalendarData, saveCalendarEventsLocally } from '@/services/localDataStore';
import { syncAppleCalendarToBackend } from '@/services/appleCalendarSync';
import { isAppleCalendarSupported, verifyAppleCalendarPermission } from '@/utils/appleCalendar';
import { getAuthToken } from '@/services/authTokenService';

interface CalendarConnection {
  id: string;
  provider: string;
  is_active: boolean;
  last_sync: string | null;
}

interface UseCalendarSyncResult {
  events: CalendarEvent[];
  isLoading: boolean;
  isSyncing: boolean;
  lastSync: Date | null;
  hasCalendar: boolean;
  triggerSync: () => Promise<void>;
  error: string | null;
}

const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

export function useCalendarSync(): UseCalendarSyncResult {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [hasCalendar, setHasCalendar] = useState(false);
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetCalendarState = useCallback(() => {
    setEvents([]);
    setConnection(null);
    setHasCalendar(false);
    setLastSync(null);
    clearLocalCalendarData();
  }, []);

  const markAppleCalendarInactive = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      if (!token || !projectId) return;

      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/calendar-auth`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'disconnect', provider: 'apple' }),
      });

      if (!res.ok) {
        console.warn('[useCalendarSync] Failed to mark Apple Calendar inactive:', res.status);
      }
    } catch (err) {
      console.warn('[useCalendarSync] Apple Calendar inactive cleanup failed:', err);
    }
  }, []);

  const verifyConnectionUsable = useCallback(async (conn: CalendarConnection | null) => {
    if (!conn) return null;
    if (conn.provider !== 'apple') return conn;

    if (!isAppleCalendarSupported()) {
      console.warn('[useCalendarSync] Apple Calendar DB row exists but native calendar is unsupported');
      resetCalendarState();
      return null;
    }

    const permissionGranted = await verifyAppleCalendarPermission();
    console.log('[useCalendarSync] Apple Calendar permission verification:', { permissionGranted });
    if (!permissionGranted) {
      resetCalendarState();
      await markAppleCalendarInactive();
      setError('Apple Calendar permission denied. Reconnect calendar access in iOS Settings.');
      return null;
    }

    return conn;
  }, [markAppleCalendarInactive, resetCalendarState]);

  // Fetch calendar connection status
  const fetchConnection = useCallback(async () => {
    if (!user?.id) return null;

    try {
      const { data, error: connError } = await supabase
        .from('calendar_connections')
        .select('id, provider, is_active, last_sync')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (connError && connError.code !== 'PGRST116') {
        console.error('[useCalendarSync] Error fetching connection:', connError);
      }

      const usableConnection = await verifyConnectionUsable(data);

      if (usableConnection) {
        setConnection(usableConnection);
        setHasCalendar(true);
        setLastSync(usableConnection.last_sync ? new Date(usableConnection.last_sync) : null);
        return usableConnection;
      } else {
        resetCalendarState();
        return null;
      }
    } catch (err) {
      console.error('[useCalendarSync] Error:', err);
      return null;
    }
  }, [user?.id, resetCalendarState, verifyConnectionUsable]);

  // Fetch events from database
  const fetchEvents = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error: eventsError } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', user.id)
        .order('start_time', { ascending: true });

      if (eventsError) {
        console.error('[useCalendarSync] Error fetching events:', eventsError);
        return;
      }

      // Transform database format to CalendarEvent interface
      const transformedEvents: CalendarEvent[] = (data || []).map(event => {
        const metadata = event.event_metadata as Record<string, unknown> || {};
        return {
          id: event.external_id,
          title: event.title || 'Untitled Event',
          startTime: new Date(event.start_time),
          endTime: new Date(event.end_time),
          isHighStakes: metadata.isHighStakes === true,
          eventType: typeof metadata.eventType === 'string' ? metadata.eventType : 'meeting',
        };
      });

      setEvents(transformedEvents);
      // Write-through to local device storage
      saveCalendarEventsLocally(transformedEvents.map(e => ({
        id: e.id,
        title: e.title,
        startTime: e.startTime.toISOString(),
        endTime: e.endTime.toISOString(),
        isHighStakes: e.isHighStakes,
        eventType: e.eventType,
      })));
      console.log('[useCalendarSync] Fetched', transformedEvents.length, 'events from database');
    } catch (err) {
      console.error('[useCalendarSync] Error fetching events:', err);
    }
  }, [user?.id]);

  // Trigger calendar sync
  const triggerSync = useCallback(async () => {
    if (!user?.id || !connection) {
      console.log('[useCalendarSync] Cannot sync: no user or connection');
      return;
    }

    setIsSyncing(true);
    setError(null);

    try {
      console.log('[useCalendarSync] Triggering sync for provider:', connection.provider);

      if (connection.provider === 'apple') {
        if (!isAppleCalendarSupported()) {
          setError('Apple Calendar sync is only available in the iOS app.');
          resetCalendarState();
          return;
        }

        const permissionGranted = await verifyAppleCalendarPermission();
        if (!permissionGranted) {
          setError('Apple Calendar permission denied. Reconnect calendar access in iOS Settings.');
          resetCalendarState();
          await markAppleCalendarInactive();
          return;
        }

        const result = await syncAppleCalendarToBackend();
        if (!result.success) {
          setError(result.error || 'Apple Calendar sync failed');
          return;
        }

        setLastSync(new Date());
        await fetchEvents();
        return;
      }

      const { data, error: syncError } = await supabase.functions.invoke('sync-calendar', {
        body: {
          provider: connection.provider,
          userId: user.id,
        },
      });

      if (syncError) {
        console.error('[useCalendarSync] Sync error:', syncError);
        setError(syncError.message);
        return;
      }

      // Handle reconnect-required or skipped responses
      if (data?.reconnectRequired) {
        console.warn('[useCalendarSync] Calendar reconnect required:', data.reason);
        setError(data.error || 'Calendar session expired. Please reconnect your calendar.');
        return;
      }

      if (data?.skipped) {
        console.warn('[useCalendarSync] Sync skipped:', data.reason);
        setError(data.error || 'Calendar is disconnected.');
        return;
      }

      if (data?.success === false) {
        console.warn('[useCalendarSync] Sync returned failure:', data.error);
        setError(data.error || 'Sync failed');
        return;
      }

      console.log('[useCalendarSync] Sync complete:', data);
      setLastSync(new Date());
      
      // Refresh events from database
      await fetchEvents();
    } catch (err) {
      console.error('[useCalendarSync] Sync failed:', err);
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [user?.id, connection, fetchEvents, markAppleCalendarInactive, resetCalendarState]);

  // Initial load: check connection and fetch events
  useEffect(() => {
    let cancelled = false;
    
    const init = async () => {
      if (!user?.id) {
        resetCalendarState();
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      
      try {
        const { data: connData, error: connError } = await supabase
          .from('calendar_connections')
          .select('id, provider, is_active, last_sync')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        
        if (cancelled) return;
        
        if (connError && connError.code !== 'PGRST116') {
          console.error('[useCalendarSync] Error fetching connection:', connError);
        }
        
        const usableConnection = await verifyConnectionUsable(connData);
        if (cancelled) return;

        if (usableConnection) {
          setConnection(usableConnection);
          setHasCalendar(true);
          setLastSync(usableConnection.last_sync ? new Date(usableConnection.last_sync) : null);
          
          // Fetch events
          const { data: eventsData, error: eventsError } = await supabase
            .from('calendar_events')
            .select('*')
            .eq('user_id', user.id)
            .order('start_time', { ascending: true });
          
          if (cancelled) return;
          
          if (!eventsError && eventsData) {
            const transformedEvents: CalendarEvent[] = eventsData.map(event => {
              const metadata = event.event_metadata as Record<string, unknown> || {};
              return {
                id: event.external_id,
                title: event.title || 'Untitled Event',
                startTime: new Date(event.start_time),
                endTime: new Date(event.end_time),
                isHighStakes: metadata.isHighStakes === true,
                eventType: typeof metadata.eventType === 'string' ? metadata.eventType : 'meeting',
              };
            });
            setEvents(transformedEvents);
            // Write-through to local device storage
            saveCalendarEventsLocally(transformedEvents.map(e => ({
              id: e.id,
              title: e.title,
              startTime: e.startTime.toISOString(),
              endTime: e.endTime.toISOString(),
              isHighStakes: e.isHighStakes,
              eventType: e.eventType,
            })));
            console.log('[useCalendarSync] Fetched', transformedEvents.length, 'events');
          }
          
          // If data is stale, trigger a background sync
          const syncTime = usableConnection.last_sync ? new Date(usableConnection.last_sync) : null;
          if (!syncTime || Date.now() - syncTime.getTime() > STALE_THRESHOLD_MS) {
            console.log('[useCalendarSync] Data is stale, triggering background sync...');
            // Background sync - don't await
            if (usableConnection.provider === 'apple') {
              if (isAppleCalendarSupported()) {
                syncAppleCalendarToBackend()
                  .then((res) => {
                    if (!cancelled && res.success === true) fetchEvents();
                    if (!cancelled && res.success === false) resetCalendarState();
                  })
                  .catch(err => console.error('[useCalendarSync] Apple background sync failed:', err));
              }
            } else {
              supabase.functions.invoke('sync-calendar', {
                body: { provider: usableConnection.provider, userId: user.id }
              }).then((res) => {
                if (!cancelled && res.data?.success === true) fetchEvents();
                if (res.data?.reconnectRequired) console.warn('[useCalendarSync] Background sync: reconnect required');
              }).catch(err => console.error('[useCalendarSync] Background sync failed:', err));
            }
          }
        } else {
          resetCalendarState();
        }
      } catch (err) {
        console.error('[useCalendarSync] Init error:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    init();
    
    return () => { cancelled = true; };
  }, [user?.id, fetchEvents, resetCalendarState, verifyConnectionUsable]);

  return {
    events,
    isLoading,
    isSyncing,
    lastSync,
    hasCalendar,
    triggerSync,
    error,
  };
}
