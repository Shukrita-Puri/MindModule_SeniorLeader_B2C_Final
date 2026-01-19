/**
 * JustInTimeIntervention - Contextual micro-intervention card
 * Shows targeted preparation when:
 * - High-stakes calendar event approaching (15-60 min)
 * - Wearable detects stress spike
 * - Known user patterns indicate need
 * 
 * Only suggests MISSING modules based on completion tracking
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useCalendarSync } from '@/hooks/useCalendarSync';
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

interface InterventionData {
  trigger: 'calendar' | 'wearable' | 'pattern';
  event?: UpcomingEvent;
  stressLevel?: 'elevated' | 'high';
  modules: ('regulate' | 'align')[];
  practices: Recommendation[];
}

// High-stakes keywords for executive context
const HIGH_STAKES_KEYWORDS = [
  'board', 'investor', 'presentation', 'interview', 'pitch', 
  'negotiation', 'quarterly', 'review', 'performance', 'keynote',
  'meeting', 'call', 'client', 'stakeholder', 'executive', 'ceo', 'cfo'
];

const isHighStakesEvent = (title: string): boolean => {
  const lower = title.toLowerCase();
  return HIGH_STAKES_KEYWORDS.some(kw => lower.includes(kw));
};

const JustInTimeIntervention = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { events: calendarEvents, hasCalendar } = useCalendarSync();
  
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
  }, [calendarEvents, moduleStatus, loading]);

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

  const checkWearableStress = async () => {
    if (!user?.id) return null;
    
    try {
      const { data } = await supabase
        .from('oura_daily_data')
        .select('readiness_score, hrv')
        .eq('user_id', user.id)
        .order('summary_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data) {
        // Low readiness or low HRV indicates stress
        if (data.readiness_score && data.readiness_score < 60) {
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
      
      if (missingModules.length > 0) {
        // Get quick practices for missing modules
        const practices = await getQuickPractices(missingModules);
        
        setIntervention({
          trigger: 'calendar',
          event,
          modules: missingModules.slice(0, 2) as ('regulate' | 'align')[],
          practices
        });
        return;
      }
    }
    
    // 2. Check wearable stress
    const stressLevel = await checkWearableStress();
    if (stressLevel && !moduleStatus.regulate) {
      const practices = await getQuickPractices(['regulate']);
      
      setIntervention({
        trigger: 'wearable',
        stressLevel: stressLevel as 'elevated' | 'high',
        modules: ['regulate'],
        practices
      });
      return;
    }
    
    // No intervention needed
    setIntervention(null);
  };

  const getMissingModules = (): string[] => {
    const missing: string[] = [];
    if (!moduleStatus.regulate) missing.push('regulate');
    if (!moduleStatus.align) missing.push('align');
    return missing;
  };

  const getQuickPractices = async (modules: string[]): Promise<Recommendation[]> => {
    try {
      const energyState = await computeEnergyState(user?.id);
      const recs = await generateRecommendations(energyState);
      
      // Filter for quick practices (< 3 min) matching the needed modules
      return recs.practices
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
        })
        .slice(0, 2);
    } catch {
      return [];
    }
  };

  const handleStartReset = () => {
    if (!intervention?.practices.length) return;
    
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
        fromIntervention: true 
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
    return 'Time for a quick reset';
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
          
          {/* Recommended modules */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Let's do:</p>
            <div className="flex flex-wrap gap-2">
              {intervention.practices.map((practice, i) => (
                <div 
                  key={practice.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-saffron/10 border border-saffron/20"
                >
                  <span className="text-xs font-medium uppercase text-saffron">
                    {intervention.modules[i] === 'regulate' ? 'Regulate' : 'Align'}
                  </span>
                  <span className="text-xs text-muted-foreground">—</span>
                  <span className="text-xs text-foreground truncate max-w-[120px]">
                    {practice.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({practice.duration} min)
                  </span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Action */}
          <Button 
            onClick={handleStartReset}
            className="w-full h-11 text-sm font-semibold bg-saffron text-charcoal hover:bg-saffron/90 rounded-xl shadow-[0_4px_16px_rgba(255,140,66,0.25)]"
          >
            Start Reset
          </Button>
        </div>
      </div>
    </div>
  );
};

export default JustInTimeIntervention;
