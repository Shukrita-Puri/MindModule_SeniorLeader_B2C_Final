import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import flameSrc from '@/assets/streak-flame.png';

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
  const fontSize = display.length >= 3 ? 11 : display.length === 2 ? 13 : 15;

  return (
    <div
      className={cn(
        'flex flex-col items-center select-none -mt-9',
        isEmpty && 'opacity-40',
        className,
      )}
    >
      <div className={cn('relative', pulse && 'animate-streak-pulse')} style={{ width: 38, height: 44 }}>
        <img
          src={flameSrc}
          alt=""
          aria-hidden="true"
          width={38}
          height={44}
          className="block w-full h-full object-contain"
          style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.15))' }}
          draggable={false}
        />
        <span
          className="absolute inset-0 flex items-center justify-center font-headline font-bold leading-none"
          style={{
            color: '#1a1208',
            fontSize,
            paddingTop: 10, // nudge into flame body, not the tip
            textShadow: '0 1px 0 rgba(255,236,200,0.6)',
          }}
        >
          {display}
        </span>
        {pulse && (
          <span
            className="absolute left-1/2 -translate-x-1/2 -top-1 w-1.5 h-1.5 rounded-full bg-gold animate-ping"
            aria-hidden="true"
          />
        )}
      </div>
      <span className="mt-0.5 text-[8px] tracking-wider uppercase text-gold/70 font-body text-center leading-tight whitespace-nowrap">
        {label}
      </span>
    </div>
  );
};

export default StreakWreath;
