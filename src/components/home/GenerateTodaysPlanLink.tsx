import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GenerateTodaysPlanLinkProps {
  onClick: () => void;
}

/**
 * Plain-text iOS-native tap target.
 * No background, no shadow, no glow — just saffron text.
 * Re-bounces gently every ~6s of inactivity to reinforce affordance,
 * and gives haptic-style scale-down on press.
 */
const GenerateTodaysPlanLink = ({ onClick }: GenerateTodaysPlanLinkProps) => {
  const [bounceKey, setBounceKey] = useState(0);
  const [isPressed, setIsPressed] = useState(false);
  const idleTimerRef = useRef<number | null>(null);

  const scheduleNextBounce = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      setBounceKey((k) => k + 1);
      scheduleNextBounce();
    }, 6500);
  }, []);

  useEffect(() => {
    scheduleNextBounce();
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [scheduleNextBounce]);

  // Reset idle timer on any user interaction so the bounce only fires when truly idle.
  useEffect(() => {
    const reset = () => scheduleNextBounce();
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'pointermove', 'scroll', 'keydown'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, reset));
  }, [scheduleNextBounce]);

  return (
    <button
      key={bounceKey}
      type="button"
      onClick={onClick}
      onPointerDown={() => setIsPressed(true)}
      onPointerUp={() => setIsPressed(false)}
      onPointerLeave={() => setIsPressed(false)}
      onPointerCancel={() => setIsPressed(false)}
      className={cn(
        'group inline-flex items-center gap-1.5 text-sm uppercase tracking-[0.1em] font-body font-semibold text-[hsl(var(--saffron))]',
        'bg-transparent border-0 p-0 m-0 shadow-none appearance-none',
        'animate-text-bounce',
        'transition-[opacity,transform] duration-150 ease-out',
        isPressed ? 'opacity-60 scale-[0.97]' : 'opacity-100 scale-100',
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
