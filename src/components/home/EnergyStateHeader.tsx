import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { computeEnergyState, type CurrentEnergyState } from '@/utils/energyStateEngine';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
      
      const { data, error } = await supabase.functions.invoke('generate-energy-insight', {
        body: {
          balance: energyState.overallBalance,
          state: energyState.state,
          dataSources: energyState.dataSources,
          recommendationPriority: energyState.recommendationPriority
        }
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

  if (!energyState) {
    return (
      <Card className="bg-gradient-to-br from-taupe/10 to-taupe-highlight/5 border-border/50 animate-pulse">
        <CardContent className="p-5">
          <div className="h-20" />
        </CardContent>
      </Card>
    );
  }

  const insight = insightData?.insight || getDefaultInsight(energyState);

  return (
    <Card className="bg-gradient-to-br from-taupe/10 to-taupe-highlight/5 border-border/50">
      <CardContent className="p-5">
        <div className="space-y-4">
          {/* Header with data sources */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Energy State Today</h3>
            <span className="text-xs text-muted-foreground">
              {energyState.dataSources.join(' + ')}
            </span>
          </div>
          
          {/* LLM-generated crisp insight */}
          <p className="text-sm md:text-base text-foreground leading-relaxed">
            {insight}
          </p>
          
          {/* Score + Progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Balance</span>
              <span className="text-2xl font-bold text-saffron">
                {energyState.overallBalance}
                <span className="text-muted-foreground">/100</span>
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full taupe-gradient transition-all duration-500"
                style={{ width: `${energyState.overallBalance}%` }}
              />
            </div>
            
            {/* Practice recommendation */}
            <p className="text-xs text-muted-foreground mt-2">
              → {getPracticeTypeText(energyState.recommendationPriority)} recommended
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

function getPracticeTypeText(priority: string): string {
  const map: Record<string, string> = {
    'rest': 'Deep restoration',
    'restore': 'Rebalancing practices',
    'activate': 'Energizing tools',
    'maintain': 'Peak state practices'
  };
  return map[priority] || 'Practices';
}

function getDefaultInsight(energyState: CurrentEnergyState): string {
  const { overallBalance, state } = energyState;
  
  if (overallBalance < 40) {
    return 'Deep restoration needed—your system is depleted and requires rest.';
  }
  if (overallBalance < 55) {
    return 'High activation detected—time to downregulate with calming practices.';
  }
  if (overallBalance < 70) {
    return 'Mental scatter present—centering practices will help you refocus.';
  }
  if (overallBalance < 85) {
    return 'Balanced state—maintain this equilibrium with grounding practices.';
  }
  return 'Peak energy state—sustain your momentum with focus practices.';
}

export default EnergyStateHeader;
