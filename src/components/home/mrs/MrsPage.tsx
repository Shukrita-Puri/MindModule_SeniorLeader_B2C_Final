import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOuterReadiness } from '@/hooks/useOuterReadiness';
import { useMrsTrend } from '@/hooks/useMrsTrend';
import MrsGauge from './MrsGauge';
import MrsSparkline from './MrsSparkline';
import BaselineBar from './BaselineBar';
import { cn } from '@/lib/utils';

type Range = 7 | 30 | 180;

const rangeLabels: Record<Range, string> = {
  7: '1W',
  30: '1M',
  180: '6M',
};

const MrsPage = () => {
  const navigate = useNavigate();
  const { data: outerBrief, isLoading } = useOuterReadiness();
  const score = outerBrief?.innerReadinessScore ?? null;
  const tier = outerBrief?.innerReadinessTierDisplayed || outerBrief?.innerReadinessTier || null;
  const [range, setRange] = useState<Range>(7);
  const trend = useMrsTrend(score, range);

  const deltaSign = trend.data?.delta ?? 0;
  const DeltaIcon = deltaSign > 1 ? TrendingUp : deltaSign < -1 ? TrendingDown : Minus;
  const deltaTone =
    deltaSign > 1
      ? 'text-[hsl(var(--tier-strong))] bg-[hsl(var(--tier-strong)/0.10)] border-[hsl(var(--tier-strong)/0.25)]'
      : deltaSign < -1
        ? 'text-[hsl(var(--tier-low))] bg-[hsl(var(--tier-low)/0.10)] border-[hsl(var(--tier-low)/0.25)]'
        : 'text-muted-foreground bg-muted/40 border-border';

  const hasScore = typeof score === 'number';

  return (
    <section
      aria-label="Mental Readiness Score"
      className="w-full h-full overflow-y-auto px-5 pt-2 pb-12"
    >
      <div className="max-w-md mx-auto flex flex-col items-center text-center">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mt-2">
          Mental Readiness Score
        </p>

        <div className="mt-5">
          <MrsGauge score={score} tier={tier} size={232} />
        </div>

        {/* Delta chip */}
        <div className="mt-5 min-h-[28px] flex items-center justify-center">
          {trend.data?.deltaLabel ? (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
                deltaTone
              )}
            >
              <DeltaIcon className="h-3.5 w-3.5" strokeWidth={2} />
              {trend.data.deltaLabel}
            </span>
          ) : hasScore ? (
            <span className="text-xs text-muted-foreground italic">
              {trend.data?.caption ?? 'Building your trend history'}
            </span>
          ) : null}
        </div>

        {/* Progression caption */}
        {trend.data?.deltaLabel && (
          <p className="mt-2 text-sm text-foreground/80 max-w-[26ch]">
            {trend.data.caption}
          </p>
        )}

        {/* Anchored Take Assessment pill */}
        <button
          type="button"
          onClick={() => navigate('/daily-check-in')}
          className={cn(
            'mt-5 inline-flex items-center gap-2 rounded-full',
            'border border-border/60 bg-background/60 backdrop-blur-sm',
            'px-4 py-2 text-xs font-medium text-foreground/85',
            'hover:bg-background/90 transition-colors'
          )}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          {hasScore ? 'Take assessment' : 'Check in to generate your score'}
        </button>

        {/* Baseline (Lower / Current / Higher) */}
        <div className="w-full mt-8 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Vs your baseline
            </span>
            <span className="text-[10px] text-muted-foreground/70">30-day</span>
          </div>
          <BaselineBar
            score={score}
            baseline={trend.data?.baseline ?? null}
            range={trend.data?.baselineRange ?? null}
          />
        </div>

        {/* Trend chart with range toggle */}
        <div className="w-full mt-4 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Trend
            </span>
            <div className="flex items-center gap-1 rounded-full bg-muted/40 p-0.5">
              {(Object.keys(rangeLabels) as unknown as Range[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(Number(r) as Range)}
                  className={cn(
                    'px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] rounded-full transition-colors',
                    Number(r) === range
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground/80'
                  )}
                >
                  {rangeLabels[Number(r) as Range]}
                </button>
              ))}
            </div>
          </div>
          <MrsSparkline history={trend.data?.history ?? []} height={84} />
          <p className="mt-3 text-[11px] text-muted-foreground/80 text-left">
            {range === 180
              ? trend.data?.trajectoryCaption ?? 'Building your 6-month trajectory'
              : trend.data?.caption ?? 'Building your trend history'}
          </p>
        </div>

        {tier && hasScore && (
          <p className="mt-6 text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80">
            Current tier · {tier}
          </p>
        )}
      </div>
    </section>
  );
};

export default MrsPage;