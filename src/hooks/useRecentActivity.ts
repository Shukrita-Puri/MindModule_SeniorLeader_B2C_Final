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

export const useRecentActivity = () => {
  const { user } = useAuth();

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['recent-activity', user?.id],
    queryFn: async (): Promise<Activity[]> => {
      if (!user?.id) return [];

      const allActivities: Activity[] = [];

      // DEV_MODE: Fetch coach sessions directly from database
      if (DEV_MODE) {
        console.log('[useRecentActivity] DEV_MODE: Direct database queries');
        
        // Fetch coach sessions directly
        const { data: sessions, error: sessionsError } = await supabase
          .from('dialogue_sessions')
          .select('id, started_at, context_type, meta_data')
          .eq('user_id', DEV_USER.id)
          .eq('context_type', 'coach')
          .order('started_at', { ascending: false })
          .limit(5);

        if (sessionsError) {
          console.error('[useRecentActivity] DEV_MODE sessions error:', sessionsError);
        } else if (sessions) {
          console.log('[useRecentActivity] DEV_MODE got coach sessions:', sessions.length);
          
          // Get first message for each session to use as title
          for (const session of sessions) {
            const { data: firstMessage } = await supabase
              .from('dialogue_messages')
              .select('content')
              .eq('session_id', session.id)
              .eq('sender_type', 'user')
              .order('message_index', { ascending: true })
              .limit(1)
              .single();
            
            const title = firstMessage?.content?.slice(0, 50) || 'Coach Conversation';
            
            allActivities.push({
              id: session.id,
              type: 'coach',
              title: title.length >= 50 ? `${title}...` : title,
              date: new Date(session.started_at || Date.now()),
              sessionId: session.id,
            });
          }
        }
      }

      // Production: fetch coach sessions via edge function
      if (!DEV_MODE) {
        try {
          const accessToken = await getAuthToken();
          if (accessToken) {
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
          }
        } catch (err) {
          console.error('[useRecentActivity] Failed to fetch coach sessions:', err);
        }
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
