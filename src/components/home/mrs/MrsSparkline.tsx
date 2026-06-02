import type { MrsHistoryPoint } from '@/hooks/useMrsTrend';

interface MrsSparklineProps {
  history: MrsHistoryPoint[];
  height?: number;
}

const MrsSparkline = ({ history, height = 72 }: MrsSparklineProps) => {
  const width = 320;
  const padX = 8;
  const padY = 10;

  const valid = history.filter((p) => Number.isFinite(p.score));
  if (valid.length < 2) {
    return (
      <div
        className="w-full rounded-md border border-dashed border-muted-foreground/20 bg-muted/10 flex items-center justify-center text-[11px] text-muted-foreground"
        style={{ height }}
      >
        Building your trend history
      </div>
    );
  }

  const min = Math.max(0, Math.min(...valid.map((p) => p.score)) - 5);
  const max = Math.min(100, Math.max(...valid.map((p) => p.score)) + 5);
  const range = Math.max(1, max - min);

  const points = history.map((p, i) => {
    const x = padX + (i / (history.length - 1)) * (width - padX * 2);
    const y = Number.isFinite(p.score)
      ? padY + (1 - (p.score - min) / range) * (height - padY * 2)
      : null;
    return { x, y, score: p.score, date: p.date };
  });

  // path skipping NaN gaps
  let d = '';
  let pen: 'up' | 'down' = 'up';
  for (const pt of points) {
    if (pt.y === null) {
      pen = 'up';
      continue;
    }
    d += `${pen === 'up' ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)} `;
    pen = 'down';
  }

  const last = [...points].reverse().find((p) => p.y !== null);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--tier-strong))" stopOpacity="0.22" />
          <stop offset="100%" stopColor="hsl(var(--tier-strong))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* area fill */}
      {d && last && (
        <path
          d={`${d}L${last.x},${height} L${padX},${height} Z`}
          fill="url(#spark-fill)"
        />
      )}
      <path
        d={d}
        fill="none"
        stroke="hsl(var(--tier-strong))"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && (
        <>
          <circle cx={last.x} cy={last.y!} r={6} fill="hsl(var(--tier-strong) / 0.18)" />
          <circle cx={last.x} cy={last.y!} r={3} fill="hsl(var(--tier-strong))" />
        </>
      )}
    </svg>
  );
};

export default MrsSparkline;