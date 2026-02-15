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
  const hasExtraLayers = layersActive.includes('clarity-confidence') || layersActive.includes('divergence');

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
          description="Your Inner Readiness Score is a triangulated read of how resourced, clear, and confident you are before you engage with the demands of the day. It draws from three sources: your check-in, your felt state combined with your clarity and confidence in this moment; your internal readiness, how certain and grounded you feel in your judgment today; and your circadian context, the natural performance rhythm of the time of day and point in the week. If you have an Apple Watch connected, your HRV is added as a physiological signal, specifically how recovered your nervous system is relative to your own personal baseline. The insight below is built in layers. Layer 1 is always present: a base read of your felt state at this time of day. Layer 2 appears only when your clarity and confidence are notably low or high, adding nuance to the base read. Layer 3 appears only when your wearable data diverges significantly from your felt state, surfacing a gap between what you feel and what your body is showing. Most of the time you will see Layer 1 only. When additional layers appear, it means the system has detected a signal worth naming."
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

      {/* Layer indicator - only shown when extra layers triggered */}
      {hasExtraLayers && (
        <div className="flex items-center gap-1.5 mb-4">
          {layersActive.includes('clarity-confidence') && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-saffron/10 text-saffron font-medium font-body">
              Clarity &amp; Confidence signal
            </span>
          )}
          {layersActive.includes('divergence') && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium font-body">
              Physiological divergence
            </span>
          )}
        </div>
      )}

      {!hasExtraLayers && <div className="mb-4" />}

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
