import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

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

  // Track engagement event
  const trackEngagement = async (event: EngagementEvent) => {
    if (!user) return;

    try {
      const { error } = await supabase.from('user_engagements').insert({
        user_id: user.id,
        event_type: event.event_type,
        category: event.category,
        content_id: event.content_id,
        content_type: event.content_type,
        timestamp: event.timestamp?.toISOString() || new Date().toISOString(),
        metadata: event.metadata || {}
      });

      if (error) {
        console.error('Failed to track engagement:', error);
      }
    } catch (error) {
      console.error('Error tracking engagement:', error);
    }
  };

  // Update or create daily ritual completion
  const updateRitualCompletion = async (completion: RitualCompletion) => {
    if (!user) return;

    try {
      const ritualDate = completion.ritual_date.toISOString().split('T')[0];

      const { error } = await supabase
        .from('daily_ritual_completions')
        .upsert({
          user_id: user.id,
          ritual_date: ritualDate,
          soundscape_completed: completion.soundscape_completed,
          soundscape_completed_at: completion.soundscape_completed_at?.toISOString(),
          guided_practice_completed: completion.guided_practice_completed,
          guided_practice_completed_at: completion.guided_practice_completed_at?.toISOString(),
          micro_exercise_completed: completion.micro_exercise_completed,
          micro_exercise_completed_at: completion.micro_exercise_completed_at?.toISOString(),
          completion_status: completion.completion_status
        }, {
          onConflict: 'user_id,ritual_date'
        });

      if (error) {
        console.error('Failed to update ritual completion:', error);
      }
    } catch (error) {
      console.error('Error updating ritual completion:', error);
    }
  };

  // Save daily check-in
  const saveCheckIn = async (checkIn: DailyCheckIn) => {
    if (!user) return;

    try {
      const checkinDate = checkIn.checkin_date.toISOString().split('T')[0];

      const { error } = await supabase
        .from('daily_checkins')
        .upsert({
          user_id: user.id,
          checkin_date: checkinDate,
          outcome: checkIn.outcome,
          skipped: checkIn.skipped || false,
          timestamp: checkIn.timestamp.toISOString()
        }, {
          onConflict: 'user_id,checkin_date'
        });

      if (error) {
        console.error('Failed to save check-in:', error);
      }
    } catch (error) {
      console.error('Error saving check-in:', error);
    }
  };

  // Get recent engagements
  const getRecentEngagements = async (days: number = 30) => {
    if (!user) return [];

    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await supabase
        .from('user_engagements')
        .select('*')
        .eq('user_id', user.id)
        .gte('timestamp', since.toISOString())
        .order('timestamp', { ascending: false });

      if (error) {
        console.error('Failed to fetch engagements:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching engagements:', error);
      return [];
    }
  };

  // Get ritual completions for date range
  const getRitualCompletions = async (startDate: Date, endDate: Date) => {
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('daily_ritual_completions')
        .select('*')
        .eq('user_id', user.id)
        .gte('ritual_date', startDate.toISOString().split('T')[0])
        .lte('ritual_date', endDate.toISOString().split('T')[0])
        .order('ritual_date', { ascending: false });

      if (error) {
        console.error('Failed to fetch ritual completions:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching ritual completions:', error);
      return [];
    }
  };

  return {
    trackEngagement,
    updateRitualCompletion,
    saveCheckIn,
    getRecentEngagements,
    getRitualCompletions
  };
};
