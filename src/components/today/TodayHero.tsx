import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useOuterReadiness } from '@/hooks/useOuterReadiness';

const TIER_GRADIENTS: Record<string, string> = {
  depleted: 'from-blue-900/50 via-slate-800/35 to-background',
  managing: 'from-amber-900/45 via-stone-800/30 to-background',
  strong: 'from-emerald-900/45 via-teal-800/30 to-background',
  peak: 'from-violet-900/45 via-purple-800/30 to-background',
  default: 'from-stone-800/40 via-stone-700/25 to-background',
};

const getTimeOfDay = (): 'morning' | 'afternoon' | 'evening' => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
};

interface TodayHeroProps {
  /** Tailwind height class for the hero band. Default 140px. */
  heightClass?: string;
}

/**
 * Shared hero visual used across the Today flow (Assessment / Brief / Plan).
 * Pure presentational — reads from the outer-readiness React Query cache so
 * pages other than /executive-home reuse the same payload without extra
 * network calls.
 */
const TodayHero = ({ heightClass = 'h-[140px]' }: TodayHeroProps) => {
  const { data: outerBrief } = useOuterReadiness();
  const heroEnergyTier = outerBrief?.innerReadinessTier || 'default';
  const heroDivergenceMode = outerBrief?.divergenceMode || null;

  const heroVideoUrl = useMemo(() => {
    const timeOfDay = getTimeOfDay();
    const tier = heroEnergyTier;
    const videoMap: Record<string, Record<string, string>> = {
      depleted: {
        morning: '/all-visuals/videos/depleted-morning.mp4',
        afternoon: '/all-visuals/videos/depleted-afternoon.mp4',
        evening: '/all-visuals/videos/depleted-evening.mp4',
      },
      managing: {
        morning: '/all-visuals/videos/managing-morning.mp4',
        afternoon: '/all-visuals/videos/managing-afternoon.mp4',
        evening: '/all-visuals/videos/managing-evening.mp4',
      },
      strong: {
        morning: '/all-visuals/videos/strong-morning.mp4',
        afternoon: '/all-visuals/videos/strong-afternoon.mp4',
        evening: '/all-visuals/videos/strong-evening.mp4',
      },
      peak: {
        morning: '/all-visuals/videos/peak-morning.mp4',
        afternoon: '/all-visuals/videos/peak-afternoon.mp4',
        evening: '/all-visuals/videos/peak-evening.mp4',
      },
      default: {
        morning: '/all-visuals/videos/strong-morning.mp4',
        afternoon: '/all-visuals/videos/strong-afternoon.mp4',
        evening: '/all-visuals/videos/strong-evening.mp4',
      },
    };
    const divergenceMode = String(heroDivergenceMode || '').toLowerCase();
    if (divergenceMode.includes('recovery')) return `/all-visuals/videos/recovery-${timeOfDay}.mp4`;
    if (divergenceMode.includes('masked')) return `/all-visuals/videos/masked-${timeOfDay}.mp4`;
    return videoMap[tier]?.[timeOfDay] || videoMap.default[timeOfDay];
  }, [heroEnergyTier, heroDivergenceMode]);

  const gradient = TIER_GRADIENTS[heroEnergyTier] || TIER_GRADIENTS.default;
  const videoRef = useRef<HTMLVideoElement>(null);
  const fadedIn = useRef(false);

  const fadeIn = useCallback((el?: HTMLVideoElement | null) => {
    const target = el || videoRef.current;
    if (!fadedIn.current && target) {
      target.style.opacity = '0.4';
      fadedIn.current = true;
    }
  }, []);

  useEffect(() => {
    fadedIn.current = false;
    const t = setTimeout(() => fadeIn(), 3000);
    return () => clearTimeout(t);
  }, [heroVideoUrl, fadeIn]);

  return (
    <div className={`relative ${heightClass} w-full overflow-hidden pointer-events-none`}>
      <div className={`absolute inset-0 bg-gradient-to-b ${gradient}`} />
      <video
        ref={videoRef}
        key={heroVideoUrl}
        src={heroVideoUrl}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onCanPlay={(e) => fadeIn(e.currentTarget)}
        onLoadedData={(e) => fadeIn(e.currentTarget)}
        className="w-full h-full object-cover video-warm-luxury"
        style={{ opacity: 0 }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/5 via-background/30 to-background pointer-events-none" />
    </div>
  );
};

export default TodayHero;