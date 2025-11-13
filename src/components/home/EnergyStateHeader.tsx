import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { computeEnergyState, type CurrentEnergyState } from '@/utils/energyStateEngine';
import { generateEnergyInsight } from '@/utils/energyInsightEngine';
import MetricInfoModal from './MetricInfoModal';

const EnergyStateHeader = () => {
  const { user } = useAuth();
  const [energyState, setEnergyState] = useState<CurrentEnergyState | null>(null);

  // Compute energy state (now async due to memory integration)
  useQuery({
    queryKey: ['energy-state', user?.id],
    queryFn: async () => {
      const state = await computeEnergyState(user?.id);
      setEnergyState(state);
      return state;
    },
    enabled: !!user?.id,
    refetchInterval: 5 * 60 * 1000 // Refetch every 5 minutes
  });

  // Generate logic-based insight
  const insight = energyState ? generateEnergyInsight({
    balance: energyState.overallBalance,
    checkInOutcome: energyState.checkInOutcome as 'pause' | 'power-up' | 'presence' | 'calm' | 'ready' | null | undefined,
    timeOfDay: new Date().getHours(),
    calendarDensity: energyState.calendarDensity || 0,
    dataSources: energyState.dataSources
  }) : '';

  if (!energyState) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="h-3 bg-muted animate-pulse rounded w-40 mb-4" />
          <div className="h-6 bg-muted animate-pulse rounded w-20 mb-3" />
          <div className="h-4 bg-muted animate-pulse rounded w-full mb-2" />
          <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 md:p-5 space-y-4">
        {/* Data Sources */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Sources:</span>
          <span>{energyState.dataSources.join(' + ')}</span>
        </div>

        {/* Balance Score - Prominent */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <span className="text-4xl md:text-5xl font-bold text-orange-500">{energyState.overallBalance}</span>
              <span className="text-xs font-light text-muted-foreground ml-1">/100</span>
            </div>
            <MetricInfoModal
              title="Balance Score"
              description="Your current energy regulation state. 0-40: Depleted (deep rest needed). 40-60: Managing (support helpful). 60-75: Strong (performing well). 75-100: Peak (optimal regulation)."
              className="ml-1"
            />
          </div>
        </div>

        {/* Logic-based Insight */}
        <div className="text-sm md:text-base text-muted-foreground leading-relaxed">
          <p>{insight}</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default EnergyStateHeader;
