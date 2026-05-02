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
  const fontSize = display.length >= 3 ? 24 : display.length === 2 ? 30 : 36;

  // Unique ids per render so multiple flames on a page don't collide
  const uid = label.replace(/\s+/g, '-');
  const gradId = `flame-body-${uid}`;
  const coreId = `flame-core-${uid}`;
  const hatchId = `flame-hatch-${uid}`;
  const clipId = `flame-clip-${uid}`;

  return (
    <div
      className={cn(
        'flex flex-col items-center select-none',
        isEmpty && 'opacity-40',
        className,
      )}
    >
      <svg
        width="40"
        height="48"
        viewBox="0 0 100 120"
        className={cn(pulse && 'animate-streak-pulse')}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={gradId} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#f6c95a" />
            <stop offset="55%" stopColor="#e29630" />
            <stop offset="100%" stopColor="#a44a17" />
          </linearGradient>
          <radialGradient id={coreId} cx="50%" cy="60%" r="55%">
            <stop offset="0%" stopColor="#fff4dc" />
            <stop offset="100%" stopColor="#f4d28e" />
          </radialGradient>
          {/* Cross-hatch pattern for an engraved-pencil feel */}
          <pattern id={hatchId} patternUnits="userSpaceOnUse" width="3.2" height="3.2" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="3.2" stroke="#5a2a0c" strokeWidth="0.45" strokeOpacity="0.55" strokeLinecap="round" />
          </pattern>
          <clipPath id={clipId}>
            <path d="M 50 6
              C 60 22, 78 34, 82 58
              C 86 84, 68 110, 50 112
              C 32 110, 14 84, 18 58
              C 22 34, 40 22, 50 6 Z" />
          </clipPath>
        </defs>

        {/* Body fill */}
        <path
          d="M 50 6
             C 60 22, 78 34, 82 58
             C 86 84, 68 110, 50 112
             C 32 110, 14 84, 18 58
             C 22 34, 40 22, 50 6 Z"
          fill={`url(#${gradId})`}
        />
        {/* Engraved cross-hatch (clipped to flame) */}
        <rect x="0" y="0" width="100" height="120" fill={`url(#${hatchId})`} clipPath={`url(#${clipId})`} opacity="0.85" />
        {/* Curving contour hatch lines for woodcut feel */}
        <g stroke="#4a1f08" strokeWidth="0.55" opacity="0.55" fill="none" strokeLinecap="round" clipPath={`url(#${clipId})`}>
          <path d="M 28 46 Q 32 64, 28 86" />
          <path d="M 34 36 Q 38 60, 34 92" />
          <path d="M 72 46 Q 68 64, 72 86" />
          <path d="M 66 36 Q 62 60, 66 92" />
          <path d="M 50 16 Q 52 28, 50 36" />
          <path d="M 44 24 Q 46 40, 44 52" />
          <path d="M 56 24 Q 54 40, 56 52" />
        </g>
        {/* Outline */}
        <path
          d="M 50 6
             C 60 22, 78 34, 82 58
             C 86 84, 68 110, 50 112
             C 32 110, 14 84, 18 58
             C 22 34, 40 22, 50 6 Z"
          fill="none"
          stroke="#3a1606"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />

        {/* Inner cream core — holds the number */}
        <ellipse
          cx="50"
          cy="72"
          rx="22"
          ry="26"
          fill={`url(#${coreId})`}
          stroke="#3a1606"
          strokeWidth="1"
        />

        {/* Saffron tip wisp */}
        <path
          d="M 50 6 Q 54 0, 50 -8"
          fill="none"
          stroke="#a44a17"
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        {pulse && (
          <circle cx="50" cy="-12" r="2.5" fill="#e8a23a" className="animate-ping" />
        )}

        <text
          x="50"
          y="72"
          textAnchor="middle"
          dominantBaseline="central"
          className="font-headline font-bold"
          fontSize={fontSize}
          fill="#2a1004"
        >
          {display}
        </text>
      </svg>
      <span className="mt-0.5 text-[8px] tracking-wider uppercase text-gold/70 font-body text-center max-w-[64px] leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
        {label}
      </span>
    </div>
  );
};

export default StreakWreath;
