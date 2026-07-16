import { useEffect, useRef, useState, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface HomeSwipeShellProps {
  pages: { id: string; label: string; node: ReactNode }[];
  initialIndex?: number;
}

const HomeSwipeShell = ({ pages, initialIndex = 0 }: HomeSwipeShellProps) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(initialIndex);
  const { pathname } = useLocation();

  // Always snap to the initial page on mount AND on every /executive-home
  // navigation. The scroller otherwise keeps the prior scrollLeft, which
  // can leave the user on Brief or Plan instead of MRS after navigating away
  // and back.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const el = pageRefs.current[initialIndex];
    if (!scroller || !el) return;
    scroller.scrollTo({ left: el.offsetLeft, behavior: 'auto' });
    setActive(initialIndex);
  }, [pathname, initialIndex]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best) {
          const idx = pageRefs.current.findIndex((n) => n === best.target);
          if (idx >= 0) setActive(idx);
        }
      },
      { root: scroller, threshold: [0.55, 0.75, 0.95] }
    );
    pageRefs.current.forEach((n) => n && observer.observe(n));
    return () => observer.disconnect();
  }, [pages.length]);

  const goTo = (i: number) => {
    const el = pageRefs.current[i];
    if (el && scrollerRef.current) {
      scrollerRef.current.scrollTo({ left: el.offsetLeft, behavior: 'smooth' });
    }
  };

  return (
    <div className="relative w-full">
      <div
        ref={scrollerRef}
        className={cn(
          'flex w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory',
          'scroll-smooth no-scrollbar overscroll-x-contain',
          '[-webkit-overflow-scrolling:touch]'
        )}
        style={{ scrollbarWidth: 'none' }}
      >
        {pages.map((p, i) => (
          <div
            key={p.id}
            ref={(n) => (pageRefs.current[i] = n)}
            className="snap-center shrink-0 w-full"
            aria-label={p.label}
            role="group"
          >
            {p.node}
          </div>
        ))}
      </div>

      <div className="pointer-events-auto fixed right-2 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-2">
        {pages.map((p, i) => (
          <button
            key={p.id}
            type="button"
            data-tour={`tab-${p.id}`}
            onClick={() => goTo(i)}
            aria-label={`Go to ${p.label}`}
            className={cn(
              'rounded-full transition-all duration-300',
              active === i
                ? 'bg-foreground/80 w-1.5 h-6'
                : 'bg-foreground/30 w-1.5 h-1.5 hover:bg-foreground/50'
            )}
          />
        ))}
      </div>
    </div>
  );
};

export default HomeSwipeShell;
