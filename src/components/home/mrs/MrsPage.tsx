import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOuterReadiness } from '@/hooks/useOuterReadiness';
import { useMrsTrend } from '@/hooks/useMrsTrend';
import MrsGauge from './MrsGauge';
import MrsSparkline from './MrsSparkline';
import { cn } from '@/lib/utils';

const dayLabel = (iso: string, i: number, total: number): string => {
  if (i === total - 1) return 'Today';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1);
};

const MrsPage = () => {
  const navigate = useNavigate();
  const { data: outerBrief, isLoading } = useOuterReadiness();
  const score = outerBrief?.innerReadinessScore ?? null;
  const tier = outerBrief?.innerReadinessTierDisplayed || outerBrief?.innerReadinessTier || null;
  const trend = useMrsTrend(score);

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

        {!hasScore && !isLoading && (
          <Button
            variant="outline"
            className="mt-5 rounded-full"
            onClick={() => navigate('/daily-check-in')}
          >
            Check in to generate your score
          </Button>
        )}

        {/* Sparkline card */}
        <div className="w-full mt-8 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Last 7 days
            </span>
            <span className="text-[10px] text-muted-foreground/70">1W</span>
          </div>
          <MrsSparkline history={trend.data?.history ?? []} height={72} />
          {trend.data?.history && trend.data.history.length > 0 && (
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground/70 px-1">
              {trend.data.history.map((p, i, arr) => (
                <span key={p.date}>{dayLabel(p.date, i, arr.length)}</span>
              ))}
            </div>
          )}
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