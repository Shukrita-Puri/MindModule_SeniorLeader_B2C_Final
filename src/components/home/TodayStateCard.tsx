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
const getStateLabel = (tier: string): string => {
  switch (tier) {
    case 'depleted':
      return 'Low Reserve';
    case 'managing':
      return 'Moderate Capacity';
    case 'strong':
      return 'Strong Readiness';
    case 'peak':
      return 'Peak Readiness';
    default:
      return 'Moderate Capacity';
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
  
  const tierLabel = getStateLabel(energyState.energyTier);
  const contextStatement = energyState.recommendation?.contextStatement || '';
  const insight = cleanText(contextStatement);
  const layersActive = energyState.layersActive || ['base'];

  return (
    <div className={cn(
      "rounded-xl p-5 transition-all duration-300",
      "bg-white/65 backdrop-blur-[20px] border border-black/[0.06]",
      "shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
    )}>
      {/* Header with info button - aligned */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
          Inner Readiness
        </span>
        <MetricInfoModal
          title="How Your Inner Readiness Score is Calculated"
          description="Your Inner Readiness Score is where your internal signals meet. It combines how you feel right now — your energy, clarity about direction, and confidence in execution — with the natural rhythm of the time of day and what your body is telling you through wearable data. The result is a triangulated read of where you stand internally: how resourced, clear, and confident you are before you engage with the demands of the day. Not a wellness check. A performance-calibrated readiness profile. This is your internal world. How to orient it against today's outer demands lives in your Outer Readiness Brief."
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
      <p className="text-sm text-muted-foreground leading-relaxed mb-2 font-body">
        {insight}
      </p>

      <div className="mb-4" />

      {/* Data Sources + CTA - clickable for navigation */}
      <div 
        className="flex items-center justify-between cursor-pointer group"
        onClick={() => navigate('/insights')}
      >
        <span className="text-[10px] text-muted-foreground/50 font-body whitespace-nowrap">
          Based on {(energyState.dataSources || ['check-in']).map(s => 
            s === 'circadian' ? 'circadian score' : s === 'wearable' ? 'wearable score' : 'self check-in'
          ).join(', ')}
        </span>
        <div className="flex items-center text-[10px] text-foreground font-medium group-hover:underline font-body whitespace-nowrap ml-2">
          <span>View insights</span>
          <ChevronRight size={12} className="ml-0.5" />
        </div>
      </div>
    </div>
  );
};

export default TodayStateCard;
