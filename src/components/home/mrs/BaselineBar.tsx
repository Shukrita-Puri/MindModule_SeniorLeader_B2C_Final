import { cn } from '@/lib/utils';

interface BaselineBarProps {
  score: number | null;
  baseline: number | null;
  range: { low: number; high: number } | null;
}

/**
 * Lower / Current / Higher reference bar. Shows where the current score
 * sits relative to the user's personal 30-day baseline band.
 */
const BaselineBar = ({ score, baseline, range }: BaselineBarProps) => {
  const hasScore = typeof score === 'number';
  const hasBand = !!range && typeof baseline === 'number';

  // Visual axis: 0–100 score space mapped to bar width.
  const pct = (v: number) => `${Math.max(0, Math.min(100, v))}%`;

  const delta = hasScore && typeof baseline === 'number' ? Math.round(score! - baseline) : null;
  const deltaLabel =
    delta === null
      ? null
      : `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(delta)}`;

  return (
    <div className="w-full">
      <div className="relative h-10">
        {/* Track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-muted-foreground/15" />

        {/* Baseline band (your normal) */}
        {hasBand && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-gradient-to-r from-[hsl(var(--tier-strong)/0.35)] via-[hsl(var(--tier-strong)/0.65)] to-[hsl(var(--tier-strong)/0.35)]"
            style={{
              left: pct(range!.low),
              right: `${100 - Math.min(100, range!.high)}%`,
            }}
          />
        )}

        {/* Current marker */}
        {hasScore && (
          <div
            className="absolute top-1/2 -translate-y-1/2"
            style={{ left: pct(score!) }}
          >
            <div className="relative -translate-x-1/2 flex flex-col items-center">
              <div className="h-3 w-3 rounded-full bg-foreground shadow-[0_0_0_3px_hsl(var(--background))]" />
              {deltaLabel && (
                <span
                  className={cn(
                    'absolute -top-6 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums',
                    delta! > 1
                      ? 'bg-[hsl(var(--tier-strong)/0.15)] text-[hsl(var(--tier-strong))]'
                      : delta! < -1
                        ? 'bg-[hsl(var(--tier-low)/0.15)] text-[hsl(var(--tier-low))]'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {deltaLabel}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
        <span>Lower</span>
        <span className="text-foreground/70">
          {hasBand ? `Your normal · ${baseline}` : 'Current'}
        </span>
        <span>Higher</span>
      </div>
    </div>
  );
};

export default BaselineBar;