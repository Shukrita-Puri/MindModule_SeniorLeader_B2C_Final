/**
 * StrategicIntentionCard - "What matters today?"
 * Displays ONE psychological frame for the entire day
 * Not interactive - pure framing instruction
 */

import { Card, CardContent } from '@/components/ui/card';
import { Target } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { getStrategicTheme } from '@/utils/energyStateScoring';
import { cn } from '@/lib/utils';

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
    refetchInterval: 10 * 60 * 1000, // Every 10 minutes
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !theme) {
    return (
      <Card className="bg-card/50 border-border/50 animate-pulse">
        <CardContent className="p-5 md:p-6">
          <div className="h-4 bg-muted rounded w-24 mb-3" />
          <div className="h-6 bg-muted rounded w-48 mb-2" />
          <div className="h-4 bg-muted rounded w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "bg-card border-border/50",
      "transition-all duration-300"
    )}>
      <CardContent className="p-5 md:p-6 space-y-3">
        {/* Label */}
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-saffron" />
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground">
            Theme for Today
          </span>
        </div>

        {/* Theme phrase - serif, italic for elegance */}
        <p className="text-xl md:text-2xl font-headline italic text-foreground leading-snug">
          "{theme.phrase}"
        </p>

        {/* Supporting context */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {theme.context}
        </p>
      </CardContent>
    </Card>
  );
};

export default StrategicIntentionCard;
