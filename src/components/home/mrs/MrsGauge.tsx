import { cn } from '@/lib/utils';

interface MrsGaugeProps {
  score: number | null;
  tier?: string | null;
  size?: number;
}

export function tierColorVar(tier: string | null | undefined): string {
  const t = (tier || '').toLowerCase();
  switch (t) {
    case 'peak':
    case 'optimal':
    case 'strong':
      return 'hsl(var(--tier-strong))';
    case 'mixed':
    case 'moderate':
    case 'manageable':
    case 'managing':
      return 'hsl(var(--tier-moderate))';
    case 'compromised':
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
      >
        <defs>
          <radialGradient id="mrs-glow" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor={color} stopOpacity="0.30" />
            <stop offset="65%" stopColor={color} stopOpacity="0.08" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="mrs-arc" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.95" />
            <stop offset="100%" stopColor={color} stopOpacity="0.45" />
          </linearGradient>
          {/* Orb body: subtle sphere with highlight */}
          <radialGradient id="mrs-orb" cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="hsl(0 0% 100%)" stopOpacity="0.9" />
            <stop offset="60%" stopColor="hsl(0 0% 100%)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="hsl(0 0% 100%)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* soft outer halo */}
        <circle cx={cx} cy={cy} r={radius + 14} fill="url(#mrs-glow)" />
        {/* orb sphere body */}
        <circle cx={cx} cy={cy} r={radius - 4} fill="url(#mrs-orb)" />
        {/* track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted-foreground) / 0.14)"
          strokeWidth={4}
        />
        {/* progress arc */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="url(#mrs-arc)"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 700ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
        {/* specular highlight */}
        <ellipse
          cx={cx - radius * 0.32}
          cy={cy - radius * 0.42}
          rx={radius * 0.34}
          ry={radius * 0.18}
          fill="hsl(0 0% 100%)"
          opacity="0.28"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className={cn(
            'font-extralight tabular-nums tracking-tight text-foreground',
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