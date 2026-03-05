import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';

interface Activity {
  id: string;
  type: 'coach' | 'recalibrate' | 'checkin';
  title: string;
  date: Date;
  sessionId?: string;
}

const getAccessTokenOrAnon = async () => {
  if (DEV_MODE) {
    return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  }
  return await getAuthToken();
};

export const useRecentActivity = () => {
  const { user } = useAuth();

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['recent-activity', user?.id],
    queryFn: async (): Promise<Activity[]> => {
      if (!user?.id) return [];

      const allActivities: Activity[] = [];
      const accessToken = await getAccessTokenOrAnon();
      if (!accessToken) return [];

      // Fetch coach sessions via EF (works for both auth + dev)
      try {
        const { data, error } = await supabase.functions.invoke('dialogue-session-manage', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: { action: 'LIST_COACH_SESSIONS', limit: 5 },
        });
        if (!error && data?.success && data.sessions) {
          data.sessions.forEach((session: any) => {
            allActivities.push({
              id: session.id,
              type: 'coach',
              title: session.title?.length >= 50 ? `${session.title}...` : (session.title || 'Coach Conversation'),
              date: new Date(session.started_at || Date.now()),
              sessionId: session.id,
            });
          });
        }
      } catch (err) {
        console.error('[useRecentActivity] Failed to fetch coach sessions:', err);
      }

      // Fetch recent check-ins via EF (bypasses RLS mismatch)
      try {
        const { data, error } = await supabase.functions.invoke('daily-checkins', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: { action: 'GET_RECENT_CHECKINS', limit: 5 },
        });
        if (!error && data?.data) {
          data.data.forEach((checkin: any) => {
            allActivities.push({
              id: checkin.id,
              type: 'checkin',
              title: `Check-in: ${checkin.outcome || 'Completed'}`,
              date: new Date(checkin.checkin_date),
            });
          });
        }
      } catch (err) {
        console.error('[useRecentActivity] Failed to fetch check-ins:', err);
      }

      // Fetch recent sanctuary events via EF (bypasses RLS mismatch)
      try {
        const { data, error } = await supabase.functions.invoke('user-events', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: { action: 'GET_RECENT_SANCTUARY_EVENTS', limit: 5 },
        });
        if (!error && data?.success && data.data) {
          data.data.forEach((event: any) => {
            allActivities.push({
              id: event.id,
              type: 'recalibrate',
              title: `${event.category}: ${event.content_type}`,
              date: new Date(event.timestamp),
            });
          });
        }
      } catch (err) {
        console.error('[useRecentActivity] Failed to fetch sanctuary events:', err);
      }

      // Sort all activities by date and return top 10
      return allActivities
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 10);
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  return { activities, isLoading };
};
