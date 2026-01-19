/**
 * StrategicIntentionCard - "What matters today?"
 * Displays ONE psychological frame for the entire day
 * Not interactive - pure framing instruction
 */

import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { computeEnergyState, CurrentEnergyState } from '@/utils/energyStateEngine';
import { getStrategicTheme } from '@/utils/energyStateScoring';
import MetricInfoModal from './MetricInfoModal';
import { cn } from '@/lib/utils';

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
    energyState.checkInOutcome
  );

  return (
    <div className={cn(
      "py-4 px-4 -mx-4 space-y-3 rounded-lg border-l-2 transition-colors duration-500",
      "bg-taupe/[0.06] border-l-taupe/30"
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
        {/* Theme phrase - serif, italic for elegance */}
        <p className="text-xl md:text-2xl font-headline italic text-foreground leading-snug">
          "{theme.phrase}"
        </p>

        {/* Supporting context */}
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
