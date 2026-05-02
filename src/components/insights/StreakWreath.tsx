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
 * Streak indicator built from the same laurel-wreath SVG paths as
 * MetaSkillsWreath, but rendered in solid gold on a transparent background.
 * Used in the Mind Readiness Trend section to celebrate consecutive
 * positive check-in days within the current calendar month.
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
  const fontSize = display.length >= 3 ? 24 : display.length === 2 ? 30 : 34;

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
        height="56"
        viewBox="0 0 140 120"
        className={cn(pulse && 'animate-streak-pulse')}
        style={{ overflow: 'visible' }}
      >
        {/* Left laurel branch */}
        <path
          d="M 30 90 Q 25 85, 20 80 Q 18 70, 20 60 Q 22 50, 25 40 Q 28 30, 32 20"
          fill="none"
          stroke="hsl(var(--gold))"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {[20, 30, 40, 50, 60, 70, 80].map((y, i) => (
          <ellipse
            key={`l-${i}`}
            cx={30 - (90 - y) * 0.08}
            cy={y}
            rx="6"
            ry="10"
            fill="hsl(var(--gold))"
            opacity="0.92"
            transform={`rotate(${-35 + i * 2} ${30 - (90 - y) * 0.08} ${y})`}
          />
        ))}
        {/* Right laurel branch */}
        <path
          d="M 110 90 Q 115 85, 120 80 Q 122 70, 120 60 Q 118 50, 115 40 Q 112 30, 108 20"
          fill="none"
          stroke="hsl(var(--gold))"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {[20, 30, 40, 50, 60, 70, 80].map((y, i) => (
          <ellipse
            key={`r-${i}`}
            cx={110 + (90 - y) * 0.08}
            cy={y}
            rx="6"
            ry="10"
            fill="hsl(var(--gold))"
            opacity="0.92"
            transform={`rotate(${35 - i * 2} ${110 + (90 - y) * 0.08} ${y})`}
          />
        ))}
        {/* Bow */}
        <path
          d="M 55 95 Q 60 92, 65 90 Q 70 88, 75 90 Q 80 92, 85 95"
          fill="none"
          stroke="hsl(var(--gold))"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M 55 95 Q 50 100, 45 105 M 85 95 Q 90 100, 95 105"
          fill="none"
          stroke="hsl(var(--gold))"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Milestone sparkle */}
        {pulse && (
          <circle cx="70" cy="14" r="2.5" fill="hsl(var(--gold))" className="animate-ping" />
        )}
        {/* Number */}
        <text
          x="70"
          y="62"
          textAnchor="middle"
          className="font-headline font-bold"
          fontSize={fontSize}
          fill="hsl(var(--gold))"
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