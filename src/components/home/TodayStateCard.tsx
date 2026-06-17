/**
 * TodayStateCard - "Where am I today?"
 * Combined state card showing energy score, tier, and interpretation
 * Liquid flowing design - no boxes, subtle gradient overlay
 */

import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { cn } from '@/lib/utils';
import MetricInfoModal from './MetricInfoModal';
import { getReadinessOneLiner } from '@/utils/readinessLabels';

// Traffic-light tier color (NOT saffron — saffron is reserved for CTAs)
const getTierColor = (tier: string): string => {
  switch (tier) {
    case 'depleted': return 'text-[hsl(var(--tier-low))]';
    case 'managing': return 'text-[hsl(var(--tier-moderate))]';
    case 'strong':
    case 'peak':     return 'text-[hsl(var(--tier-strong))]';
    default:         return 'text-[hsl(var(--tier-neutral))]';
  }
};

const TodayStateCard = () => {
  const { user } = useAuth();

  const { data: energyState, isLoading, isRefetching } = useQuery({
    queryKey: ['energy-state', user?.id],
    queryFn: async () => {
      return await computeEnergyState(user?.id);
    },
    enabled: !!user?.id,
    refetchInterval: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 30_000, // 30s stale time prevents rapid refetch flicker
    placeholderData: (prev) => prev, // Keep previous data during refetch to avoid skeleton flash
  });

  // Only show skeleton on initial load, not on background refetch
  if (isLoading && !energyState) {
    return (
      <div className="py-4">
        <div className="h-12 bg-muted/30 rounded-lg w-24 mb-3" />
        <div className="h-5 bg-muted/30 rounded-lg w-32 mb-4" />
        <div className="h-4 bg-muted/30 rounded-lg w-full" />
      </div>
    );
  }
  
  if (!energyState) return null;

  // Clean dashes from context statement
  const cleanText = (text: string) => text.replace(/ - /g, ' ').replace(/–/g, ' ').replace(/ – /g, ' ');
  
  // MRS v3 — prefer the soft-guard displayed tier when present so the label
  // reflects chronic load (e.g. caps Strong/Peak to Mixed when a sustained
  // deficit is active). Score number remains the raw, uncapped value.
  const displayedTier = (energyState as any).tierDisplayed ?? energyState.energyTier;
  const tierLabel =
    getReadinessOneLiner(energyState.overallBalance) ?? '';
  const isAwaiting = energyState.overallBalance == null || energyState.readinessState === 'awaiting';
  const contextStatement = energyState.recommendation?.contextStatement || '';
  const insight = isAwaiting
    ? 'No recent wearable data — sync in Connected Data, or check in to take a self-assessment.'
    : cleanText(contextStatement);
  const layersActive = energyState.layersActive || ['base'];
  const layer3Statement = energyState.layer3Statement ? cleanText(energyState.layer3Statement) : null;

  return (
    <div className={cn(
      "rounded-xl p-5 transition-all duration-300",
      "bg-white border border-[#cfc7b8]",
      "shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    )}>
      {/* Header with info button - aligned */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs tracking-[0.08em] uppercase text-muted-foreground/60 font-body">Decision Readiness</h2>
        <MetricInfoModal
          title="What Your Decision Readiness Score Tracks"
          description="A read of how ready you are to make good decisions right now — drawn from how you feel, the time of day, and your body’s recovery signals. Use it to orient your internal world before you step into the day."
        />
      </div>
      {/* Score and Tier */}
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-[48px] font-medium tabular-nums font-body text-foreground">
          {energyState.overallBalance ?? '—'}
        </span>
        <span className="text-sm text-muted-foreground/60 font-body">
          / 100
        </span>
      </div>
      
      <p className={cn(
        "text-[15px] font-medium mb-3 font-body",
        getTierColor(displayedTier)
      )}>
        {isAwaiting ? 'EARLY READ — check in to sharpen it' : tierLabel}
      </p>

      {/* Contextual Insight - Enriched */}
      <p className="text-[15px] leading-[1.5] text-muted-foreground mb-2 font-body context-clamp">
        {insight}
      </p>

      {/* Layer 3: Wearable Context – separate line for visibility */}
      {layer3Statement && layersActive.includes('wearable') && (
        <p className="text-sm text-muted-foreground/70 leading-relaxed mb-2 font-body italic">
          {layer3Statement}
        </p>
      )}

      <div className="mb-4" />

      {/* Data Sources */}
      <div className="flex items-center">
        <span className="text-xs text-muted-foreground/50 font-body whitespace-nowrap">
          Based on {(energyState.dataSources || ['check-in']).map(s => 
            s === 'circadian' ? 'circadian score' : s === 'wearable' ? 'wearable score' : 'self check-in'
          ).join(', ')}
        </span>
      </div>
    </div>
  );
};

export default TodayStateCard;
