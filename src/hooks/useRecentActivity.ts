import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// Helper to get access token
async function getAccessToken(): Promise<string | null> {
  try {
    const auth0Client = (window as any).__auth0Client;
    if (auth0Client) {
      return await auth0Client.getAccessTokenSilently();
    }
    return null;
  } catch {
    return null;
  }
}

interface Activity {
  id: string;
  type: 'coach' | 'recalibrate' | 'checkin';
  title: string;
  date: Date;
  sessionId?: string;
}

export const useRecentActivity = () => {
  const { user } = useAuth();

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['recent-activity', user?.id],
    queryFn: async (): Promise<Activity[]> => {
      if (!user?.id) return [];

      const allActivities: Activity[] = [];

      // Fetch coach conversations via edge function (bypasses RLS)
      try {
        const accessToken = await getAccessToken();
        if (accessToken) {
          console.log('[useRecentActivity] Fetching coach sessions via edge function');
          const { data, error } = await supabase.functions.invoke('dialogue-session-manage', {
            headers: { Authorization: `Bearer ${accessToken}` },
            body: { action: 'LIST_COACH_SESSIONS', limit: 5 }
          });

          if (error) {
            console.error('[useRecentActivity] Edge function error:', error);
          } else if (data?.sessions) {
            console.log('[useRecentActivity] Got coach sessions:', data.sessions.length);
            data.sessions.forEach((session: { id: string; started_at: string; title: string }) => {
              allActivities.push({
                id: session.id,
                type: 'coach',
                title: session.title,
                date: new Date(session.started_at || Date.now()),
                sessionId: session.id,
              });
            });
          }
        } else {
          console.warn('[useRecentActivity] No access token available');
        }
      } catch (err) {
        console.error('[useRecentActivity] Failed to fetch coach sessions:', err);
      }

      // Fetch recent check-ins
      const { data: checkins } = await supabase
        .from('daily_checkins')
        .select('id, checkin_date, outcome, energy_balance')
        .eq('user_id', user.id)
        .order('checkin_date', { ascending: false })
        .limit(5);

      if (checkins) {
        checkins.forEach((checkin) => {
          allActivities.push({
            id: checkin.id,
            type: 'checkin',
            title: `Check-in: ${checkin.outcome || 'Completed'}`,
            date: new Date(checkin.checkin_date),
          });
        });
      }

      // Fetch recent recalibrate sessions
      const { data: sanctuaryEvents } = await supabase
        .from('sanctuary_events')
        .select('id, timestamp, category, content_type')
        .eq('user_id', user.id)
        .eq('event_type', 'completed')
        .order('timestamp', { ascending: false })
        .limit(5);

      if (sanctuaryEvents) {
        sanctuaryEvents.forEach((event) => {
          allActivities.push({
            id: event.id,
            type: 'recalibrate',
            title: `${event.category}: ${event.content_type}`,
            date: new Date(event.timestamp),
          });
        });
      }

      // Sort all activities by date and return top 10
      return allActivities
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 10);
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return { activities, isLoading };
};
