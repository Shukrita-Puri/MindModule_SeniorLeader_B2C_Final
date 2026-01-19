/**
 * StrategicIntentionCard - "What matters today?"
 * Displays ONE psychological frame for the entire day
 * Not interactive - pure framing instruction
 */

import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { getStrategicTheme } from '@/utils/energyStateScoring';
import MetricInfoModal from './MetricInfoModal';
import { cn } from '@/lib/utils';

// Get state-based accent color class
const getStateAccentClass = (checkInOutcome?: string): string => {
  switch (checkInOutcome) {
    case 'overwhelmed':
    case 'drained':
      return 'bg-[hsl(var(--state-depleted)/0.08)] border-l-[hsl(var(--state-depleted))]';
    case 'scattered':
      return 'bg-[hsl(var(--state-scattered)/0.06)] border-l-[hsl(var(--state-scattered))]';
    case 'steady':
      return 'bg-[hsl(var(--state-steady)/0.06)] border-l-[hsl(var(--state-steady))]';
    case 'focused':
      return 'bg-[hsl(var(--state-focused)/0.06)] border-l-[hsl(var(--state-focused))]';
    default:
      return 'bg-muted/30 border-l-muted-foreground/30';
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

  const stateAccentClass = getStateAccentClass(energyState.checkInOutcome);

  return (
    <div className={cn(
      "py-4 px-4 -mx-4 space-y-3 rounded-lg border-l-2 transition-colors duration-500",
      stateAccentClass
    )}>
      {/* Label with info button - aligned with TodayStateCard */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
          Theme for Today
        </span>
        <MetricInfoModal
          title="How Your Daily Theme is Selected"
          description="Your theme is generated based on your current felt state (from check-in), calendar pressure, and time of day. It provides strategic guidance that acknowledges both how you feel and what your day demands."
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
