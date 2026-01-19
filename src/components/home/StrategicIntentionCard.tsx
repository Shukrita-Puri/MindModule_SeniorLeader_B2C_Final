/**
 * StrategicIntentionCard - "What matters today?"
 * Displays ONE psychological frame for the entire day
 * Enhanced with: Why (mechanism) + Stakes + Unlock (archetype-aware)
 * Not interactive - pure framing instruction
 */

import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { computeEnergyState, CurrentEnergyState } from '@/utils/energyStateEngine';
import { getStrategicTheme } from '@/utils/energyStateScoring';
import MetricInfoModal from './MetricInfoModal';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';

// Build data sources list based on what influenced the theme
const getThemeDataSources = (energyState: CurrentEnergyState): string => {
  const sources: string[] = [];
  
  // Check-in source
  if (energyState.checkInOutcome) sources.push('check-in');
  
  // Wearable source
  if (energyState.dataSources?.includes('wearable')) sources.push('wearable');
  
  // Calendar sources (only if they influenced theme)
  if (energyState.calendarPressure === 'high' || energyState.calendarPressure === 'medium') {
    sources.push('calendar pressure');
  }
  if (energyState.calendarLoad === 'high' || energyState.calendarLoad === 'medium') {
    sources.push('calendar load');
  }
  
  // Time of day always contributes
  sources.push('time of day');
  
  return sources.join(', ');
};

const StrategicIntentionCard = () => {
  const { user } = useAuth();

  const { data: energyState, isLoading } = useQuery({
    queryKey: ['energy-state', user?.id],
    queryFn: async () => {
      return await computeEnergyState(user?.id);
    },
    enabled: !!user?.id,
    refetchInterval: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Fetch user's archetype for personalized unlock statements
  const { data: userProfile } = useQuery({
    queryKey: ['user-profile-archetype', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_archetype')
        .eq('id', user?.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
    staleTime: 30 * 60 * 1000, // 30 min cache
  });

  // Fetch recent check-ins for pattern recognition
  const { data: recentCheckIns } = useQuery({
    queryKey: ['recent-checkins-pattern', user?.id],
    queryFn: async () => {
      const today = new Date();
      const sevenDaysAgo = subDays(today, 6);
      
      const { data } = await supabase
        .from('daily_checkins')
        .select('checkin_date, outcome')
        .eq('user_id', user?.id)
        .gte('checkin_date', format(sevenDaysAgo, 'yyyy-MM-dd'))
        .lte('checkin_date', format(today, 'yyyy-MM-dd'))
        .order('checkin_date', { ascending: false });
      
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Calculate pattern recognition - how many times this state appeared this week
  const getPatternRecognition = (currentOutcome: string | undefined): string | null => {
    if (!currentOutcome || !recentCheckIns || recentCheckIns.length < 2) return null;
    
    const sameStateCount = recentCheckIns.filter(c => c.outcome === currentOutcome).length;
    
    if (sameStateCount >= 3) {
      const stateLabels: Record<string, string> = {
        overwhelmed: 'overwhelmed',
        drained: 'drained',
        scattered: 'scattered',
        steady: 'steady',
        focused: 'focused'
      };
      const label = stateLabels[currentOutcome] || currentOutcome;
      return `This is ${sameStateCount === 3 ? 'the 3rd' : sameStateCount === 4 ? 'the 4th' : `${sameStateCount}`} day this week you've felt ${label}.`;
    }
    return null;
  };

  if (isLoading || !energyState) {
    return (
      <div className="animate-pulse p-5 md:p-6">
        <div className="h-4 bg-muted/50 rounded w-24 mb-3" />
        <div className="h-6 bg-muted/50 rounded w-48 mb-2" />
        <div className="h-4 bg-muted/50 rounded w-full" />
      </div>
    );
  }

  const theme = getStrategicTheme(
    energyState.energyTier,
    energyState.calendarLoad,
    energyState.calendarPressure,
    energyState.timeOfDay,
    energyState.checkInOutcome,
    userProfile?.user_archetype || undefined
  );

  const patternRecognition = getPatternRecognition(energyState.checkInOutcome);

  return (
    <div className={cn(
      "rounded-xl p-5 space-y-3 transition-all duration-300",
      "bg-white/65 backdrop-blur-[20px] border border-black/[0.06]",
      "shadow-[0_4px_16px_rgba(0,0,0,0.04)]",
      "border-l-2 border-l-taupe/40"
    )}>
      {/* Header - just label and info button */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
          Theme for Today
        </span>
        <MetricInfoModal
          title="How Your Daily Theme is Selected"
          description="Your theme combines your current felt state (from check-in and wearable data), calendar pressure (high-stakes events), calendar load (meeting density), and time of day. It provides strategic guidance that acknowledges both how you feel internally and what your day demands externally."
        />
      </div>

      {/* Theme content with fade animation */}
      <div key={theme.phrase} className="animate-fade-in space-y-3">
        {/* Pattern recognition - if applicable */}
        {patternRecognition && (
          <p className="text-xs text-muted-foreground/70 font-body italic">
            {patternRecognition}
          </p>
        )}

        {/* Theme phrase - serif, italic for elegance */}
        <p className="text-xl md:text-2xl font-headline italic text-foreground leading-snug">
          "{theme.phrase}"
        </p>

        {/* Supporting context - now includes Why + Stakes + Unlock */}
        <p className="text-sm text-muted-foreground leading-relaxed font-body">
          {theme.context}
        </p>
      </div>

      {/* Footer - data sources (matching Today's State) */}
      <div className="pt-1">
        <span className="text-xs text-muted-foreground/50 font-body">
          Based on {getThemeDataSources(energyState)}
        </span>
      </div>
    </div>
  );
};

export default StrategicIntentionCard;
