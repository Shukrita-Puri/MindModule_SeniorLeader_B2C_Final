import { useMemo } from 'react';

const getTimeOfDay = (): 'morning' | 'afternoon' | 'evening' => {
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


interface TodayHeroProps {
  /** Tailwind height class for the hero band. */
  heightClass?: string;
}

/**
 * Shared hero visual used across the Today flow (Assessment / Brief / Plan).
 * Static dark-charcoal B&W landscape — one image per time-of-day window.
 * No tier or divergence branching; no motion.
 */
const TodayHero = ({ heightClass = 'h-[110px] md:h-[140px]' }: TodayHeroProps) => {
  const heroImageUrl = useMemo(() => HERO_IMAGES[getTimeOfDay()], []);

  return (
    <div className={`relative ${heightClass} w-full overflow-hidden pointer-events-none`}>
      <div className="absolute inset-0 bg-gradient-to-b from-stone-800/40 via-stone-700/25 to-background" />
      <img
        src={heroImageUrl}
        alt=""
        className="w-full h-full object-cover"
        style={{ opacity: 0.5 }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/5 via-background/30 to-background pointer-events-none" />
    </div>
  );
};

export default TodayHero;