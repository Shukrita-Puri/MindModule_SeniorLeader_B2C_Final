/**
 * PerformancePreparation - Context-First Moment Detection
 * Displays max 2 best moments per day with pack recommendations
 * Carousel-style design matching DailyRitual
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useCalendarSync } from '@/hooks/useCalendarSync';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { detectMoments, type MomentCandidate } from '@/utils/momentDetectionEngine';
import { buildPack, type BuiltPack, type PackStep } from '@/utils/packBuilderSystem';
import MomentCarousel from './MomentCarousel';
import type { CalendarEvent } from '@/utils/historicalPatternEngine';

interface MomentWithPack {
  moment: MomentCandidate;
  pack: BuiltPack;
}

const PerformancePreparation = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { events: calendarEvents, isLoading: calendarLoading, hasCalendar } = useCalendarSync();
  
  const [moments, setMoments] = useState<MomentWithPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [snoozedMoments, setSnoozedMoments] = useState<Map<string, number>>(new Map());
  const [dismissedMoments, setDismissedMoments] = useState<Set<string>>(new Set());
  const [ritualCompleted, setRitualCompleted] = useState(false);
  const [completedPracticeIds, setCompletedPracticeIds] = useState<string[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  // Load user preferences and ritual status
  useEffect(() => {
    loadUserContext();
  }, [user?.id]);

  // Detect moments when calendar events or energy state changes
  useEffect(() => {
    if (!calendarLoading) {
      detectAndBuildMoments();
    }
  }, [calendarEvents, calendarLoading, ritualCompleted]);

  const loadUserContext = async () => {
    if (!user?.id) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    try {
      // Check ritual completion status
      const { data: ritualData } = await supabase
        .from('daily_ritual_completions')
        .select('completion_status, completed_practice_ids')
        .eq('user_id', user.id)
        .eq('ritual_date', today)
        .single();
      
      if (ritualData) {
        setRitualCompleted(ritualData.completion_status === 'full');
        setCompletedPracticeIds(ritualData.completed_practice_ids || []);
      }
      
      // Get user favorites
      const { data: favoritesData } = await supabase
        .from('user_favorites')
        .select('content_id')
        .eq('user_id', user.id);
      
      setFavoriteIds(favoritesData?.map(f => f.content_id) || []);
    } catch (error) {
      console.error('Error loading user context:', error);
    }
  };

  const detectAndBuildMoments = async () => {
    setLoading(true);
    
    try {
      // Get current energy state
      const energyState = await computeEnergyState(user?.id);
      
      // Convert calendar events from database format to CalendarEvent format
      const formattedEvents: CalendarEvent[] = calendarEvents.map(event => ({
        id: event.id,
        title: (event as any).title || 'Untitled Event',
        startTime: new Date((event as any).start_time || (event as any).startTime),
        endTime: new Date((event as any).end_time || (event as any).endTime),
        isHighStakes: false, // Will be classified by detectMoments
        eventType: ((event as any).event_metadata as any)?.event_type || 'unknown'
      }));
      
      // Detect moments (max 2)
      const detectedMoments = detectMoments(
        formattedEvents,
        energyState,
        ritualCompleted,
        completedPracticeIds
      );
      
      console.log('[PerformancePreparation] Detected moments:', detectedMoments.length);
      
      // Filter out snoozed and dismissed moments
      const now = Date.now();
      const activeMoments = detectedMoments.filter(moment => {
        if (dismissedMoments.has(moment.id)) return false;
        
        const snoozeUntil = snoozedMoments.get(moment.id);
        if (snoozeUntil && now < snoozeUntil) return false;
        
        return true;
      });
      
      // Build packs for each moment
      const excludeIds = new Set(completedPracticeIds);
      const momentsWithPacks: MomentWithPack[] = [];
      
      for (const moment of activeMoments) {
        const pack = buildPack(moment, excludeIds, favoriteIds);
        if (pack) {
          momentsWithPacks.push({ moment, pack });
          // Add pack content to exclude list to avoid duplicates across moments
          pack.steps.forEach(step => excludeIds.add(step.content.id));
        }
      }
      
      setMoments(momentsWithPacks);
    } catch (error) {
      console.error('Error detecting moments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartPack = (momentWithPack: MomentWithPack) => {
    const { moment, pack } = momentWithPack;
    
    // Track pack started
    trackMomentEvent('pack_started', moment, pack);
    
    // Navigate to first step
    if (pack.steps.length > 0) {
      navigateToStep(pack.steps[0], pack.steps, 0);
    }
  };

  const handleStartStep = (step: PackStep, pack: BuiltPack, moment: MomentCandidate) => {
    // Track step started directly
    trackMomentEvent('step_started', moment, pack, step);
    
    navigateToStep(step, pack.steps);
  };

  const navigateToStep = (step: PackStep, allSteps: PackStep[], currentIndex: number = 0) => {
    const content = step.content;
    let route: string;
    
    if (content.contentType === 'soundbath') {
      route = `/soundscapes/${content.id}`;
    } else if (content.contentType === 'guided-practice') {
      route = `/guided-practices/${content.id}`;
    } else {
      // For micro-practices, go directly to cards
      route = `/micro-practice/${content.id}/cards`;
    }
    
    // Store pack queue for sequential navigation
    if (allSteps.length > 1) {
      localStorage.setItem('pack_queue', JSON.stringify(allSteps.map(s => ({
        id: s.content.id,
        type: s.content.contentType,
        category: s.content.category
      }))));
      localStorage.setItem('pack_queue_index', String(currentIndex));
    }
    
    navigate(route, {
      state: {
        category: content.category,
        fromMoment: true
      }
    });
  };

  const handleSnooze = (momentId: string, minutes: number) => {
    const snoozeUntil = Date.now() + minutes * 60 * 1000;
    setSnoozedMoments(prev => new Map(prev).set(momentId, snoozeUntil));
    
    toast({
      title: 'Snoozed',
      description: `We'll remind you in ${minutes} minutes`
    });
    
    // Re-detect moments to update UI
    detectAndBuildMoments();
  };

  const handleDismiss = (momentId: string) => {
    setDismissedMoments(prev => new Set(prev).add(momentId));
    
    toast({
      title: 'Dismissed',
      description: 'You can always start a practice from Recalibrate'
    });
  };

  const trackMomentEvent = (
    eventType: 'moment_detected' | 'pack_shown' | 'pack_started' | 'step_started' | 'pack_dismissed',
    moment: MomentCandidate,
    pack?: BuiltPack,
    step?: PackStep
  ) => {
    if (!user?.id) return;
    
    supabase
      .from('micro_intervention_events')
      .insert({
        user_id: user.id,
        event_type: eventType,
        intervention_id: moment.id,
        intervention_type: moment.moment_type,
        trigger_reason: moment.signals.map(s => s.description).join('; '),
        timing_window: moment.label,
        urgency_level: moment.confidence === 'high' ? 'high' : moment.confidence === 'medium' ? 'medium' : 'low',
        recommended_content_id: step?.content.id || pack?.steps[0]?.content.id,
        recommended_content_type: step?.content.contentType || pack?.steps[0]?.content.contentType,
        context_data: {
          pack_template: pack?.template_id,
          pack_name: pack?.template_name,
          total_duration: pack?.total_duration,
          mastery_focus: pack?.mastery_focus,
          step_type: step?.step_type
        }
      })
      .then(({ error }) => {
        if (error) console.error('Error tracking moment event:', error);
      });
  };

  // Loading state
  if (loading || calendarLoading) {
    return (
      <Card className="p-6 flex items-center justify-center bg-card border-border">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Analyzing your day...</span>
      </Card>
    );
  }

  // No moments detected
  if (moments.length === 0) {
    return (
      <Card className="p-6 bg-card border-border">
        <p className="text-sm text-muted-foreground text-center">
          {ritualCompleted 
            ? "Great job! Your daily ritual is complete. We'll suggest more when the time is right."
            : hasCalendar 
              ? "No priority moments detected right now. We'll alert you when one comes up."
              : "Connect your calendar to get contextual recommendations based on your schedule."
          }
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {moments.map((momentWithPack) => (
        <MomentCarousel
          key={momentWithPack.moment.id}
          moment={momentWithPack.moment}
          pack={momentWithPack.pack}
          onStartPack={() => handleStartPack(momentWithPack)}
          onStartStep={(step) => handleStartStep(step, momentWithPack.pack, momentWithPack.moment)}
          onSnooze={(minutes) => handleSnooze(momentWithPack.moment.id, minutes)}
          onDismiss={() => handleDismiss(momentWithPack.moment.id)}
        />
      ))}
      
      {/* Later Today hint */}
      {moments.length === 1 && (
        <p className="text-xs text-muted-foreground text-center">
          We'll suggest another moment when the time is right
        </p>
      )}
    </div>
  );
};

export default PerformancePreparation;
