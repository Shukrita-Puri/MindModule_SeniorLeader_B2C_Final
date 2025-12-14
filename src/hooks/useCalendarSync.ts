import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { type CalendarEvent } from '@/utils/historicalPatternEngine';

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

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export function useCalendarSync(): UseCalendarSyncResult {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [hasCalendar, setHasCalendar] = useState(false);
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if data is stale (older than 30 minutes)
  const isStale = useCallback(() => {
    if (!lastSync) return true;
    return Date.now() - lastSync.getTime() > STALE_THRESHOLD_MS;
  }, [lastSync]);

  // Fetch calendar connection status
  const fetchConnection = useCallback(async () => {
    if (!user?.id) return null;

    try {
      const { data, error: connError } = await supabase
        .from('calendar_connections')
        .select('id, provider, is_active, last_sync')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (connError && connError.code !== 'PGRST116') {
        console.error('[useCalendarSync] Error fetching connection:', connError);
      }

      if (data) {
        setConnection(data);
        setHasCalendar(true);
        setLastSync(data.last_sync ? new Date(data.last_sync) : null);
        return data;
      } else {
        setHasCalendar(false);
        return null;
      }
    } catch (err) {
      console.error('[useCalendarSync] Error:', err);
      return null;
    }
  }, [user?.id]);

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
        const metadata = event.event_metadata as Record<string, any> || {};
        return {
          id: event.external_id,
          title: event.title || 'Untitled Event',
          startTime: new Date(event.start_time),
          endTime: new Date(event.end_time),
          isHighStakes: metadata.isHighStakes || false,
          eventType: metadata.eventType || 'meeting',
        };
      });

      setEvents(transformedEvents);
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
  }, [user?.id, connection, fetchEvents]);

  // Initial load: check connection and fetch events
  useEffect(() => {
    let cancelled = false;
    
    const init = async () => {
      if (!user?.id) {
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
          .single();
        
        if (cancelled) return;
        
        if (connError && connError.code !== 'PGRST116') {
          console.error('[useCalendarSync] Error fetching connection:', connError);
        }
        
        if (connData) {
          setConnection(connData);
          setHasCalendar(true);
          setLastSync(connData.last_sync ? new Date(connData.last_sync) : null);
          
          // Fetch events
          const { data: eventsData, error: eventsError } = await supabase
            .from('calendar_events')
            .select('*')
            .eq('user_id', user.id)
            .order('start_time', { ascending: true });
          
          if (cancelled) return;
          
          if (!eventsError && eventsData) {
            const transformedEvents: CalendarEvent[] = eventsData.map(event => {
              const metadata = event.event_metadata as Record<string, any> || {};
              return {
                id: event.external_id,
                title: event.title || 'Untitled Event',
                startTime: new Date(event.start_time),
                endTime: new Date(event.end_time),
                isHighStakes: metadata.isHighStakes || false,
                eventType: metadata.eventType || 'meeting',
              };
            });
            setEvents(transformedEvents);
            console.log('[useCalendarSync] Fetched', transformedEvents.length, 'events');
          }
          
          // If data is stale, trigger a background sync
          const syncTime = connData.last_sync ? new Date(connData.last_sync) : null;
          if (!syncTime || Date.now() - syncTime.getTime() > STALE_THRESHOLD_MS) {
            console.log('[useCalendarSync] Data is stale, triggering background sync...');
            // Background sync - don't await
            supabase.functions.invoke('sync-calendar', {
              body: { provider: connData.provider, userId: user.id }
            }).then(() => {
              if (!cancelled) fetchEvents();
            }).catch(err => console.error('[useCalendarSync] Background sync failed:', err));
          }
        } else {
          setHasCalendar(false);
        }
      } catch (err) {
        console.error('[useCalendarSync] Init error:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    init();
    
    return () => { cancelled = true; };
  }, [user?.id]);

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
