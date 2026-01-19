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

// Outcome-aware tier labels - specific to what user selected
const getStateLabel = (tier: string, checkInOutcome?: string): string => {
  // Outcome-specific labels override tier labels
  if (checkInOutcome) {
    switch (checkInOutcome) {
      case 'overwhelmed':
        return 'Regulate and Reset';
      case 'drained':
        return 'Rest and Restore';
      case 'scattered':
        return 'Ground and Focus';
      case 'steady':
        return 'Steady State';
      case 'focused':
        return tier === 'peak' ? 'Peak Performance' : 'Perform and Execute';
    }
  }
  // Fallback to tier-based labels (if no check-in)
  switch (tier) {
    case 'depleted':
      return 'Rest and Restore';
    case 'managing':
      return 'Stabilize and Simplify';
    case 'strong':
      return 'Perform and Execute';
    case 'peak':
      return 'Peak Performance';
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

  // Clean dashes from context statement
  const cleanText = (text: string) => text.replace(/ - /g, ' ').replace(/—/g, ' ').replace(/ – /g, ' ');
  
  const tierLabel = getStateLabel(energyState.energyTier, energyState.checkInOutcome);
  const contextStatement = energyState.recommendation?.contextStatement || '';
  const insight = cleanText(contextStatement);

  return (
    <div className="relative py-4 transition-all duration-300">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-saffron/[0.04] via-transparent to-transparent pointer-events-none rounded-2xl" />
      
      <div className="relative">
        {/* Header with info button - aligned */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
            Today's State
          </span>
          <MetricInfoModal
            title="How Your Energy Score is Calculated"
            description="Your energy score reflects your current felt state. It combines your check-in (emotional and cognitive state), circadian rhythm (time of day), and any connected wearable data. Calendar demands are handled separately in your Theme for Today."
          />
        </div>

        {/* Score and Tier */}
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-4xl md:text-5xl font-bold text-saffron tabular-nums font-body">
            {energyState.overallBalance}
          </span>
          <span className="text-lg text-muted-foreground/60 font-body">
            / 100
          </span>
        </div>
        
        <p className="text-base font-medium text-foreground mb-3 font-body">
          {tierLabel}
        </p>

        {/* Contextual Insight - Enriched */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-4 font-body">
          {insight}
        </p>

        {/* Data Sources + CTA - clickable for navigation */}
        <div 
          className="flex items-center justify-between cursor-pointer group"
          onClick={() => navigate('/insights')}
        >
          <span className="text-xs text-muted-foreground/50 font-body">
            Based on {energyState.dataSources?.join(', ') || 'check-in'}
          </span>
          <div className="flex items-center text-xs text-foreground font-medium group-hover:underline font-body">
            <span>View insights</span>
            <ChevronRight size={14} className="ml-1" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TodayStateCard;
