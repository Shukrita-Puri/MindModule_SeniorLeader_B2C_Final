/**
 * TodayStateCard - "Where am I today?" 
 * Unified state card showing energy score, tier, and one-line insight
 * Tappable to navigate to Insights page
 */

import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { computeEnergyState, type CurrentEnergyState } from '@/utils/energyStateEngine';
import { cn } from '@/lib/utils';

const getTierLabel = (tier: string): string => {
  const labels: Record<string, string> = {
    'depleted': 'Rest and Restore',
    'managing': 'Stabilize and Simplify',
    'strong': 'Perform and Maintain',
    'peak': 'Sustain and Execute'
  };
  return labels[tier] || 'Calibrating';
};

const TodayStateCard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: energyState, isLoading } = useQuery({
    queryKey: ['energy-state', user?.id],
    queryFn: async () => {
      const state = await computeEnergyState(user?.id);
      return state;
    },
    enabled: !!user?.id,
    refetchInterval: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  if (isLoading || !energyState) {
    return (
      <Card className="bg-card/50 border-border/50 animate-pulse">
        <CardContent className="p-5 md:p-6">
          <div className="h-4 bg-muted rounded w-32 mb-4" />
          <div className="h-12 bg-muted rounded w-48 mb-4" />
          <div className="h-4 bg-muted rounded w-full mb-2" />
          <div className="h-4 bg-muted rounded w-3/4" />
        </CardContent>
      </Card>
    );
  }

  const tierLabel = getTierLabel(energyState.energyTier);
  const insight = energyState.recommendation?.contextStatement || '';
  // Truncate insight to one sentence for homepage
  const oneLineInsight = insight.split('.')[0] + '.';

  return (
    <Card 
      className={cn(
        "bg-card border-border/50 cursor-pointer transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]"
      )}
      onClick={() => navigate('/insights')}
    >
      <CardContent className="p-5 md:p-6 space-y-4">
        {/* Score + Tier */}
        <div className="flex items-baseline gap-3">
          <div className="flex items-baseline">
            <span className="text-4xl md:text-5xl font-bold text-saffron tabular-nums">
              {energyState.overallBalance}
            </span>
            <span className="text-lg text-muted-foreground font-light ml-1">/100</span>
          </div>
          <span className="text-lg md:text-xl font-medium text-foreground">
            — {tierLabel}
          </span>
        </div>

        {/* One-line insight */}
        <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
          {oneLineInsight}
        </p>

        {/* Data sources + tap hint */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground/70">
            Based on {energyState.dataSources.join(', ').toLowerCase()}
          </span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
            <span>Tap for insights</span>
            <ChevronRight className="h-3 w-3" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TodayStateCard;
