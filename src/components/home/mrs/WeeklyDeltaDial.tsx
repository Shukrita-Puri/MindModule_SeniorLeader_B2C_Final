interface WeeklyDeltaDialProps {
  currentScore: number | null;
  delta: number | null;
  mode: 'baseline' | 'refined';
  reason?: 'composition_mismatch' | 'not_enough_history' | 'awaiting_signals' | null;
}

/**
 * Numeric week-on-week summary for the MRS card.
 * Replaces the unreliable dial/chart with a simple score + progress panel.
 */
const WeeklyDeltaDial = ({
  currentScore,
  delta,
  mode,
  reason = null,
}: WeeklyDeltaDialProps) => {
  const scoreLabel = typeof currentScore === 'number' ? String(currentScore) : '—';
  const progressLabel =
    delta == null || reason !== null
      ? '—'
      : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)}`;
  const progressTone =
    delta == null || reason !== null
      ? 'text-muted-foreground/70'
      : delta > 1
        ? 'text-[hsl(var(--tier-strong))]'
        : delta < -1
          ? 'text-[hsl(var(--tier-low))]'
          : 'text-foreground/80';
  const statusText =
    delta == null || reason !== null
      ? reason === 'awaiting_signals'
        ? 'Awaiting fresh signals'
        : 'Building your trend'
      : delta > 1
        ? 'Trending up'
        : delta < -1
          ? 'Trending down'
          : 'Holding steady';
  const supportingText =
    delta == null || reason !== null
      ? 'Week over week comparison will appear once enough matching history exists.'
      : `Compared with last week using your ${mode} read.`;

  return (
    <div
      className="rounded-[24px] border border-border/60 bg-[linear-gradient(180deg,hsl(var(--card))_0%,hsl(var(--card)/0.96)_100%)] px-5 py-5 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.35)]"
      aria-label="Weekly readiness summary"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Week over week
          </p>
          <p className="mt-2 text-[18px] font-semibold leading-tight text-foreground">
            {statusText}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {supportingText}
          </p>
        </div>

        <div className="flex min-h-[92px] min-w-[92px] flex-col items-center justify-center rounded-[22px] border border-[hsl(var(--tier-strong)/0.18)] bg-[linear-gradient(180deg,hsl(var(--tier-strong)/0.12)_0%,hsl(var(--sky)/0.10)_100%)] px-4 py-3">
          <span className="text-[34px] font-semibold leading-none text-foreground tabular-nums">
            {scoreLabel}
          </span>
          <span className="mt-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Score
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border/60 pt-4">
        <div className="rounded-[18px] bg-muted/45 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Read
          </p>
          <p className="mt-1 text-[22px] font-semibold text-foreground capitalize tabular-nums">
            {mode}
          </p>
        </div>

        <div className="rounded-[18px] bg-muted/45 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Progress
          </p>
          <p className={`mt-1 text-[22px] font-semibold tabular-nums ${progressTone}`}>
            {progressLabel}
          </p>
        </div>
      </div>
    </div>
  );
};

export default WeeklyDeltaDial;
