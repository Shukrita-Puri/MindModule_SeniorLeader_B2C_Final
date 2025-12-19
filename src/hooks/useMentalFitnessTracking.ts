import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useAuth0 } from '@auth0/auth0-react';

interface EngagementEvent {
  event_type: 'ritual_start' | 'session_start' | 'checkin' | 'micro_response';
  category?: 'pause' | 'flow' | 'renewal' | 'general';
  content_id?: string;
  content_type?: 'soundscape' | 'guided' | 'micro' | 'checkin';
  timestamp?: Date;
  metadata?: Record<string, any>;
}

interface RitualCompletion {
  ritual_date: Date;
  soundscape_completed?: boolean;
  soundscape_completed_at?: Date;
  guided_practice_completed?: boolean;
  guided_practice_completed_at?: Date;
  micro_exercise_completed?: boolean;
  micro_exercise_completed_at?: Date;
  completion_status: 'full' | 'partial' | 'skipped';
}

interface DailyCheckIn {
  checkin_date: Date;
  outcome: 'pause' | 'power-up' | 'presence' | 'calm' | 'ready';
  skipped?: boolean;
  timestamp: Date;
}

export const useMentalFitnessTracking = () => {
  const { user } = useAuth();
  const { getAccessTokenSilently } = useAuth0();

  // Track engagement event via edge function
  const trackEngagement = useCallback(async (event: EngagementEvent) => {
    if (!user) return;

    try {
      const accessToken = await getAccessTokenSilently();
      const { error } = await supabase.functions.invoke('user-events', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          action: 'TRACK_ENGAGEMENT',
          eventType: event.event_type,
          category: event.category,
          contentId: event.content_id,
          contentType: event.content_type,
          timestamp: event.timestamp?.toISOString() || new Date().toISOString(),
          metadata: event.metadata || {}
        }
      });

      if (error) {
        console.error('Failed to track engagement:', error);
      }
    } catch (error) {
      console.error('Error tracking engagement:', error);
    }
  }, [user, getAccessTokenSilently]);

  // Update or create daily ritual completion via edge function
  const updateRitualCompletion = useCallback(async (completion: RitualCompletion) => {
    if (!user) return;

    try {
      const accessToken = await getAccessTokenSilently();
      const ritualDate = completion.ritual_date.toISOString().split('T')[0];

      const { error } = await supabase.functions.invoke('practice-data', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          action: 'UPSERT_RITUAL',
          ritualDate,
          soundscapeCompleted: completion.soundscape_completed,
          soundscapeCompletedAt: completion.soundscape_completed_at?.toISOString(),
          guidedPracticeCompleted: completion.guided_practice_completed,
          guidedPracticeCompletedAt: completion.guided_practice_completed_at?.toISOString(),
          microExerciseCompleted: completion.micro_exercise_completed,
          microExerciseCompletedAt: completion.micro_exercise_completed_at?.toISOString(),
          completionStatus: completion.completion_status
        }
      });

      if (error) {
        console.error('Failed to update ritual completion:', error);
      }
    } catch (error) {
      console.error('Error updating ritual completion:', error);
    }
  }, [user, getAccessTokenSilently]);

  // Save daily check-in via edge function
  const saveCheckIn = useCallback(async (checkIn: DailyCheckIn) => {
    if (!user) return;

    try {
      const accessToken = await getAccessTokenSilently();
      const checkinDate = checkIn.checkin_date.toISOString().split('T')[0];

      const { error } = await supabase.functions.invoke('user-events', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          action: 'SAVE_CHECKIN',
          checkinDate,
          outcome: checkIn.outcome,
          skipped: checkIn.skipped || false
        }
      });

      if (error) {
        console.error('Failed to save check-in:', error);
      }
    } catch (error) {
      console.error('Error saving check-in:', error);
    }
  }, [user, getAccessTokenSilently]);

  // Get recent engagements via edge function
  const getRecentEngagements = useCallback(async (days: number = 30) => {
    if (!user) return [];

    try {
      const accessToken = await getAccessTokenSilently();

      const { data: result, error } = await supabase.functions.invoke('user-events', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          action: 'GET_ENGAGEMENTS',
          days
        }
      });

      if (error) {
        console.error('Failed to fetch engagements:', error);
        return [];
      }

      return result?.data || [];
    } catch (error) {
      console.error('Error fetching engagements:', error);
      return [];
    }
  }, [user, getAccessTokenSilently]);

  // Get ritual completions for date range - still uses direct query for now
  // TODO: Add to practice-data edge function if needed
  const getRitualCompletions = useCallback(async (startDate: Date, endDate: Date) => {
    if (!user) return [];

    try {
      const accessToken = await getAccessTokenSilently();
      
      // For now, we'll fetch via the practice-data function in a loop or add a new action
      // This is a placeholder - the edge function could be extended to support date ranges
      console.log('[useMentalFitnessTracking] getRitualCompletions called - needs edge function support');
      return [];
    } catch (error) {
      console.error('Error fetching ritual completions:', error);
      return [];
    }
  }, [user, getAccessTokenSilently]);

  return {
    trackEngagement,
    updateRitualCompletion,
    saveCheckIn,
    getRecentEngagements,
    getRitualCompletions
  };
};
