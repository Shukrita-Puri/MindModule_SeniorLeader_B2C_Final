/**
 * StrategicIntentionCard - "Outer Readiness Brief"
 * Displays the strategic frame for the day: theme + context + lean on + watch for
 * All logic now lives in compute-outer-readiness edge function.
 * This is a thin presentation component.
 */

import { useOuterReadiness } from '@/hooks/useOuterReadiness';
import MetricInfoModal from './MetricInfoModal';
import CoachSurfaceMessage from '@/components/coach/CoachSurfaceMessage';

import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';
import { TextWithEventEmphasis } from '@/components/ui/TextWithEventEmphasis';

/** Parse leanOn text for contextual enrichment blocks (text after \n\n_..._) */
function renderLeanOn(text: string) {
  const parts = text.split('\n\n_');
  if (parts.length === 1) return <p className="text-[13px] text-primary/80 font-body leading-relaxed"><span className="typo-lean-label">Lean on:</span> {text}</p>;
  return (
    <>
      <p className="text-[13px] text-primary/80 font-body leading-relaxed">
        <span className="typo-lean-label">Lean on:</span> {parts[0]}
      </p>
      <p className="text-[12px] text-muted-foreground/70 font-body leading-relaxed italic mt-2 pt-2 border-t border-border/30">
        {parts[1].replace(/_$/, '')}
      </p>
    </>
  );
}

interface StrategicIntentionCardProps {
  jitEvent?: { title: string; minutesUntil: number };
}

const StrategicIntentionCard = ({ jitEvent }: StrategicIntentionCardProps) => {
  const { data: brief, isLoading } = useOuterReadiness();

  // Only show skeleton on initial load, not background refetches
  if (isLoading && !brief) {
    return (
      <div className="p-5 md:p-6">
        <div className="h-4 bg-muted/50 rounded w-24 mb-3" />
        <div className="h-6 bg-muted/50 rounded w-48 mb-2" />
        <div className="h-4 bg-muted/50 rounded w-full" />
      </div>
    );
  }

  if (!brief) return null;

  return (
    <div className={cn(
      "rounded-xl p-5 space-y-3 transition-all duration-300",
      "bg-white/65 backdrop-blur-[20px] border border-black/[0.06]",
      "shadow-[0_4px_16px_rgba(0,0,0,0.04)]",
      "border-l-2 border-l-taupe/40"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] tracking-[0.08em] uppercase text-muted-foreground/60 font-body">Outer Readiness Brief</h2>
        <MetricInfoModal
          title="Your Outer Readiness Brief"
          description="Your Compass is where your inner world meets the outer demands of the day. It takes your Decision Readiness Score, how resourced, clear, and confident you are right now, and reads it against what your calendar is genuinely asking of you. The result is a single frame for how to orient yourself today: what to lean on, and what to watch for. Not a prescription. A direction."
        />
      </div>

      {/* Theme content */}
      <div key={brief.phrase} className="animate-fade-in space-y-3">
        {/* Theme phrase */}
        <p className="text-[17px] md:text-xl font-headline italic text-foreground leading-snug">
          "{brief.phrase}"
        </p>

        {/* Context line */}
        <p className="text-[15px] leading-[1.5] text-muted-foreground font-body context-clamp">
          <TextWithEventEmphasis text={brief.context} />
        </p>

        {/* JIT event context banner */}
        {jitEvent && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/15 rounded-lg">
            <span className="text-[13px] text-foreground font-medium font-body">
              <TextWithEventEmphasis text={`'${jitEvent.title}' in ${jitEvent.minutesUntil} min – your sequence is ready`} />
            </span>
          </div>
        )}

        {/* Coach Insight Age Label */}
        {brief.coachInsightLabel && (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-l-[3px] border-l-taupe/60 rounded-sm">
            <Info className="w-3.5 h-3.5 text-taupe/80 shrink-0" />
            <span className="text-xs text-muted-foreground font-body">{brief.coachInsightLabel}</span>
          </div>
        )}

        {/* Coach Surface Message — renders nothing when empty */}
        <CoachSurfaceMessage />

        {/* Lean On + Watch For */}
        <div className="space-y-1 pt-1">
          {renderLeanOn(brief.leanOn)}
          <p className="text-[13px] text-muted-foreground/80 font-body leading-relaxed">
            <span className="typo-lean-label">Watch for:</span>{' '}
            {brief.watchFor}
          </p>
        </div>
      </div>

      {/* Footer - data sources */}
      <div className="pt-1">
        <span className="text-[10px] text-muted-foreground/50 font-body">
          Based on {brief.dataSources.join(', ')}
        </span>
      </div>
    </div>
  );
};

export default StrategicIntentionCard;
