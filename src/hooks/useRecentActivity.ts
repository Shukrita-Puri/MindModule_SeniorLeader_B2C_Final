import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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

      // Fetch coach conversations (from dialogue_sessions with context_type = 'coach')
      const { data: coachSessions } = await supabase
        .from('dialogue_sessions')
        .select('id, started_at')
        .eq('user_id', user.id)
        .eq('context_type', 'coach')
        .order('started_at', { ascending: false })
        .limit(5);

      if (coachSessions) {
        // Get first message for each session to use as title
        for (const session of coachSessions) {
          const { data: firstMessage } = await supabase
            .from('dialogue_messages')
            .select('content')
            .eq('session_id', session.id)
            .eq('sender_type', 'user')
            .order('message_index', { ascending: true })
            .limit(1)
            .single();

          allActivities.push({
            id: session.id,
            type: 'coach',
            title: firstMessage?.content?.slice(0, 50) || 'Coach conversation',
            date: new Date(session.started_at || Date.now()),
            sessionId: session.id,
          });
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
