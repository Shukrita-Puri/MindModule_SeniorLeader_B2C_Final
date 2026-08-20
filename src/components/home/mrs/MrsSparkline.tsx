import type { MrsHistoryPoint } from '@/hooks/useMrsTrend';

interface MrsSparklineProps {
  history: MrsHistoryPoint[];
  height?: number;
  /**
   * Apple Health style: open circle markers on every measured point and a
   * dotted connector across periods with no data. Off by default so the
   * compact home sparkline keeps its current look.
   */
  showMarkers?: boolean;
}

const MrsSparkline = ({ history, height = 72, showMarkers = false }: MrsSparklineProps) => {
  const width = 320;
  const padX = 10;
  const padY = 12;

  const valid = history.filter((p) => Number.isFinite(p.score));
  if (valid.length === 0) {
    return (
      <div
        className="w-full rounded-md bg-muted/10 flex items-center justify-center text-[11px] text-muted-foreground"
        style={{ height }}
      >
        Building your trend history
      </div>
    );
  }

  const min = Math.max(0, Math.min(...valid.map((p) => p.score)) - 5);
  const max = Math.min(100, Math.max(...valid.map((p) => p.score)) + 5);
  const range = Math.max(1, max - min);

  const denom = Math.max(1, history.length - 1);
  const points = history.map((p, i) => {
    const x = padX + (i / denom) * (width - padX * 2);
    const y = Number.isFinite(p.score)
      ? padY + (1 - (p.score - min) / range) * (height - padY * 2)
      : null;
    return { x, y, score: p.score, date: p.date };
  });

  const measured = points.filter((p) => p.y !== null) as Array<{ x: number; y: number }>;

  // Solid segments between adjacent measured points; dotted connectors when a
  // gap (one or more missing periods) sits between two measured points.
  const solid: string[] = [];
  const dotted: string[] = [];
  let prevIdx = -1;
  points.forEach((pt, i) => {
    if (pt.y === null) return;
    if (prevIdx >= 0) {
      const prev = points[prevIdx];
      const seg = `M${prev.x.toFixed(1)},${prev.y!.toFixed(1)} L${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      if (i - prevIdx === 1) solid.push(seg);
      else dotted.push(seg);
    }
    prevIdx = i;
  });

  const areaPath =
    measured.length > 1
      ? `M${measured[0].x},${measured[0].y} ` +
        measured.map((p) => `L${p.x},${p.y}`).join(' ') +
        ` L${measured[measured.length - 1].x},${height} L${measured[0].x},${height} Z`
      : '';

  const baselineY = height - padY / 2;
  const firstX = measured[0].x;
  const lastX = measured[measured.length - 1].x;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--tier-strong))" stopOpacity="0.18" />
          <stop offset="100%" stopColor="hsl(var(--tier-strong))" stopOpacity="0" />
        </linearGradient>
      </defs>

      {areaPath && <path d={areaPath} fill="url(#spark-fill)" />}

      {/* Missing stretches at either end: dotted baseline instead of blank space */}
      {showMarkers && firstX > padX + 1 && (
        <path
          d={`M${padX},${baselineY} L${firstX},${baselineY}`}
          stroke="hsl(var(--muted-foreground))"
          strokeOpacity={0.3}
          strokeWidth={1.2}
          strokeDasharray="2 4"
          fill="none"
        />
      )}
      {showMarkers && lastX < width - padX - 1 && (
        <path
          d={`M${lastX},${baselineY} L${width - padX},${baselineY}`}
          stroke="hsl(var(--muted-foreground))"
          strokeOpacity={0.3}
          strokeWidth={1.2}
          strokeDasharray="2 4"
          fill="none"
        />
      )}

      {dotted.map((d, i) => (
        <path
          key={`gap-${i}`}
          d={d}
          fill="none"
          stroke="hsl(var(--tier-strong))"
          strokeOpacity={0.45}
          strokeWidth={1.6}
          strokeDasharray="3 4"
          strokeLinecap="round"
        />
      ))}
      {solid.map((d, i) => (
        <path
          key={`seg-${i}`}
          d={d}
          fill="none"
          stroke="hsl(var(--tier-strong))"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {showMarkers
        ? measured.map((p, i) => (
            <circle
              key={`m-${i}`}
              cx={p.x}
              cy={p.y}
              r={3}
              fill="hsl(var(--background))"
              stroke="hsl(var(--tier-strong))"
              strokeWidth={1.6}
            />
          ))
        : measured.length > 0 && (
            <>
              <circle
                cx={measured[measured.length - 1].x}
                cy={measured[measured.length - 1].y}
                r={6}
                fill="hsl(var(--tier-strong) / 0.18)"
              />
              <circle
                cx={measured[measured.length - 1].x}
                cy={measured[measured.length - 1].y}
                r={3}
                fill="hsl(var(--tier-strong))"
              />
            </>
          )}
    </svg>
  );
};

export default MrsSparkline;
