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

const StrategicIntentionCard = () => {
  const { user } = useAuth();

  const { data: theme, isLoading } = useQuery({
    queryKey: ['strategic-theme', user?.id],
    queryFn: async () => {
      const energyState = await computeEnergyState(user?.id);
      return getStrategicTheme(
        energyState.energyTier,
        energyState.calendarLoad,
        energyState.calendarPressure,
        energyState.timeOfDay
      );
    },
    enabled: !!user?.id,
    refetchInterval: 10 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !theme) {
    return (
      <div className="animate-pulse p-5 md:p-6">
        <div className="h-4 bg-muted/50 rounded w-24 mb-3" />
        <div className="h-6 bg-muted/50 rounded w-48 mb-2" />
        <div className="h-4 bg-muted/50 rounded w-full" />
      </div>
    );
  }

  return (
    <div className="p-5 md:p-6 space-y-3">
      {/* Label with info button */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground">
          Theme for Today
        </span>
        <MetricInfoModal
          title="How Your Daily Theme is Selected"
          description="Your theme is generated based on your current energy tier, calendar pressure, and time of day. It provides a single psychological frame to guide your decisions and focus throughout the day."
        />
      </div>

      {/* Theme phrase - serif, italic for elegance */}
      <p className="text-xl md:text-2xl font-headline italic text-foreground leading-snug">
        "{theme.phrase}"
      </p>

      {/* Supporting context */}
      <p className="text-sm text-muted-foreground leading-relaxed">
        {theme.context}
      </p>
    </div>
  );
};

export default StrategicIntentionCard;
