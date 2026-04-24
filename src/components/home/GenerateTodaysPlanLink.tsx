import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GenerateTodaysPlanLinkProps {
  onClick: () => void;
}

/**
 * Plain-text iOS-native tap target.
 * Static by default. On press, dims briefly — matching iOS native link feedback.
 */
const GenerateTodaysPlanLink = ({ onClick }: GenerateTodaysPlanLinkProps) => {
  const [isPressed, setIsPressed] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={() => setIsPressed(true)}
      onPointerUp={() => setIsPressed(false)}
      onPointerLeave={() => setIsPressed(false)}
      onPointerCancel={() => setIsPressed(false)}
      className={cn(
        'group inline-flex items-center gap-1.5 text-sm uppercase tracking-[0.1em] font-body font-semibold text-[hsl(var(--saffron))]',
        'bg-transparent border-0 p-0 m-0 shadow-none appearance-none',
        'transition-opacity duration-150 ease-out',
        isPressed ? 'opacity-60' : 'opacity-100',
        'focus:outline-none focus-visible:underline underline-offset-4',
        '[-webkit-tap-highlight-color:transparent] touch-manipulation'
      )}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      GENERATE TODAY'S PLAN
      <ArrowRight
        className="w-4 h-4 text-[hsl(var(--saffron))]"
        strokeWidth={2.25}
      />
    </button>
  );
};

export default GenerateTodaysPlanLink;
