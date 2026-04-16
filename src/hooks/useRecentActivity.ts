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

const levelIcon = (level: number | null | undefined): string => {
  if (level == null) return '';
  if (level >= 4) return '▲';
  if (level <= 2) return '▼';
  return '●';
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
            const outcome = capitalize(checkin.outcome || 'Completed');
            const cl = levelIcon(checkin.clarity_level);
            const co = levelIcon(checkin.confidence_level);
            const ms = levelIcon(checkin.mental_sharpness_level);
            // e.g. "Focused, ● Clarity, ▲ Confidence, ● Sharpness"
            const parts: string[] = [];
            if (cl) parts.push(`${cl} Clarity`);
            if (co) parts.push(`${co} Confidence`);
            if (ms) parts.push(`${ms} Sharpness`);
            const suffix = parts.join(', ');

            allActivities.push({
              id: checkin.id,
              type: 'assessment',
              title: suffix ? `${outcome}, ${suffix}` : outcome,
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
              title: capitalize(event.content_type || event.category || 'Reset'),
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
              title: phrase.length > 30 ? phrase.slice(0, 30) + '…' : phrase,
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
