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

// Subtle time-of-day tint — keeps the engraved B&W detail fully legible
// (like the Front page cover) while making each window feel distinct.
// Stacked gradients: top vignette guarantees greeting contrast on
// bright skies; bottom tint differentiates time-of-day mood.
const TOD_OVERLAY: Record<TimeOfDay, string> = {
  morning: [
    'linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0) 28%)',
    'linear-gradient(180deg, rgba(180,120,60,0) 60%, rgba(180,120,60,0.18) 100%)',
  ].join(', '),
  afternoon: [
    'linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0) 28%)',
    'linear-gradient(180deg, rgba(60,80,100,0) 60%, rgba(60,80,100,0.18) 100%)',
  ].join(', '),
  evening: [
    'linear-gradient(180deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0) 28%)',
    'linear-gradient(180deg, rgba(20,25,50,0) 60%, rgba(20,25,50,0.22) 100%)',
  ].join(', '),
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
          opacity: 1,
          filter: 'contrast(1.25) brightness(1)',
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