/**
 * StrategicIntentionCard - "What matters today?"
 * Displays ONE psychological frame for the entire day
 * Not interactive - pure framing instruction
 */

import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { getStrategicTheme, ThemeDriver } from '@/utils/energyStateScoring';
import MetricInfoModal from './MetricInfoModal';
import { cn } from '@/lib/utils';

// Get user-friendly label for theme driver
const getDriverLabel = (driver: ThemeDriver): string => {
  switch (driver) {
    case 'pressure+load':
      return 'High Pressure + Packed Day';
    case 'pressure':
      return 'High-Stakes Events';
    case 'load':
      return 'Packed Schedule';
    case 'morning':
      return 'Morning Focus';
    case 'evening':
      return 'Evening Wind-Down';
    default:
      return 'Based on Your State';
  }
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
      "bg-muted/5 border-l-muted-foreground/20"
    )}>
      {/* Label with info button - aligned with TodayStateCard */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
            Theme for Today
          </span>
          <span className="text-[10px] text-muted-foreground/60 font-body tracking-wide">
            {getDriverLabel(theme.driver)}
          </span>
        </div>
        <MetricInfoModal
          title="How Your Daily Theme is Selected"
          description="Your theme combines your current felt state (from check-in and wearable data), calendar pressure (high-stakes events), calendar load (meeting density), and time of day. It provides strategic guidance that acknowledges both how you feel internally and what your day demands externally."
        />
      </div>

      {/* Theme phrase - serif, italic for elegance */}
      <p className="text-xl md:text-2xl font-headline italic text-foreground leading-snug">
        "{theme.phrase}"
      </p>

      {/* Supporting context */}
      <p className="text-sm text-muted-foreground leading-relaxed font-body">
        {theme.context}
      </p>
    </div>
  );
};

export default StrategicIntentionCard;
