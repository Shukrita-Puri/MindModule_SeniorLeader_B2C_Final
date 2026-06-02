import { cn } from '@/lib/utils';

interface MrsGaugeProps {
  score: number | null;
  tier?: string | null;
  size?: number;
}

function tierColorVar(tier: string | null | undefined): string {
  switch (tier) {
    case 'optimal':
    case 'strong':
      return 'hsl(var(--tier-strong))';
    case 'moderate':
    case 'manageable':
      return 'hsl(var(--tier-moderate))';
    case 'low':
    case 'depleted':
      return 'hsl(var(--tier-low))';
    default:
      return 'hsl(var(--tier-neutral))';
  }
}

const MrsGauge = ({ score, tier, size = 220 }: MrsGaugeProps) => {
  const radius = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100;
  const dash = circumference * pct;
  const color = tierColorVar(tier);
  const hasScore = typeof score === 'number';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="drop-shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
      >
        <defs>
          <radialGradient id="mrs-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="70%" stopColor={color} stopOpacity="0.04" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="mrs-arc" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.95" />
            <stop offset="100%" stopColor={color} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {/* soft halo */}
        <circle cx={cx} cy={cy} r={radius + 8} fill="url(#mrs-glow)" />
        {/* track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted-foreground) / 0.18)"
          strokeWidth={6}
        />
        {/* progress arc */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="url(#mrs-arc)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 700ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
        {/* inner soft fill */}
        <circle cx={cx} cy={cy} r={radius - 18} fill="hsl(var(--background) / 0.55)" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className={cn(
            'font-light tabular-nums tracking-tight text-foreground',
            'leading-none'
          )}
          style={{ fontSize: size * 0.34 }}
        >
          {hasScore ? Math.round(score!) : '—'}
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          out of 100
        </div>
      </div>
    </div>
  );
};

export default MrsGauge;