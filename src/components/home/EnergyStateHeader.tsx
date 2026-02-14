import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { computeEnergyState, getEnergyStateInsight, type CurrentEnergyState } from '@/utils/energyStateEngine';
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
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    refetchOnMount: 'always', // Always refetch on mount to catch check-in updates
    refetchOnWindowFocus: true, // Refetch when window regains focus
    staleTime: 0, // Don't use stale data
  });

  // Generate logic-based insight using new system
  const insight = energyState ? getEnergyStateInsight(energyState) : '';

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

        {/* Energy Balance - Prominent */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <div>
              <span className="text-3xl md:text-5xl font-bold text-saffron">{energyState.overallBalance}</span>
              <span className="text-xs font-light text-muted-foreground ml-1">/100</span>
            </div>
            <MetricInfoModal
              title="How Your Inner Readiness Score is Calculated"
              description="Your Inner Readiness Score is a triangulated read of how resourced, clear, and confident you are before you engage with the demands of the day. It draws from three sources: your check-in — your felt state combined with your clarity and confidence in this moment; your internal readiness — how certain and grounded you feel in your judgment today; and your circadian context — the natural performance rhythm of the time of day and point in the week. If you have an Apple Watch connected, your HRV is added as a physiological signal — specifically how recovered your nervous system is relative to your own personal baseline. When your physiological data and your felt state diverge significantly, the score will surface that gap as an insight. This score does not measure how busy you are or what your calendar holds. That layer — how to deploy your current readiness against today's actual demands — lives in your Theme for Today."
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
