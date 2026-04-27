import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GenerateTodaysPlanLinkProps {
  onClick: () => void;
}

const FIRST_VISIT_KEY = 'generate_plan_link_tapped_v1';

/**
 * iOS-native style tap target with quiet affordance signals:
 *  - Small-caps "Tap to open →" microcopy above the saffron link
 *  - Persistent right-aligned chevron/arrow
 *  - Gentle breathing pulse on the arrow on first visit only
 *    (suppressed via localStorage after the user taps)
 *  - Hover lift + active scale + cursor-pointer for web and mobile
 */
const GenerateTodaysPlanLink = ({ onClick }: GenerateTodaysPlanLinkProps) => {
  const [isPressed, setIsPressed] = useState(false);
  const [hasTappedBefore, setHasTappedBefore] = useState(true);

  useEffect(() => {
    try {
      setHasTappedBefore(localStorage.getItem(FIRST_VISIT_KEY) === '1');
    } catch {
      setHasTappedBefore(false);
    }
  }, []);

  const handleClick = () => {
    try {
      localStorage.setItem(FIRST_VISIT_KEY, '1');
    } catch {
      /* ignore storage errors */
    }
    setHasTappedBefore(true);
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={() => setIsPressed(true)}
      onPointerUp={() => setIsPressed(false)}
      onPointerLeave={() => setIsPressed(false)}
      onPointerCancel={() => setIsPressed(false)}
      aria-label="Generate today's plan"
      className={cn(
        'group inline-flex flex-col items-end gap-0.5',
        'bg-transparent border-0 p-0 m-0 shadow-none appearance-none cursor-pointer',
        'transition-all duration-200 ease-out',
        'hover:-translate-y-0.5 active:scale-[0.99]',
        isPressed ? 'opacity-70' : 'opacity-100',
        'focus:outline-none focus-visible:underline underline-offset-4',
        '[-webkit-tap-highlight-color:transparent] touch-manipulation'
      )}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Quiet microcopy hint — small caps, muted */}
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 font-body">
        Tap to open
      </span>

      {/* Primary saffron link row */}
      <span className="inline-flex items-center gap-1.5 text-sm uppercase tracking-[0.1em] font-body font-semibold text-[hsl(var(--saffron))]">
        GENERATE TODAY'S PLAN
        <ArrowRight
          className={cn(
            'w-4 h-4 text-[hsl(var(--saffron))] transition-transform duration-200 ease-out',
            'group-hover:translate-x-0.5',
            !hasTappedBefore && 'animate-breathe-arrow'
          )}
          strokeWidth={2.25}
        />
      </span>
    </button>
  );
};

export default GenerateTodaysPlanLink;
