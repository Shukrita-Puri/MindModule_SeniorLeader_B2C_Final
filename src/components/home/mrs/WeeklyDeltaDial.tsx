import { cn } from '@/lib/utils';

interface WeeklyDeltaDialProps {
  delta: number | null;
  mode: 'baseline' | 'refined';
}

/**
 * Premium glass half-dial showing week-on-week MRS delta.
 * - Arc fills proportional to |delta| (capped at 20 pts → full arc).
 * - Center label: signed pts.
 * - Color encodes direction (green up / red down / neutral flat).
 */
const WeeklyDeltaDial = ({ delta, mode }: WeeklyDeltaDialProps) => {
  const W = 260;
  const H = 150;
  const CX = W / 2;
  const CY = H - 18;
  const R = 100;
  const STROKE = 14;

  // Direction → color token
  let colorVar = 'hsl(var(--tier-neutral))';
  if (delta !== null) {
    if (delta > 1) colorVar = 'hsl(var(--tier-strong))';
    else if (delta < -1) colorVar = 'hsl(var(--tier-low))';
  }

  // Arc geometry: 180° from π → 2π
  const start = Math.PI;
  const end = 2 * Math.PI;
  const sweep = end - start;
  const fill = delta === null ? 0 : Math.min(1, Math.abs(delta) / 20);
  const fillEnd = start + sweep * fill;

  const toXY = (a: number) => [CX + R * Math.cos(a), CY + R * Math.sin(a)];
  const arcPath = (a1: number, a2: number) => {
    const [x1, y1] = toXY(a1);
    const [x2, y2] = toXY(a2);
    const large = a2 - a1 > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
  };

  const sign = delta === null ? '' : delta > 0 ? '+' : delta < 0 ? '−' : '';
  const magnitude = delta === null ? '—' : Math.abs(delta).toString();

  return (
    <div
      className={cn(
        'w-full rounded-2xl border border-border/60',
        'bg-white/55 backdrop-blur-[24px] backdrop-saturate-150',
        'shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.85)]',
        'px-4 pt-3 pb-4'
      )}
      aria-label="Weekly readiness change"
    >
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-eyebrow text-muted-foreground">
          Week over week
        </span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          {mode}
        </span>
      </div>
      <div className="flex flex-col items-center">
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
          <defs>
            <linearGradient id="weekly-arc" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={colorVar} stopOpacity="0.45" />
              <stop offset="100%" stopColor={colorVar} stopOpacity="0.95" />
            </linearGradient>
            <radialGradient id="weekly-glass" cx="50%" cy="100%" r="80%">
              <stop offset="0%" stopColor="hsl(0 0% 100%)" stopOpacity="0.6" />
              <stop offset="60%" stopColor={colorVar} stopOpacity="0.08" />
              <stop offset="100%" stopColor={colorVar} stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* glass halo behind arc */}
          <path d={arcPath(start, end)} fill="url(#weekly-glass)" opacity="0.7" />
          {/* track */}
          <path
            d={arcPath(start, end)}
            fill="none"
            stroke="hsl(var(--muted-foreground) / 0.18)"
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          {/* filled arc */}
          {delta !== null && fill > 0 && (
            <path
              d={arcPath(start, fillEnd)}
              fill="none"
              stroke="url(#weekly-arc)"
              strokeWidth={STROKE}
              strokeLinecap="round"
              style={{ transition: 'd 600ms cubic-bezier(0.22, 1, 0.36, 1)' }}
            />
          )}
          {/* center value */}
          <text
            x={CX}
            y={CY - 24}
            textAnchor="middle"
            fontSize="40"
            fontWeight={300}
            className="tabular-nums"
            fill={colorVar}
          >
            {sign}
            {magnitude}
          </text>
          <text
            x={CX}
            y={CY - 4}
            textAnchor="middle"
            fontSize="11"
            letterSpacing="2"
            fill="hsl(var(--muted-foreground))"
          >
            PTS
          </text>
        </svg>
        <p className="mt-1 text-[11px] text-muted-foreground/85">
          {delta === null
            ? 'Building your weekly trend'
            : `vs last week · ${mode}`}
        </p>
      </div>
    </div>
  );
};

export default WeeklyDeltaDial;