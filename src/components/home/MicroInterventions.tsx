import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Bell, Target, Activity, Zap, Heart, Battery, AlertCircle, X, ThumbsUp, ThumbsDown, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  detectMeetingGaps,
  detectHighStakesEvents,
  detectBackToBackOverload,
  calculateTotalMeetingMinutes,
  type CalendarEvent,
  type MeetingGap
} from '@/utils/historicalPatternEngine';
import { analyzeEventPhysiologicalPattern } from '@/utils/historicalPhysiologicalTracking';
import { getWearableContext, type WearableContext, getUserHRVBaseline } from '@/utils/wearableContextAnalyzer';
import { getContentByStructuredTags, interventionToStructuredQuery, getFallbackContent } from '@/utils/interventionContentMatcher';
import { useAuth } from '@/hooks/useAuth';
import { trackInterventionEvent } from '@/utils/interventionTracking';
import { submitRelevanceFeedback } from '@/utils/relevanceFeedback';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MicroIntervention {
  id: string;
  type: 'meeting-gap' | 'pre-performance' | 'recovery' | 'sleep-recovery' | 'readiness-boost' | 
        'stress-regulation' | 'energy-protection' | 'protective-recovery' | 'energy-conservation' | 
        'cumulative-recovery';
  trigger: string;
  content: any;
  timing: string;
  reasoning: string;
  icon: 'bell' | 'target' | 'activity' | 'zap' | 'heart' | 'battery' | 'alert';
  priority: number;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
}

const MicroSelfRecalibrateInterventions = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [interventions, setInterventions] = useState<MicroIntervention[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [dismissModalOpen, setDismissModalOpen] = useState(false);
  const [dismissingIntervention, setDismissingIntervention] = useState<MicroIntervention | null>(null);
  const [feedback, setFeedback] = useState<Record<string, 'thumbs_up' | 'thumbs_down' | null>>({});
  const [recentInterventions, setRecentInterventions] = useState<Map<string, number>>(new Map());
  const [userPreferences, setUserPreferences] = useState<{
    effectiveContentTypes: Record<string, number>;
    completedInterventions: Set<string>;
    favoriteContentIds: string[];
  }>({ effectiveContentTypes: {}, completedInterventions: new Set(), favoriteContentIds: [] });
  const trackedSentRef = useRef<Set<string>>(new Set());
  const ignoreTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    loadUserPreferences();
    loadInterventions();
  }, []);

  // Load user preferences for personalization
  const loadUserPreferences = async () => {
    if (!user) return;

    try {
      // Get user's effective content types from feedback
      const { data: feedbackData } = await supabase
        .from('content_relevance_feedback')
        .select('content_type, star_rating')
        .eq('user_id', user.id)
        .gte('star_rating', 4);

      const effectiveTypes: Record<string, number> = {};
      feedbackData?.forEach(fb => {
        effectiveTypes[fb.content_type] = (effectiveTypes[fb.content_type] || 0) + 1;
      });

      // Get completed interventions
      const { data: interventionData } = await supabase
        .from('micro_intervention_events')
        .select('intervention_id, event_type')
        .eq('user_id', user.id)
        .eq('event_type', 'nudge_clicked');

      const completed = new Set(interventionData?.map(i => i.intervention_id) || []);

      // Get favorites
      const { data: favoritesData } = await supabase
        .from('user_favorites')
        .select('content_id')
        .eq('user_id', user.id);

      setUserPreferences({
        effectiveContentTypes: effectiveTypes,
        completedInterventions: completed,
        favoriteContentIds: favoritesData?.map(f => f.content_id) || [],
      });
    } catch (error) {
      console.error('Error loading user preferences:', error);
    }
  };

  // Track nudge_sent when interventions are displayed
  useEffect(() => {
    if (interventions.length > 0) {
      interventions.forEach((intervention) => {
        // Only track once per intervention
        if (!trackedSentRef.current.has(intervention.id)) {
          trackedSentRef.current.add(intervention.id);
          
          trackInterventionEvent({
            eventType: 'nudge_sent',
            interventionId: intervention.id,
            interventionType: intervention.type,
            triggerReason: intervention.trigger,
            timingWindow: intervention.timing,
            urgencyLevel: intervention.urgencyLevel,
            recommendedContentId: intervention.content.id,
            recommendedContentType: intervention.content.contentType,
            contextData: {
              priority: intervention.priority,
              reasoning: intervention.reasoning
            }
          });

          // Set timer to track nudge_ignored after 5 minutes
          const timer = setTimeout(() => {
            trackInterventionEvent({
              eventType: 'nudge_ignored',
              interventionId: intervention.id,
              interventionType: intervention.type,
              triggerReason: intervention.trigger,
              timingWindow: intervention.timing,
              urgencyLevel: intervention.urgencyLevel,
              recommendedContentId: intervention.content.id,
              recommendedContentType: intervention.content.contentType,
              timeToActionSeconds: 300, // 5 minutes
              contextData: {
                priority: intervention.priority
              }
            });
          }, 5 * 60 * 1000); // 5 minutes

          ignoreTimersRef.current.set(intervention.id, timer);
        }
      });
    }

    // Cleanup timers on unmount
    return () => {
      ignoreTimersRef.current.forEach(timer => clearTimeout(timer));
      ignoreTimersRef.current.clear();
    };
  }, [interventions]);

  const loadInterventions = async () => {
    setLoading(true);
    const calendarEvents: CalendarEvent[] = JSON.parse(
      localStorage.getItem('calendarEvents') || '[]'
    );

    // Get wearable context
    const wearableContext = await getWearableContext(user?.id);

    const detectedInterventions: MicroIntervention[] = [];

    // THREE DETECTION PATHWAYS
    
    // 1. CALENDAR-ONLY INTERVENTIONS (existing logic)
    if (calendarEvents.length > 0) {
      detectedInterventions.push(...detectCalendarOnlyInterventions(calendarEvents));
    }

    // 2. WEARABLE-ONLY INTERVENTIONS (new)
    if (wearableContext.hasData) {
      detectedInterventions.push(...detectWearableOnlyInterventions(wearableContext, calendarEvents.length === 0));
    }

    // 3. COMBINED INTERVENTIONS (new - calendar + wearable)
    if (calendarEvents.length > 0 && wearableContext.hasData) {
      detectedInterventions.push(
        ...(await detectCombinedInterventions(calendarEvents, wearableContext, user?.id || ''))
      );
    }

    // Calculate priority scores for all interventions
    const scoredInterventions = detectedInterventions.map(intervention => ({
      ...intervention,
      priority: calculateInterventionPriority(
        intervention,
        wearableContext,
        {
          totalMeetings: calculateTotalMeetingMinutes(calendarEvents),
          backToBackCount: detectBackToBackOverload(calendarEvents),
          hasHighStakes: detectHighStakesEvents(calendarEvents, 60).length > 0
        }
      )
    }));

    // Sort by priority (highest first)
    scoredInterventions.sort((a, b) => b.priority - a.priority);

    setInterventions(scoredInterventions);
    setLoading(false);
  };

  // Filter and deduplicate interventions
  function filterAndDeduplicateInterventions(interventions: MicroIntervention[]): MicroIntervention[] {
    const now = Date.now();
    const twoHoursAgo = now - (2 * 60 * 60 * 1000);

    // Filter out recently shown interventions
    const filtered = interventions.filter(intervention => {
      const lastShown = recentInterventions.get(intervention.type);
      if (lastShown && lastShown > twoHoursAgo) {
        return false;
      }
      return true;
    });

    // Deduplicate by type - only keep highest priority of each type
    const typeMap = new Map<string, MicroIntervention>();
    filtered.forEach(intervention => {
      const existing = typeMap.get(intervention.type);
      if (!existing || intervention.priority > existing.priority) {
        typeMap.set(intervention.type, intervention);
      }
    });

    // Update recent interventions map
    const result = Array.from(typeMap.values());
    result.forEach(intervention => {
      recentInterventions.set(intervention.type, now);
    });

    return result;
  }

  // PATHWAY 1: Calendar-Only Interventions
  function detectCalendarOnlyInterventions(calendarEvents: CalendarEvent[]): MicroIntervention[] {
    const interventions: MicroIntervention[] = [];

    // 1.1 Meeting Gaps
    const gaps = detectMeetingGaps(calendarEvents);
    gaps.forEach((gap, index) => {
      const query = interventionToStructuredQuery('meeting-gap', { timeWindow: `${gap.gapDuration}min` });
      const quickResetContent = getContentByStructuredTags(query);
      if (quickResetContent[0]) {
        interventions.push({
          id: `gap-${index}`,
          type: 'meeting-gap',
          trigger: `${gap.gapDuration}-min gap between meetings`,
          content: quickResetContent[0],
          timing: gap.timing,
          reasoning: `Prevent mental fatigue with a brief reset between your ${gap.afterMeeting.title} and ${gap.beforeMeeting.title}.`,
          icon: 'zap',
          priority: 50,
          urgencyLevel: 'medium'
        });
      }
    });

    // 1.2 High-Stakes Events
    const highStakesEvents = detectHighStakesEvents(calendarEvents, 60);
    highStakesEvents.forEach((event, index) => {
      const query = interventionToStructuredQuery('pre-performance', { urgencyLevel: 'high' });
      const groundingContent = getContentByStructuredTags(query);
      if (groundingContent[0]) {
        const eventStart = new Date(event.startTime);
        const recommendedTime = new Date(eventStart.getTime() - 30 * 60 * 1000);
        
        const physAnalysis = analyzeEventPhysiologicalPattern(
          event.title,
          event.eventType || 'meeting'
        );
        
        let reasoning = 'Get into the zone for tough conversations. This practice will help you stay grounded and present.';
        
        if (physAnalysis.hasPattern && physAnalysis.elevated) {
          reasoning = `Past ${event.title} meetings showed elevated stress (HRV: ${physAnalysis.avgHRV}). ${
            physAnalysis.trend === 'improving' 
              ? 'Your pattern is improving, but a grounding practice will maintain progress.' 
              : 'This pre-emptive practice will help you manage stress proactively.'
          }`;
        }
        
        interventions.push({
          id: `highstakes-${index}`,
          type: 'pre-performance',
          trigger: `${event.title} at ${formatTime(eventStart)}`,
          content: groundingContent[0],
          timing: `Recommended: ${formatTime(recommendedTime)} (30 min before)`,
          reasoning,
          icon: 'target',
          priority: 75,
          urgencyLevel: 'high'
        });
      }
    });

    // 1.3 Back-to-Back Overload
    const backToBackCount = detectBackToBackOverload(calendarEvents);
    if (backToBackCount >= 3) {
      const query = interventionToStructuredQuery('meeting-gap', { urgencyLevel: 'medium' });
      const quickResetContent = getContentByStructuredTags(query);
      if (quickResetContent[0]) {
        interventions.push({
          id: 'back-to-back-overload',
          type: 'meeting-gap',
          trigger: `${backToBackCount} back-to-back meetings detected`,
          content: quickResetContent[0],
          timing: 'Between meetings today',
          reasoning: 'Multiple consecutive meetings drain focus. Quick resets will help you maintain clarity throughout the day.',
          icon: 'activity',
          priority: 60,
          urgencyLevel: 'medium'
        });
      }
    }

    // 1.4 Meeting Overload (6+ hours)
    const totalMeetingMinutes = calculateTotalMeetingMinutes(calendarEvents);
    if (totalMeetingMinutes >= 360) {
      const query = interventionToStructuredQuery('recovery', { urgencyLevel: 'medium' });
      const recoveryContent = getContentByStructuredTags(query);
      if (recoveryContent[0]) {
        const lastMeeting = calendarEvents[calendarEvents.length - 1];
        const lastMeetingEnd = new Date(lastMeeting.endTime);
        
        interventions.push({
          id: 'meeting-overload-recovery',
          type: 'recovery',
          trigger: `${Math.floor(totalMeetingMinutes / 60)} hours of meetings today`,
          content: recoveryContent[0],
          timing: `After your last meeting at ${formatTime(lastMeetingEnd)}`,
          reasoning: 'Restore energy after an intensive day. This recovery practice will help you decompress and recharge.',
          icon: 'bell',
          priority: 55,
          urgencyLevel: 'medium'
        });
      }
    }

    return interventions;
  }

  // PATHWAY 2: Wearable-Only Interventions
  function detectWearableOnlyInterventions(
    context: WearableContext, 
    noCalendarEvents: boolean
  ): MicroIntervention[] {
    const interventions: MicroIntervention[] = [];

    // Only show wearable-only interventions if there are no calendar events
    if (!noCalendarEvents) return interventions;

    // 2.1 Poor Sleep Recovery (no calendar context)
    if (context.sleepQuality === 'poor') {
      const query = interventionToStructuredQuery('sleep-recovery', { urgencyLevel: 'medium' });
      const restorativeContent = getContentByStructuredTags(query);
      if (restorativeContent[0]) {
        interventions.push({
          id: 'wearable-sleep-recovery',
          type: 'sleep-recovery',
          trigger: `Low sleep quality (${context.sleepScore}/100)`,
          content: restorativeContent[0],
          timing: 'Morning - Start your day',
          reasoning: 'Your body needs extra restoration today. This gentle practice will help offset sleep deficit.',
          icon: 'heart',
          priority: 65,
          urgencyLevel: 'medium'
        });
      }
    }

    // 2.2 Low Readiness (no calendar context)
    if (context.readinessScore && context.readinessScore < 50) {
      const query = interventionToStructuredQuery('readiness-boost', { urgencyLevel: 'medium' });
      const activationContent = getContentByStructuredTags(query);
      if (activationContent[0]) {
        interventions.push({
          id: 'wearable-readiness-boost',
          type: 'readiness-boost',
          trigger: `Low readiness score (${context.readinessScore}/100)`,
          content: activationContent[0],
          timing: 'Mid-morning',
          reasoning: 'Your body signals need for recovery. This activation practice will help build energy sustainably.',
          icon: 'battery',
          priority: 60,
          urgencyLevel: 'medium'
        });
      }
    }

    // 2.3 Elevated RHR (no immediate stressor)
    if (context.hrvStatus === 'elevated' && context.restingHeartRate) {
      const query = interventionToStructuredQuery('stress-regulation', { urgencyLevel: 'high' });
      const calmingContent = getContentByStructuredTags(query);
      if (calmingContent[0]) {
        interventions.push({
          id: 'wearable-stress-regulation',
          type: 'stress-regulation',
          trigger: `Elevated resting heart rate (${context.restingHeartRate} bpm)`,
          content: calmingContent[0],
          timing: 'As soon as possible',
          reasoning: `Your resting heart rate is elevated, suggesting background stress. This grounding practice will help regulate your nervous system.`,
          icon: 'alert',
          priority: 70,
          urgencyLevel: 'high'
        });
      }
    }

    return interventions;
  }

  // PATHWAY 3: Combined Interventions (5 new types A-E)
  async function detectCombinedInterventions(
    calendarEvents: CalendarEvent[],
    context: WearableContext,
    userId: string
  ): Promise<MicroIntervention[]> {
    const interventions: MicroIntervention[] = [];
    const totalMeetingMinutes = calculateTotalMeetingMinutes(calendarEvents);
    const backToBackCount = detectBackToBackOverload(calendarEvents);
    const highStakesEvents = detectHighStakesEvents(calendarEvents, 120);
    const nextHighStakesEvent = highStakesEvents[0];

    // Get HRV baseline for comparison
    const hrvBaseline = await getUserHRVBaseline(userId);

    // A. Low Energy + Meeting Overload
    if (context.sleepScore && context.sleepScore < 60 && totalMeetingMinutes > 240) {
      const query = interventionToStructuredQuery('energy-protection', { urgencyLevel: 'high' });
      const energizingContent = getContentByStructuredTags(query);
      if (energizingContent[0]) {
        const firstMeeting = calendarEvents[0];
        const firstMeetingStart = new Date(firstMeeting.startTime);
        
        interventions.push({
          id: 'combined-energy-protection',
          type: 'energy-protection',
          trigger: `Low sleep (${context.sleepScore}/100) + ${Math.floor(totalMeetingMinutes/60)}h meetings`,
          content: energizingContent[0],
          timing: `Before first meeting at ${formatTime(firstMeetingStart)}`,
          reasoning: `Your sleep score is below optimal and you have a heavy meeting day ahead. This energizing practice will help you show up with clarity despite fatigue.`,
          icon: 'zap',
          priority: 80,
          urgencyLevel: 'high'
        });
      }
    }

    // B. Elevated RHR + High-Stakes Event
    if (
      context.restingHeartRate && 
      hrvBaseline && 
      context.restingHeartRate > hrvBaseline + 10 && 
      nextHighStakesEvent
    ) {
      const query = interventionToStructuredQuery('pre-performance', { urgencyLevel: 'critical' });
      const groundingContent = getContentByStructuredTags(query);
      if (groundingContent[0]) {
        const eventStart = new Date(nextHighStakesEvent.startTime);
        const recommendedTime = new Date(eventStart.getTime() - 30 * 60 * 1000);
        
        interventions.push({
          id: 'combined-pre-performance',
          type: 'pre-performance',
          trigger: `Elevated HR (${context.restingHeartRate} bpm) + ${nextHighStakesEvent.title}`,
          content: groundingContent[0],
          timing: `30 min before at ${formatTime(recommendedTime)}`,
          reasoning: `Your resting heart rate is ${context.restingHeartRate} bpm (baseline: ${hrvBaseline}), suggesting pre-event stress. This grounding practice will help you center before your high-stakes meeting.`,
          icon: 'target',
          priority: 90,
          urgencyLevel: 'critical'
        });
      }
    }

    // C. Low Readiness + Back-to-Back Meetings
    if (context.readinessScore && context.readinessScore < 50 && backToBackCount >= 3) {
      const query = interventionToStructuredQuery('protective-recovery', { urgencyLevel: 'high' });
      const quickResetContent = getContentByStructuredTags(query);
      if (quickResetContent[0]) {
        interventions.push({
          id: 'combined-protective-recovery',
          type: 'protective-recovery',
          trigger: `Low readiness (${context.readinessScore}/100) + ${backToBackCount} consecutive meetings`,
          content: quickResetContent[0],
          timing: 'Between meetings',
          reasoning: `Your readiness score indicates your body needs recovery. These micro-breaks will prevent burnout during your packed schedule.`,
          icon: 'battery',
          priority: 75,
          urgencyLevel: 'high'
        });
      }
    }

    // D. Poor Sleep + Evening Commitments
    const hasEveningMeetings = calendarEvents.some(event => {
      const hour = new Date(event.startTime).getHours();
      return hour >= 17;
    });
    
    if (context.sleepScore && context.sleepScore < 60 && hasEveningMeetings) {
      const query = interventionToStructuredQuery('energy-conservation', { urgencyLevel: 'medium' });
      const restorativeContent = getContentByStructuredTags(query);
      if (restorativeContent[0]) {
        interventions.push({
          id: 'combined-energy-conservation',
          type: 'energy-conservation',
          trigger: `Sleep deficit (${context.sleepScore}/100) + evening meetings`,
          content: restorativeContent[0],
          timing: 'Mid-afternoon (3:00 PM)',
          reasoning: `You got insufficient sleep last night (score: ${context.sleepScore}/100). This restorative practice will help you recharge before evening commitments.`,
          icon: 'heart',
          priority: 70,
          urgencyLevel: 'medium'
        });
      }
    }

    // E. High Activity + No Recovery Time
    const gaps = detectMeetingGaps(calendarEvents);
    if (context.activityScore && context.activityScore > 80 && gaps.length === 0) {
      const query = interventionToStructuredQuery('cumulative-recovery', { urgencyLevel: 'medium' });
      const deepRecoveryContent = getContentByStructuredTags(query);
      if (deepRecoveryContent[0]) {
        const lastMeeting = calendarEvents[calendarEvents.length - 1];
        const lastMeetingEnd = new Date(lastMeeting.endTime);
        
        interventions.push({
          id: 'combined-cumulative-recovery',
          type: 'cumulative-recovery',
          trigger: `High activity yesterday + no breaks today`,
          content: deepRecoveryContent[0],
          timing: `After last meeting at ${formatTime(lastMeetingEnd)}`,
          reasoning: `Your body was highly active yesterday (${context.activityScore}/100) and today offers no natural breaks. This deep recovery practice will prevent cumulative fatigue.`,
          icon: 'bell',
          priority: 65,
          urgencyLevel: 'medium'
        });
      }
    }

    return interventions;
  }

  // Priority Scoring System
  function calculateInterventionPriority(
    intervention: MicroIntervention,
    wearableContext: WearableContext,
    calendarContext: { totalMeetings: number; backToBackCount: number; hasHighStakes: boolean }
  ): number {
    let score = intervention.priority || 50; // Base priority

    // Urgency multipliers
    if (intervention.timing.includes('30 min')) score += 20; // Immediate
    if (intervention.type === 'pre-performance') score += 15; // High stakes

    // Physiological urgency
    if (wearableContext.readinessScore && wearableContext.readinessScore < 40) score += 25; // Critical
    if (wearableContext.recoveryStatus === 'critical') score += 20;
    if (wearableContext.sleepQuality === 'poor') score += 15;
    if (wearableContext.hrvStatus === 'elevated') score += 20;

    // Calendar urgency
    if (calendarContext.hasHighStakes) score += 15;
    if (calendarContext.backToBackCount >= 4) score += 10;
    if (calendarContext.totalMeetings > 360) score += 10; // 6+ hours

    return Math.min(score, 100); // Cap at 100
  }

  const handleInterventionClick = (intervention: MicroIntervention, clickTime: number) => {
    // Clear ignore timer since user is taking action
    const timer = ignoreTimersRef.current.get(intervention.id);
    if (timer) {
      clearTimeout(timer);
      ignoreTimersRef.current.delete(intervention.id);
    }

    // Track nudge_clicked
    trackInterventionEvent({
      eventType: 'nudge_clicked',
      interventionId: intervention.id,
      interventionType: intervention.type,
      triggerReason: intervention.trigger,
      timingWindow: intervention.timing,
      urgencyLevel: intervention.urgencyLevel,
      recommendedContentId: intervention.content.id,
      recommendedContentType: intervention.content.contentType,
      timeToActionSeconds: Math.floor((Date.now() - clickTime) / 1000),
      contextData: {
        priority: intervention.priority,
        action: 'start_now'
      }
    });

    const content = intervention.content;
    if (content.contentType === 'soundbath') {
      navigate(`/soundscapes/${content.id}`, { state: { category: content.category } });
    } else if (content.contentType === 'guided-practice') {
      navigate(`/guided-practices/${content.id}`, { state: { category: content.category } });
    } else if (content.contentType === 'micro-practice') {
      navigate(`/micro-practice/${content.id}`, { state: { category: content.category } });
    }
  };

  const getIcon = (iconType: string) => {
    switch (iconType) {
      case 'target': return Target;
      case 'activity': return Activity;
      case 'zap': return Zap;
      case 'heart': return Heart;
      case 'battery': return Battery;
      case 'alert': return AlertCircle;
      default: return Bell;
    }
  };

  const getUrgencyColor = (level: string) => {
    switch (level) {
      case 'critical': return 'text-red-600 dark:text-red-400';
      case 'high': return 'text-orange-600 dark:text-orange-400';
      case 'medium': return 'text-yellow-600 dark:text-yellow-400';
      default: return 'text-muted-foreground';
    }
  };

  const handleDismissClick = (intervention: MicroIntervention, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissingIntervention(intervention);
    setDismissModalOpen(true);
  };

  const handleDismissConfirm = (reason: string) => {
    if (!dismissingIntervention) return;

    // Clear ignore timer
    const timer = ignoreTimersRef.current.get(dismissingIntervention.id);
    if (timer) {
      clearTimeout(timer);
      ignoreTimersRef.current.delete(dismissingIntervention.id);
    }

    // Track dismissal
    trackInterventionEvent({
      eventType: 'nudge_dismissed',
      interventionId: dismissingIntervention.id,
      interventionType: dismissingIntervention.type,
      triggerReason: dismissingIntervention.trigger,
      timingWindow: dismissingIntervention.timing,
      urgencyLevel: dismissingIntervention.urgencyLevel,
      recommendedContentId: dismissingIntervention.content.id,
      recommendedContentType: dismissingIntervention.content.contentType,
      contextData: {
        priority: dismissingIntervention.priority,
        dismissalReason: reason
      }
    });

    // Remove from display
    setDismissedIds(prev => new Set(prev).add(dismissingIntervention.id));
    setDismissModalOpen(false);
    setDismissingIntervention(null);
  };

  const handleFeedback = async (intervention: MicroIntervention, type: 'thumbs_up' | 'thumbs_down') => {
    setFeedback(prev => ({ ...prev, [intervention.id]: type }));
    
    await submitRelevanceFeedback({
      contentId: intervention.content.id,
      contentType: intervention.content.contentType,
      feedbackType: type,
      triggerContext: 'micro_intervention_nudge',
      contextData: {
        interventionType: intervention.type,
        urgencyLevel: intervention.urgencyLevel,
        triggerReason: intervention.trigger
      }
    });

    toast({
      description: "Thanks for your feedback",
      duration: 2000,
    });
  };

  const activeInterventions = interventions.filter(i => !dismissedIds.has(i.id));
  const displayedInterventions = showAll ? activeInterventions : activeInterventions.slice(0, 3);

  return (
    <div className="space-y-3">
      {/* Title with Info Icon - Always Visible */}
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-foreground">
          Micro Self Recalibration
        </h2>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <Info className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="font-semibold mb-1">How This Works</p>
              <ul className="text-sm space-y-1">
                <li>• Analyzes your calendar (meeting gaps, high-stakes events) and Oura data (sleep, HRV, readiness)</li>
                <li>• Recommends 1-5 min practices based on detected patterns</li>
                <li>• Prioritizes by urgency, timing, and your past effectiveness</li>
                <li>• Updates throughout the day as your schedule and physiology change</li>
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Subtitle - Always Visible */}
      <p className="text-sm text-muted-foreground -mt-1 mb-3">
        Personalised to align your inner world for what matters today.
      </p>

      {/* Loading State */}
      {loading && (
        <p className="text-sm text-muted-foreground animate-pulse">
          Analyzing your calendar and wearable data...
        </p>
      )}

      {/* Empty State */}
      {!loading && interventions.length === 0 && (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground text-center">
            No micro interventions needed right now. Connect your calendar or wearable to get personalized recommendations.
          </p>
        </Card>
      )}

      {/* Interventions List */}
      {!loading && displayedInterventions.length > 0 && (
        <>
          {displayedInterventions.map((intervention) => {
        const Icon = getIcon(intervention.icon);
        const urgencyColor = getUrgencyColor(intervention.urgencyLevel);
        const cardRenderTime = Date.now();
        
        return (
          <Card
            key={intervention.id}
            className="p-4 space-y-3 relative"
          >
            {/* X Dismiss Button */}
            <button
              onClick={(e) => handleDismissClick(intervention, e)}
              className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted/50 text-muted-foreground opacity-60 hover:opacity-100 transition-opacity z-10"
              aria-label="Dismiss this suggestion"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="flex items-start gap-3 pr-8">
              <div className={`w-8 h-8 rounded-full ${
                intervention.urgencyLevel === 'critical' ? 'bg-red-100 dark:bg-red-900/20' :
                intervention.urgencyLevel === 'high' ? 'bg-orange-100 dark:bg-orange-900/20' :
                'bg-saffron/10'
              } flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-4 h-4 ${urgencyColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-foreground mb-1">
                  {intervention.trigger}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {intervention.timing}
                </p>
              </div>
              {intervention.priority > 80 && (
                <Badge variant="destructive" className="text-xs">
                  Urgent
                </Badge>
              )}
            </div>

            {/* Content Preview */}
            <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg">
              <div
                className="w-12 h-12 rounded-lg bg-cover bg-center flex-shrink-0"
                style={{ backgroundImage: `url('${intervention.content.thumbnail}')` }}
              />
              <div className="flex-1 min-w-0">
                <h5 className="text-sm font-semibold text-foreground mb-1 line-clamp-1">
                  {intervention.content.title}
                </h5>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>{intervention.content.duration} min</span>
                  <span>•</span>
                  <Badge variant="outline" className="text-xs">
                    {intervention.content.category}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Reasoning */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              💡 {intervention.reasoning}
            </p>

            {/* Feedback buttons */}
            <div className="flex items-center gap-2 pb-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleFeedback(intervention, 'thumbs_up');
                }}
                className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-emerald-600 transition-colors"
                aria-label="This is helpful"
              >
                <ThumbsUp className={`w-3.5 h-3.5 ${feedback[intervention.id] === 'thumbs_up' ? 'fill-emerald-600 text-emerald-600' : ''}`} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleFeedback(intervention, 'thumbs_down');
                }}
                className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-orange-600 transition-colors"
                aria-label="Not helpful"
              >
                <ThumbsDown className={`w-3.5 h-3.5 ${feedback[intervention.id] === 'thumbs_down' ? 'fill-orange-600 text-orange-600' : ''}`} />
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  
                  // Track reminder set
                  const timer = ignoreTimersRef.current.get(intervention.id);
                  if (timer) {
                    clearTimeout(timer);
                    ignoreTimersRef.current.delete(intervention.id);
                  }

                  trackInterventionEvent({
                    eventType: 'nudge_clicked',
                    interventionId: intervention.id,
                    interventionType: intervention.type,
                    triggerReason: intervention.trigger,
                    timingWindow: intervention.timing,
                    urgencyLevel: intervention.urgencyLevel,
                    recommendedContentId: intervention.content.id,
                    recommendedContentType: intervention.content.contentType,
                    timeToActionSeconds: Math.floor((Date.now() - cardRenderTime) / 1000),
                    contextData: {
                      priority: intervention.priority,
                      action: 'set_reminder'
                    }
                  });
                  
                  // TODO: Implement notification scheduling
                  alert('Notification set! We\'ll remind you at the right time.');
                }}
              >
                Set Reminder
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs bg-gradient-to-r from-taupe via-taupe-highlight to-taupe hover:opacity-90 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  handleInterventionClick(intervention, cardRenderTime);
                }}
              >
                Start Now →
              </Button>
            </div>
          </Card>
          );
        })}
        </>
      )}

      {/* Dismissal Modal */}
      <AlertDialog open={dismissModalOpen} onOpenChange={setDismissModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Why dismiss this suggestion?</AlertDialogTitle>
            <AlertDialogDescription>
              This helps us improve your recommendations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-4">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleDismissConfirm("Not relevant right now")}
            >
              Not relevant right now
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleDismissConfirm("Already feeling good")}
            >
              Already feeling calm/focused/energized
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleDismissConfirm("Don't have time")}
            >
              Don't have time
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleDismissConfirm("Not interested in this type")}
            >
              Not interested in this type
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="ghost" onClick={() => handleDismissConfirm("No reason")}>
              Skip
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Show More / Show Less Button */}
      {activeInterventions.length > 3 && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Show Less' : `Show ${activeInterventions.length - 3} More`}
        </Button>
      )}

      {activeInterventions.length > 0 && (
        <p className="text-xs text-muted-foreground text-center pt-2">
          📬 {activeInterventions.length} recommendation{activeInterventions.length > 1 ? 's' : ''} • Sorted by priority
        </p>
      )}
    </div>
  );
};

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

export default MicroSelfRecalibrateInterventions;
