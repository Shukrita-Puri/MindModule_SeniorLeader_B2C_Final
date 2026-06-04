import { useMemo } from 'react';

type TimeOfDay = 'morning' | 'afternoon' | 'evening';

const getTimeOfDay = (): TimeOfDay => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
};

const HERO_IMAGES = {
  morning: '/all-visuals/images/hero-morning.jpg',
  afternoon: '/all-visuals/images/hero-afternoon.jpg',
  evening: '/all-visuals/images/hero-evening.jpg',
} as const;

// Time-of-day mood overlays — make morning/afternoon/evening visibly distinct
// while keeping the deep B&W engraved aesthetic of the Front page art band.
const TOD_OVERLAY: Record<TimeOfDay, string> = {
  morning:
    'linear-gradient(180deg, rgba(70,55,40,0.25) 0%, rgba(20,15,10,0.55) 100%)',
  afternoon:
    'linear-gradient(180deg, rgba(30,40,55,0.30) 0%, rgba(15,20,30,0.55) 100%)',
  evening:
    'linear-gradient(180deg, rgba(15,12,20,0.45) 0%, rgba(8,6,12,0.75) 100%)',
};

interface TodayHeroProps {
  /** Tailwind height class for the hero band. */
  heightClass?: string;
}

/**
 * Shared hero visual used across the Today flow (Assessment / Brief / Plan).
 * Static dark-charcoal B&W landscape — one image per time-of-day window.
 * No tier or divergence branching; no motion. Bottom dissolves seamlessly
 * into the taupe page canvas (hsl(var(--canvas-hi))).
 */
const TodayHero = ({ heightClass = 'h-[280px] md:h-[340px]' }: TodayHeroProps) => {
  const tod = useMemo(() => getTimeOfDay(), []);
  const heroImageUrl = HERO_IMAGES[tod];
  const overlay = TOD_OVERLAY[tod];

  return (
    <div className={`relative ${heightClass} w-full overflow-hidden pointer-events-none`}>
      <img
        src={heroImageUrl}
        alt=""
        className="w-full h-full object-cover"
        style={{
          opacity: 0.95,
          filter: 'grayscale(1) contrast(1.15) brightness(0.85)',
        }}
      />
      {/* Time-of-day mood wash */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: overlay }}
      />
      {/* Seamless fade into the taupe page canvas */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{
          height: '55%',
          background:
            'linear-gradient(to top, hsl(var(--canvas-hi)) 0%, hsl(var(--canvas-hi) / 0.85) 30%, hsl(var(--canvas-hi) / 0) 100%)',
        }}
      />
    </div>
  );
};

export default TodayHero;