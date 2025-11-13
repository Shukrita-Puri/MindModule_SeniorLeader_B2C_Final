import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { computeEnergyState, type CurrentEnergyState } from '@/utils/energyStateEngine';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buildUserContext } from '@/utils/llmContextBuilder';
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

  const insight = insightData?.insight || getDefaultInsight(energyState);

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-4">
        {/* Data Sources */}
        <div className="text-xs text-muted-foreground">
          {energyState.dataSources.join(' + ')}
        </div>

        {/* Balance Score with Info Icon */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Balance</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="flex items-center justify-center w-5 h-5 rounded-full hover:bg-muted/50 transition-colors">
                    <Info className="h-3.5 w-3.5 text-muted-foreground/60" />
                  </button>
                </TooltipTrigger>
                <TooltipContent 
                  side="bottom" 
                  align="center" 
                  sideOffset={8}
                  className="max-w-[340px] p-5 text-sm bg-card border-border shadow-lg"
                >
                  <div className="space-y-3">
                    <p className="text-foreground font-medium text-base">What does your balance score mean?</p>
                    <ul className="space-y-2.5 text-muted-foreground">
                      <li className="flex items-start gap-3">
                        <span className="text-foreground font-medium min-w-[55px] text-sm">0-40:</span>
                        <span className="leading-relaxed">Depleted — deep rest needed</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-foreground font-medium min-w-[55px] text-sm">40-60:</span>
                        <span className="leading-relaxed">Managing — support helpful</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-foreground font-medium min-w-[55px] text-sm">60-75:</span>
                        <span className="leading-relaxed">Strong — performing well</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-foreground font-medium min-w-[55px] text-sm">75-100:</span>
                        <span className="leading-relaxed">Peak — optimal regulation</span>
                      </li>
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-saffron">
              {energyState.overallBalance}
            </span>
            <span className="text-xs font-light text-muted-foreground">/100</span>
          </div>
        </div>

        {/* Unified LLM Insight (includes recommendation) */}
        <div className="pt-2">
          {isLoadingInsight ? (
            <div className="space-y-2">
              <div className="h-4 bg-muted animate-pulse rounded w-full" />
              <div className="h-4 bg-muted animate-pulse rounded w-4/5" />
            </div>
          ) : (
            <p className="text-sm md:text-base text-foreground leading-relaxed">
              {insight}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

function getDefaultInsight(energyState: CurrentEnergyState): string {
  const { overallBalance, recommendationPriority, checkInOutcome } = energyState;
  const hour = new Date().getHours();
  const timeContext = hour >= 6 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'afternoon' : 'evening';
  
  // State-aware fallbacks with unified insight + recommendation format (20-25 words)
  if (checkInOutcome === 'scattered') {
    return `Scattered focus detected. ${timeContext === 'morning' ? 'Morning window ideal for centering.' : timeContext === 'evening' ? 'Evening approaching.' : 'Afternoon dip window.'} Recommended: focus and centering practices.`;
  }
  if (checkInOutcome === 'overwhelmed') {
    return `System overloaded. ${timeContext === 'evening' ? 'Evening wind-down needed.' : 'Calendar density high.'} Recommended: calming and grounding practices to protect decision quality.`;
  }
  if (checkInOutcome === 'tired') {
    if (timeContext === 'morning') return "Low energy in prime window. Morning peak still available. Recommended: gentle energizing restoration before 11am.";
    if (timeContext === 'evening') return "Depleted at day's end. Evening transition approaching. Recommended: deep restoration practices before rest.";
    return "Energy dip detected. Afternoon window challenging. Recommended: rebalancing support to sustain performance.";
  }
  if (checkInOutcome === 'ready') {
    if (timeContext === 'evening') return "Strong regulation at 85+. Evening transition approaching. Recommended: grounding practices to consolidate gains.";
    return "Peak state detected. High balance maintained. Recommended: sustaining practices to protect this focus window.";
  }
  
  // Balance-driven fallbacks when no check-in outcome
  if (overallBalance >= 75) {
    if (timeContext === 'evening') return "Strong regulation state. Evening transition detected. Recommended: grounding practices to consolidate and transition to rest.";
    return "Peak regulation achieved. High balance sustained. Recommended: focus practices to maintain clarity and performance.";
  }
  if (overallBalance >= 60) return `Balanced state at ${overallBalance}. ${timeContext === 'morning' ? 'Morning clarity window.' : 'Performance steady.'} Recommended: sustaining practices to maintain energy.`;
  if (overallBalance >= 40) return "Managing but need support. Energy mid-range detected. Recommended: rebalancing tools to restore and stabilize.";
  return "System running low. Deep depletion detected. Recommended: restoration practices to rebuild energy reserves.";
}

export default EnergyStateHeader;
