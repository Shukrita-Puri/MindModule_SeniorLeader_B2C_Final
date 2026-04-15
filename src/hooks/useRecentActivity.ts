import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';

interface Activity {
  id: string;
  type: 'assessment' | 'recalibrate' | 'brief';
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

const capitalize = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';

const clarityLabel = (level: number | null | undefined): string | null => {
  if (level == null) return null;
  if (level >= 4) return 'High Clarity';
  if (level <= 2) return 'Low Clarity';
  return 'Moderate Clarity';
};

const confidenceLabel = (level: number | null | undefined): string | null => {
  if (level == null) return null;
  if (level >= 4) return 'High Confidence';
  if (level <= 2) return 'Low Confidence';
  return 'Moderate Confidence';
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

      // Fetch recent assessments (formerly check-ins)
      try {
        const { data, error } = await supabase.functions.invoke('daily-checkins', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: { action: 'GET_RECENT_CHECKINS', limit: 5 },
        });
        if (!error && data?.data) {
          data.data.forEach((checkin: any) => {
            const parts = [capitalize(checkin.outcome || 'Completed')];
            const cl = clarityLabel(checkin.clarity_level);
            if (cl) parts.push(cl);
            const co = confidenceLabel(checkin.confidence_level);
            if (co) parts.push(co);

            allActivities.push({
              id: checkin.id,
              type: 'assessment',
              title: `Assessment: ${parts.join(', ')}`,
              date: new Date(checkin.checkin_date),
            });
          });
        }
      } catch (err) {
        console.error('[useRecentActivity] Failed to fetch assessments:', err);
      }

      // Fetch recent sanctuary/reset events
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
              title: `Reset: ${event.content_type || event.category}`,
              date: new Date(event.timestamp),
            });
          });
        }
      } catch (err) {
        console.error('[useRecentActivity] Failed to fetch sanctuary events:', err);
      }

      // Fetch recent brief views
      try {
        const { data, error } = await supabase.functions.invoke('user-events', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: { action: 'GET_ENGAGEMENTS', days: 30 },
        });
        if (!error && data?.success && data.data) {
          const briefEvents = data.data.filter((e: any) => e.event_type === 'brief_view');
          briefEvents.slice(0, 5).forEach((event: any) => {
            const phrase = event.metadata?.phrase || 'Viewed';
            allActivities.push({
              id: event.id,
              type: 'brief',
              title: `Brief: ${phrase.length > 40 ? phrase.slice(0, 40) + '…' : phrase}`,
              date: new Date(event.timestamp),
            });
          });
        }
      } catch (err) {
        console.error('[useRecentActivity] Failed to fetch brief views:', err);
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
