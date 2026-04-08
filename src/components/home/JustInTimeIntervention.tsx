/**
 * JustInTimeIntervention - Contextual micro-intervention card
 * Shows targeted preparation when:
 * - High-stakes calendar event approaching (15-60 min)
 * - Wearable detects stress spike
 * - 3+ consecutive days of same low-energy state
 * - Evening + depleted for integrate flow
 * 
 * Includes Coach Prepare integration and favorites prioritization
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Clock, X, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useCalendarSync } from '@/hooks/useCalendarSync';
import { useFavorites } from '@/hooks/useFavorites';
import { getTodayRitual } from '@/utils/dailyRituals';
import { supabase } from '@/integrations/supabase/client';
import { generateRecommendations, type Recommendation } from '@/utils/recommendationEngine';
import { computeEnergyState } from '@/utils/energyStateEngine';

interface ModuleStatus {
  regulate: boolean;
  align: boolean;
  prepare: boolean;
  integrate: boolean;
}

interface UpcomingEvent {
  id: string;
  title: string;
  startTime: Date;
  minutesUntil: number;
  isHighStakes: boolean;
}

interface ConsecutiveState {
  days: number;
  state: string;
}

interface InterventionData {
  trigger: 'calendar' | 'wearable' | 'pattern' | 'consecutive-low';
  event?: UpcomingEvent;
  stressLevel?: 'elevated' | 'high';
  consecutiveState?: ConsecutiveState;
  modules: ('regulate' | 'align' | 'prepare' | 'integrate')[];
  practices: Recommendation[];
  coachPrompt?: string;
  showCoachCard?: boolean;
  hasFavorites?: boolean;
}

// High-stakes keywords for executive context
const HIGH_STAKES_KEYWORDS = [
  'board', 'investor', 'presentation', 'interview', 'pitch', 
  'negotiation', 'quarterly', 'review', 'performance', 'keynote',
  'meeting', 'call', 'client', 'stakeholder', 'executive', 'ceo', 'cfo'
];

const LOW_ENERGY_STATES = ['overwhelmed', 'drained', 'scattered'];

const isHighStakesEvent = (title: string): boolean => {
  const lower = title.toLowerCase();
  return HIGH_STAKES_KEYWORDS.some(kw => lower.includes(kw));
};

const getCoachPromptForIntervention = (intervention: InterventionData): string => {
  if (intervention.trigger === 'calendar' && intervention.event) {
    return `You have "${intervention.event.title}" in ${intervention.event.minutesUntil} minutes. Let's take a moment to mentally prepare. What outcome would make this a success for you?`;
  }
  if (intervention.trigger === 'pattern') {
    return `I notice you may be feeling some anticipation about what's ahead. Let's ground into your intention. What's the one thing you want to bring to this moment?`;
  }
  if (intervention.trigger === 'consecutive-low' && intervention.consecutiveState) {
    return `You've been feeling ${intervention.consecutiveState.state} for ${intervention.consecutiveState.days} days now. This pattern often signals something deeper. What's been weighing on you?`;
  }
  return `Let's take a moment to center before what's ahead. What's on your mind?`;
};

const JustInTimeIntervention = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { events: calendarEvents, hasCalendar } = useCalendarSync();
  const { favorites, isFavorite } = useFavorites();
  
  const [intervention, setIntervention] = useState<InterventionData | null>(null);
  const [moduleStatus, setModuleStatus] = useState<ModuleStatus>({
    regulate: false,
    align: false,
    prepare: false,
    integrate: false
  });
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load module completion status
  useEffect(() => {
    loadModuleStatus();
  }, [user?.id]);

  // Detect intervention triggers
  useEffect(() => {
    if (!loading) {
      detectIntervention();
    }
  }, [calendarEvents, moduleStatus, loading, favorites]);

  const loadModuleStatus = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    
    try {
      const ritualData = await getTodayRitual();
      
      if (ritualData) {
        const completedIds = ritualData.completed_practice_ids || [];
        
        // Check completion based on practice types in the completed list
        // Also check the boolean flags
        const status: ModuleStatus = {
          regulate: ritualData.soundscape_completed || ritualData.guided_practice_completed || false,
          align: ritualData.micro_exercise_completed || false,
          prepare: completedIds.includes('coach-prepare'),
          integrate: completedIds.includes('coach-integrate')
        };
        
        setModuleStatus(status);
      }
      
      // Also check wearable for stress
      await checkWearableStress();
    } catch (error) {
      console.error('Error loading module status:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkWearableStress = async (): Promise<'elevated' | 'high' | null> => {
    if (!user?.id) return null;
    
    try {
      const { data } = await supabase
        .from('wearable_data')
        .select('sleep_score, hrv')
        .eq('user_id', user.id)
        .order('summary_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data) {
        // Low sleep score or low HRV indicates stress
        if (data.sleep_score && data.sleep_score < 60) {
          return 'elevated';
        }
        if (data.hrv && data.hrv < 30) {
          return 'high';
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  const checkConsecutiveLowState = async (): Promise<ConsecutiveState | null> => {
    if (!user?.id) return null;

    try {
      const { data } = await supabase
        .from('daily_checkins')
        .select('outcome, checkin_date')
        .eq('user_id', user.id)
        .order('checkin_date', { ascending: false })
        .limit(7);

      if (!data?.length) return null;

      const firstState = data[0].outcome;
      if (!LOW_ENERGY_STATES.includes(firstState)) return null;

      let consecutiveDays = 1;
      for (let i = 1; i < data.length; i++) {
        if (data[i].outcome === firstState) {
          consecutiveDays++;
        } else {
          break;
        }
      }

      return consecutiveDays >= 3
        ? { days: consecutiveDays, state: firstState }
        : null;
    } catch {
      return null;
    }
  };

  const isEvening = (): boolean => {
    const hour = new Date().getHours();
    return hour >= 17; // After 5 PM
  };

  const detectIntervention = async () => {
    const now = new Date();
    
    // 1. Check for upcoming high-stakes calendar events (15-60 min)
    const upcomingHighStakes = calendarEvents
      .map(event => {
        const startTime = new Date((event as any).start_time || event.startTime);
        const minutesUntil = Math.floor((startTime.getTime() - now.getTime()) / (1000 * 60));
        return {
          id: (event as any).id || (event as any).external_id,
          title: (event as any).title || 'Event',
          startTime,
          minutesUntil,
          isHighStakes: isHighStakesEvent((event as any).title || '')
        };
      })
      .filter(e => e.minutesUntil >= 10 && e.minutesUntil <= 60 && e.isHighStakes)
      .sort((a, b) => a.minutesUntil - b.minutesUntil);
    
    if (upcomingHighStakes.length > 0) {
      const event = upcomingHighStakes[0];
      const missingModules = getMissingModules();
      
      if (missingModules.length > 0 || !moduleStatus.prepare) {
        // Get quick practices for missing modules
        const practices = await getQuickPractices(missingModules);
        const hasFavs = practices.some(p => isFavorite(p.id));
        
        // Include prepare (coach) for high-stakes events
        const modules: ('regulate' | 'align' | 'prepare')[] = [
          ...missingModules.slice(0, 2) as ('regulate' | 'align')[],
          'prepare'
        ];
        
        const interventionData: InterventionData = {
          trigger: 'calendar',
          event,
          modules,
          practices,
          showCoachCard: true,
          hasFavorites: hasFavs
        };
        interventionData.coachPrompt = getCoachPromptForIntervention(interventionData);
        
        setIntervention(interventionData);
        return;
      }
    }
    
    // 2. Check wearable stress (no coach - immediate relief needed)
    const stressLevel = await checkWearableStress();
    if (stressLevel && !moduleStatus.regulate) {
      const practices = await getQuickPractices(['regulate']);
      const hasFavs = practices.some(p => isFavorite(p.id));
      
      setIntervention({
        trigger: 'wearable',
        stressLevel,
        modules: ['regulate'],
        practices,
        showCoachCard: false,
        hasFavorites: hasFavs
      });
      return;
    }
    
    // 3. Check for 3+ consecutive days of same low state
    const consecutiveState = await checkConsecutiveLowState();
    if (consecutiveState && !isEvening()) {
      const missingModules = getMissingModules();
      const practices = await getQuickPractices(missingModules);
      const hasFavs = practices.some(p => isFavorite(p.id));
      
      const modules: ('regulate' | 'align' | 'prepare')[] = [
        ...missingModules.slice(0, 2) as ('regulate' | 'align')[],
        'prepare'
      ];
      
      const interventionData: InterventionData = {
        trigger: 'consecutive-low',
        consecutiveState,
        modules,
        practices,
        showCoachCard: true,
        hasFavorites: hasFavs
      };
      interventionData.coachPrompt = getCoachPromptForIntervention(interventionData);
      
      setIntervention(interventionData);
      return;
    }
    
    // Note: Evening Integrate flow is handled by the Performance Plan, not JIT
    // JIT only triggers for urgent scenarios: calendar events, wearable stress, consecutive-low patterns
    
    // No intervention needed
    setIntervention(null);
  };

  const getMissingModules = (): ('regulate' | 'align')[] => {
    const missing: ('regulate' | 'align')[] = [];
    if (!moduleStatus.regulate) missing.push('regulate');
    if (!moduleStatus.align) missing.push('align');
    return missing;
  };

  const getQuickPractices = async (modules: string[]): Promise<Recommendation[]> => {
    try {
      const energyState = await computeEnergyState(user?.id);
      const recs = await generateRecommendations(energyState);
      
      // Filter for quick practices (< 3 min) matching the needed modules
      let filtered = recs.practices
        .filter(p => {
          if (modules.includes('regulate')) {
            if (p.contentType === 'soundbath' || 
                p.tags?.some(t => t.toLowerCase().includes('breathing') || t.toLowerCase().includes('somatic'))) {
              return p.duration <= 3;
            }
          }
          if (modules.includes('align')) {
            if (p.contentType === 'micro-practice' && p.duration <= 3) {
              return true;
            }
          }
          return false;
        });
      
      // Sort favorites first
      filtered.sort((a, b) => {
        const aFav = isFavorite(a.id) ? 1 : 0;
        const bFav = isFavorite(b.id) ? 1 : 0;
        return bFav - aFav;
      });
      
      return filtered.slice(0, 2);
    } catch {
      return [];
    }
  };

  const handleStartReset = () => {
    // If only coach module (evening integrate), go directly to coach
    if (intervention?.modules.length === 1 && intervention.modules[0] === 'integrate') {
      navigate('/coach', {
        state: {
          flowType: 'integrate',
          initialPrompt: intervention.coachPrompt,
          fromIntervention: true
        }
      });
      return;
    }
    
    // If no practices but has coach, go to coach
    if (!intervention?.practices.length && intervention?.showCoachCard) {
      navigate('/coach', {
        state: {
          flowType: 'prepare',
          initialPrompt: intervention.coachPrompt,
          fromIntervention: true,
          eventTitle: intervention.event?.title
        }
      });
      return;
    }
    
    // Start with first practice
    if (!intervention?.practices.length) return;
    
    // Store JIT intervention data for post-practice coach navigation
    if (intervention.showCoachCard && intervention.coachPrompt) {
      localStorage.setItem('jitInterventionData', JSON.stringify({
        coachPrompt: intervention.coachPrompt,
        flowType: intervention.modules.includes('integrate') ? 'integrate' : 'prepare',
        eventTitle: intervention.event?.title,
        hasCoachStep: true
      }));
    }
    
    const practice = intervention.practices[0];
    let route: string;
    
    if (practice.contentType === 'soundbath') {
      route = `/soundscapes/${practice.id}`;
    } else if (practice.contentType === 'guided-practice') {
      route = `/guided-practices/${practice.id}`;
    } else {
      route = `/micro-practice/${practice.id}/cards`;
    }
    
    navigate(route, { 
      state: { 
        category: practice.category,
        fromIntervention: true,
        nextModules: intervention.modules.slice(1),
        coachPrompt: intervention.coachPrompt
      } 
    });
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  // Don't show if dismissed, loading, or no intervention
  if (dismissed || loading || !intervention) {
    // Show placeholder if calendar connected but no intervention
    if (hasCalendar && !loading && !intervention && !dismissed) {
      return (
        <div className="py-3">
          <p className="text-xs text-muted-foreground/60 text-center font-body">
            Just-in-time preparation will appear before high-stakes moments
          </p>
        </div>
      );
    }
    return null;
  }

  const getInterventionMessage = () => {
    if (intervention.trigger === 'calendar' && intervention.event) {
      return `${intervention.event.title} in ${intervention.event.minutesUntil} min`;
    }
    if (intervention.trigger === 'wearable') {
      return intervention.stressLevel === 'high' 
        ? 'Your nervous system is elevated'
        : 'Stress indicators detected';
    }
    if (intervention.trigger === 'consecutive-low' && intervention.consecutiveState) {
      return `Day ${intervention.consecutiveState.days} feeling ${intervention.consecutiveState.state}`;
    }
    return 'Time for a quick reset';
  };

  const getModuleLabel = (module: string): string => {
    switch (module) {
      case 'regulate': return 'Regulate';
      case 'align': return 'Align';
      case 'prepare': return 'Prepare';
      case 'integrate': return 'Integrate';
      default: return module;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium tracking-widest uppercase text-saffron font-body">
          Prepare Now
        </span>
      </div>
      
      {/* Intervention Card */}
      <div className="relative rounded-xl overflow-hidden bg-white/65 backdrop-blur-[20px] border border-black/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.04)] p-4">
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
        
        {/* Context */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {intervention.trigger === 'calendar' && (
              <Clock size={14} className="text-saffron" />
            )}
            <span className="text-sm font-medium text-foreground">
              {getInterventionMessage()}
            </span>
          </div>
          
          {intervention.trigger === 'wearable' && (
            <p className="text-xs text-muted-foreground">
              Your body is signaling it needs support
            </p>
          )}
          
          {intervention.trigger === 'consecutive-low' && (
            <p className="text-xs text-muted-foreground">
              This pattern often signals something deeper. Let's address it together.
            </p>
          )}
          
          
          {/* Personalization note */}
          {intervention.hasFavorites && (
            <p className="text-xs text-primary/80 flex items-center gap-1">
              <Heart size={10} className="fill-primary text-primary" />
              Based on what works for you
            </p>
          )}
          
          {/* Recommended modules */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Let's do:</p>
            <div className="flex flex-col gap-2">
              {/* Practice modules */}
              {intervention.practices.map((practice, i) => (
                <div 
                  key={practice.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-saffron/10 border border-saffron/20"
                >
                  <span className="text-xs font-medium uppercase text-saffron">
                    {getModuleLabel(intervention.modules[i])}
                  </span>
                  <span className="text-xs text-muted-foreground">–</span>
                  <span className="text-xs text-foreground truncate flex-1">
                    {practice.title}
                  </span>
                  {isFavorite(practice.id) && (
                    <Heart size={12} className="fill-primary text-primary flex-shrink-0" />
                  )}
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    ({practice.duration}m)
                  </span>
                </div>
              ))}
              
              {/* Coach card for prepare/integrate */}
              {intervention.showCoachCard && (
                <div 
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-saffron/15 to-taupe/15 border border-saffron/30"
                >
                  <span className="text-xs font-medium uppercase text-saffron">
                    {intervention.modules.includes('integrate') ? 'Integrate' : 'Prepare'}
                  </span>
                  <span className="text-xs text-muted-foreground">–</span>
                  <span className="text-xs text-foreground">
                    {intervention.modules.includes('integrate') ? 'Evening Closure' : 'Mental Rehearsal'}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    (Coach)
                  </span>
                </div>
              )}
            </div>
          </div>
          
          {/* Action */}
          <Button 
            onClick={handleStartReset}
            className="w-full h-11 text-sm font-semibold bg-saffron text-charcoal hover:bg-saffron/90 rounded-xl shadow-[0_4px_16px_rgba(242,106,80,0.25)]"
          >
            Start Reset
          </Button>
        </div>
      </div>
    </div>
  );
};

export default JustInTimeIntervention;
