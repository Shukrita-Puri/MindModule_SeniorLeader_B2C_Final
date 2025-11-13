import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buildUserContext } from '@/utils/llmContextBuilder';
import { computeEnergyState, type CurrentEnergyState } from '@/utils/energyStateEngine';
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

  // Get LLM-generated insight
  const { data: insightData } = useQuery({
    queryKey: ['energy-insight', energyState?.overallBalance, energyState?.state, energyState?.dataSources],
    queryFn: async () => {
      if (!energyState) return null;
      
      const userContext = await buildUserContext(energyState, user?.id);
      
      const { data, error } = await supabase.functions.invoke('generate-energy-insight', {
        body: userContext
      });
      
      if (error) {
        console.error('Error generating insight:', error);
        return { insight: getDefaultInsight(energyState) };
      }
      
      return data;
    },
    enabled: !!energyState,
    staleTime: 10 * 60 * 1000 // Cache for 10 minutes
  });

  const isLoadingInsight = !insightData;
  const llmInsight = insightData?.insight || (energyState ? getDefaultInsight(energyState) : '');

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
              <span className="text-4xl md:text-5xl font-bold text-foreground">{energyState.overallBalance}</span>
              <span className="text-xs font-light text-muted-foreground ml-1">/100</span>
            </div>
            <MetricInfoModal
              title="Balance Score"
              description="Your current energy regulation state. 0-40: Depleted (deep rest needed). 40-60: Managing (support helpful). 60-75: Strong (performing well). 75-100: Peak (optimal regulation)."
              className="ml-1"
            />
          </div>
        </div>

        {/* LLM Insight */}
        <div className="text-sm md:text-base text-muted-foreground leading-relaxed">
          {isLoadingInsight ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : (
            <p>{llmInsight}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Fallback insights when LLM is unavailable
function getDefaultInsight(energyState: CurrentEnergyState): string {
  const { overallBalance, recommendationPriority, checkInOutcome } = energyState;
  const hour = new Date().getHours();

  if (overallBalance >= 75) {
    if (hour >= 18) {
      return "Strong regulation detected. Evening transition approaching—time to ground yourself.";
    }
    return "Strong regulation detected. Sustain this with grounding practices.";
  }

  if (overallBalance >= 60) {
    return "Solid performance state. Maintain focus with centering practices.";
  }

  if (overallBalance >= 40) {
    if (hour >= 18) {
      return "Moderate balance. Evening restoration practices recommended.";
    }
    return "Managing current demands. Support helpful—try restoring practices.";
  }

  // Low balance (<40)
  if (hour >= 18) {
    return "System depleted. Prioritize rest and recovery tonight.";
  }
  if (hour < 12) {
    return "Low energy detected. Morning peak window still available—gentle activation recommended.";
  }
  return "Energy dip detected. Immediate restoration needed.";
}

export default EnergyStateHeader;
