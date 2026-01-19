/**
 * TodayStateCard - "Where am I today?"
 * Combined state card showing energy score, tier, and interpretation
 * Liquid flowing design - no boxes, subtle gradient overlay
 */

import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { cn } from '@/lib/utils';
import MetricInfoModal from './MetricInfoModal';

const getTierLabel = (tier: string): string => {
  switch (tier) {
    case 'depleted':
      return 'Rest and Restore';
    case 'managing':
      return 'Stabilize and Simplify';
    case 'strong':
      return 'Perform and Maintain';
    case 'peak':
      return 'Sustain and Execute';
    default:
      return 'Stabilize and Simplify';
  }
};

const TodayStateCard = () => {
  const navigate = useNavigate();
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
      <div className="animate-pulse py-4">
        <div className="h-12 bg-muted/30 rounded-lg w-24 mb-3" />
        <div className="h-5 bg-muted/30 rounded-lg w-32 mb-4" />
        <div className="h-4 bg-muted/30 rounded-lg w-full" />
      </div>
    );
  }

  const tierLabel = getTierLabel(energyState.energyTier);
  const contextStatement = energyState.recommendation?.contextStatement || '';
  const insight = contextStatement.split('.')[0] + (contextStatement.includes('.') ? '.' : '');

  return (
    <div 
      className={cn(
        "relative cursor-pointer py-4",
        "transition-all duration-300"
      )}
      onClick={() => navigate('/insights')}
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-saffron/[0.04] via-transparent to-transparent pointer-events-none rounded-2xl" />
      
      <div className="relative">
        {/* Header with info button */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground">
            Today's State
          </span>
          <MetricInfoModal
            title="How Your Energy Score is Calculated"
            description="Your energy score combines multiple data sources: your morning check-in (emotional and cognitive state), circadian rhythm (time of day), calendar load (meeting density), and any connected wearable data. The score updates throughout the day as conditions change."
          />
        </div>

        {/* Score and Tier */}
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-4xl md:text-5xl font-bold text-saffron tabular-nums">
            {energyState.overallBalance}
          </span>
          <span className="text-lg text-muted-foreground/60">
            / 100
          </span>
        </div>
        
        <p className="text-base font-medium text-foreground mb-3">
          {tierLabel}
        </p>

        {/* Contextual Insight */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          {insight}
        </p>

        {/* Data Sources + CTA */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground/50">
            Based on {energyState.dataSources?.join(', ') || 'check-in'}
          </span>
          <div className="flex items-center text-xs text-saffron font-medium">
            <span>View insights</span>
            <ChevronRight size={14} className="ml-1" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TodayStateCard;
