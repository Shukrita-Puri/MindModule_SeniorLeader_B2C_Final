interface WeeklyDeltaDialProps {
  delta: number | null;
  mode: 'baseline' | 'refined';
  reason?: 'composition_mismatch' | 'not_enough_history' | 'awaiting_signals' | null;
}

/**
 * Premium glass half-dial showing week-on-week MRS delta.
 * - Arc fills proportional to |delta| (capped at 20 pts → full arc).
 * - Center label: signed pts.
 * - Color encodes direction (green up / red down / neutral flat).
 */
const WeeklyDeltaDial = ({ delta, mode, reason = null }: WeeklyDeltaDialProps) => {
  // SVG geometry
  const W = 320;
  const H = 200;
  const CX = W / 2;
  const CY = 150;
  const R = 120;
  const STROKE = 18;

  // Direction → color
  let colorVar = 'hsl(var(--tier-neutral))';
  if (delta !== null) {
    if (delta > 1) colorVar = 'hsl(var(--tier-strong))';
    else if (delta < -1) colorVar = 'hsl(var(--tier-low))';
  }

  // Top half of circle: π (left) → 2π (right). Midpoint = 1.5π (top).
  const A_LEFT = Math.PI;
  const A_RIGHT = 2 * Math.PI;
  const A_MID = 1.5 * Math.PI;
  // Small angular gap around the top so left/right halves are visually separate
  const GAP = 0.09; // ~5°
  const A_MID_L = A_MID - GAP;
  const A_MID_R = A_MID + GAP;

  const toXY = (a: number) => [CX + R * Math.cos(a), CY + R * Math.sin(a)];
  const arcPath = (a1: number, a2: number) => {
    const [x1, y1] = toXY(a1);
    const [x2, y2] = toXY(a2);
    const large = Math.abs(a2 - a1) > Math.PI ? 1 : 0;
    const sweep = a2 > a1 ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} ${sweep} ${x2} ${y2}`;
  };

  // Fill: from MID toward LEFT (negative) or toward RIGHT (positive)
  const magNorm = delta === null ? 0 : Math.min(1, Math.abs(delta) / 20);
  const halfSweep = (A_RIGHT - A_LEFT) / 2; // π/2
  let fillStart = A_MID;
  let fillEnd = A_MID;
  if (delta !== null && delta > 1) {
    fillEnd = A_MID + halfSweep * magNorm;
  } else if (delta !== null && delta < -1) {
    fillStart = A_MID - halfSweep * magNorm;
  }
  const showFill = delta !== null && magNorm > 0;

  // Badge position: tip of the fill (or top center if neutral/null)
  let badgeAngle = A_MID;
  if (delta !== null && delta > 1) badgeAngle = fillEnd;
  else if (delta !== null && delta < -1) badgeAngle = fillStart;
  const [bx, by] = toXY(badgeAngle);

  const sign = delta === null ? '' : delta > 0 ? '+' : delta < 0 ? '−' : '';
  const magnitude = delta === null ? '—' : Math.abs(delta).toString();
  const suppressedLabel =
    reason === 'composition_mismatch'
      ? 'not enough to compare yet'
      : reason === 'awaiting_signals'
        ? 'awaiting fresh signals'
        : 'not enough to compare yet';

  // Curved label path (slightly below the arc, same center)
  const LR = R + 22;
  const labelPathD = `M ${CX - LR} ${CY} A ${LR} ${LR} 0 0 0 ${CX + LR} ${CY}`;

  return (
    <div className="w-full" aria-label="Weekly readiness change">
      <div className="flex items-baseline justify-between mb-2 px-1">
        <span className="text-eyebrow text-muted-foreground">Week over week</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          {mode}
        </span>
      </div>

      <div className="flex flex-col items-center">
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          className="max-w-[320px] overflow-visible"
          aria-hidden
        >
          <defs>
            {/* Glass track gradient */}
            <linearGradient id="weekly-track" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="hsl(0 0% 100%)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="hsl(0 0% 100%)" stopOpacity="0.05" />
            </linearGradient>
            {/* Color fill gradient */}
            <linearGradient id="weekly-fill" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={colorVar} stopOpacity="0.55" />
              <stop offset="100%" stopColor={colorVar} stopOpacity="0.95" />
            </linearGradient>
            {/* Soft inner shadow filter for glass effect */}
            <filter id="weekly-inner" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
              <feOffset in="blur" dy="1" result="off" />
              <feComposite in="off" in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="inner" />
              <feColorMatrix in="inner" type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0" />
            </filter>
          {/* Curved label path (for LOWER / HIGHER) */}
          <path id="weekly-label-arc" d={labelPathD} fill="none" />
          </defs>

          {/* Track — split into two halves with a gap at the top center */}
          {[
            [A_LEFT, A_MID_L],
            [A_MID_R, A_RIGHT],
          ].map(([a1, a2], i) => (
            <g key={i}>
              <path
                d={arcPath(a1, a2)}
                fill="none"
                stroke="url(#weekly-track)"
                strokeWidth={STROKE}
                strokeLinecap="round"
              />
              <path
                d={arcPath(a1, a2)}
                fill="none"
                stroke="hsl(0 0% 100% / 0.55)"
                strokeWidth={1}
              />
              <path
                d={arcPath(a1, a2)}
                fill="none"
                stroke="hsl(var(--foreground) / 0.06)"
                strokeWidth={STROKE}
                strokeLinecap="round"
                filter="url(#weekly-inner)"
              />
            </g>
          ))}

          {/* CURRENT label — top center, above the dial gap */}
          <text
            x={CX}
            y={CY - R - 10}
            textAnchor="middle"
            fontSize="9"
            letterSpacing="2"
            fontWeight={600}
            fill="hsl(var(--muted-foreground) / 0.9)"
          >
            CURRENT
          </text>

          {/* Colored fill */}
          {showFill && (
            <path
              d={arcPath(fillStart, fillEnd)}
              fill="none"
              stroke="url(#weekly-fill)"
              strokeWidth={STROKE}
              strokeLinecap="round"
              style={{ transition: 'd 600ms cubic-bezier(0.22, 1, 0.36, 1)' }}
            />
          )}

          <text
            fontSize="9"
            letterSpacing="2"
            fill="hsl(var(--muted-foreground) / 0.85)"
            fontWeight={600}
          >
            <textPath href="#weekly-label-arc" startOffset="6%">LOWER</textPath>
          </text>
          <text
            fontSize="9"
            letterSpacing="2"
            fill="hsl(var(--muted-foreground) / 0.85)"
            fontWeight={600}
          >
            <textPath href="#weekly-label-arc" startOffset="86%">HIGHER</textPath>
          </text>

          {/* Floating glass badge at fill tip */}
          <g style={{ transition: 'transform 600ms cubic-bezier(0.22,1,0.36,1)' }}>
            <circle
              cx={bx}
              cy={by}
              r={26}
              fill="hsl(0 0% 100% / 0.85)"
              stroke="hsl(0 0% 100% / 0.7)"
              strokeWidth={1}
              style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.12))' }}
            />
            <circle
              cx={bx}
              cy={by - 6}
              r={22}
              fill="hsl(0 0% 100% / 0.35)"
            />
            <text
              x={bx}
              y={by + 2}
              textAnchor="middle"
              fontSize="20"
              fontWeight={500}
              className="tabular-nums"
              fill={colorVar}
            >
              {sign}
              {magnitude}
            </text>
            <text
              x={bx}
              y={by + 14}
              textAnchor="middle"
              fontSize="7"
              letterSpacing="1.5"
              fill="hsl(var(--muted-foreground))"
              fontWeight={600}
            >
              PTS
            </text>
          </g>
        </svg>

        <p className="mt-2 text-[11px] text-muted-foreground/85">
          {delta === null ? suppressedLabel : `vs last week · ${mode}`}
        </p>
      </div>
    </div>
  );
};

export default WeeklyDeltaDial;
