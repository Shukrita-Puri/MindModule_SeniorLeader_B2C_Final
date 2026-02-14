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
          description="Your Inner Readiness Score is a triangulated read of how resourced, clear, and confident you are before you engage with the demands of the day. It draws from three sources: your check-in - your felt state combined with your clarity and confidence in this moment; your internal readiness - how certain and grounded you feel in your judgment today; and your circadian context - the natural performance rhythm of the time of day and point in the week. If you have an Apple Watch connected, your HRV is added as a physiological signal - specifically how recovered your nervous system is relative to your own personal baseline. When your physiological data and your felt state diverge significantly, the score will surface that gap as an insight. This score does not measure how busy you are or what your calendar holds. That layer - how to deploy your current readiness against today's actual demands - lives in your Outer Readiness Brief"
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
  );
};

export default TodayStateCard;
