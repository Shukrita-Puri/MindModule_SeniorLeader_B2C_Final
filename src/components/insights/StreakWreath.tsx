import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface StreakWreathProps {
  count: number;
  label: string;
  /** Pass a milestone number (3|7|14|21|30) to play a one-shot pulse. */
  milestone?: 3 | 7 | 14 | 21 | 30 | null;
  className?: string;
}

/**
 * Engraved coloured-flame streak icon for the Mind Readiness Trend section.
 * 19th-century scientific-engraving aesthetic: thin gold outline, hatched
 * interior, warm amber gradient body, with the streak number rendered
 * inside the inner core.
 */
const StreakWreath = ({ count, label, milestone, className }: StreakWreathProps) => {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!milestone) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 1300);
    return () => clearTimeout(t);
  }, [milestone]);

  const isEmpty = count <= 0;
  const display = isEmpty ? '—' : String(count);
  const fontSize = display.length >= 3 ? 22 : display.length === 2 ? 28 : 34;

  // Unique gradient ids per render so multiple flames on a page don't collide
  const gradId = `flame-body-${label.replace(/\s+/g, '-')}`;
  const coreId = `flame-core-${label.replace(/\s+/g, '-')}`;

  return (
    <div
      className={cn(
        'flex flex-col items-center select-none',
        isEmpty && 'opacity-40',
        className,
      )}
    >
      <svg
        width="64"
        height="72"
        viewBox="0 0 100 120"
        className={cn(pulse && 'animate-streak-pulse')}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={gradId} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#f4c14a" />
            <stop offset="55%" stopColor="#e8a23a" />
            <stop offset="100%" stopColor="#c9651f" />
          </linearGradient>
          <radialGradient id={coreId} cx="50%" cy="60%" r="55%">
            <stop offset="0%" stopColor="#fff4dc" />
            <stop offset="100%" stopColor="#f6dca0" />
          </radialGradient>
        </defs>

        {/* Outer flame silhouette — classic teardrop with a curling tip */}
        <path
          d="M 50 8
             C 58 22, 76 34, 80 56
             C 84 82, 68 108, 50 110
             C 32 108, 16 82, 20 56
             C 24 34, 42 22, 50 8 Z"
          fill={`url(#${gradId})`}
          stroke="hsl(var(--gold))"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />

        {/* Engraving hatch lines (thin, sparse — engraved-pencil feel) */}
        <g stroke="hsl(var(--gold))" strokeWidth="0.6" opacity="0.55" fill="none" strokeLinecap="round">
          <path d="M 30 50 Q 34 62, 30 78" />
          <path d="M 36 42 Q 40 58, 36 84" />
          <path d="M 70 50 Q 66 62, 70 78" />
          <path d="M 64 42 Q 60 58, 64 84" />
          <path d="M 50 18 Q 52 26, 50 32" />
        </g>

        {/* Inner cream core — holds the number */}
        <ellipse
          cx="50"
          cy="72"
          rx="20"
          ry="24"
          fill={`url(#${coreId})`}
          stroke="hsl(var(--gold))"
          strokeWidth="0.9"
          opacity="0.95"
        />

        {/* Saffron tip wisp */}
        <path
          d="M 50 8 Q 53 4, 51 0"
          fill="none"
          stroke="#c9651f"
          strokeWidth="1.25"
          strokeLinecap="round"
        />

        {/* Milestone ember sparkle */}
        {pulse && (
          <circle cx="50" cy="-4" r="2.5" fill="#e8a23a" className="animate-ping" />
        )}

        {/* Streak number */}
        <text
          x="50"
          y="72"
          textAnchor="middle"
          dominantBaseline="central"
          className="font-headline font-bold"
          fontSize={fontSize}
          fill="hsl(var(--foreground))"
        >
          {display}
        </text>
      </svg>
      <span className="mt-0.5 text-[9px] tracking-widest uppercase text-gold/80 font-body text-center max-w-[88px] leading-tight">
        {label}
      </span>
    </div>
  );
};

export default StreakWreath;
