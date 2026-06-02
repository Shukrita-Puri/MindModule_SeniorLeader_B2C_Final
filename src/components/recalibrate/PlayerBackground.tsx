import { useEffect, useState } from "react";
import pauseFallback from "@/assets/recalibrate/pause/soundscape-pause-visual.jpg";
import flowFallback from "@/assets/recalibrate/presence/soundscape-flow-visual.jpg";
import powerUpFallback from "@/assets/recalibrate/power-up/soundscape-renewal-visual.jpg";

type Category = "pause" | "power-up" | "presence" | "flow";

interface PlayerBackgroundProps {
  /** The practice's own authored thumbnail. Always rendered first. */
  thumbnail: string;
  category: Category;
}

const CATEGORY_FALLBACK: Record<Category, string> = {
  pause: pauseFallback,
  presence: flowFallback,
  flow: flowFallback,
  "power-up": powerUpFallback,
};

/**
 * Hardened full-screen background for Recalibrate player pages
 * (SoundscapePlayer, GuidedPracticePlayer audio view).
 *
 * IMPORTANT — do NOT use negative z-index here. The app's <body> has
 * `bg-background` (white in light mode); a `fixed inset-0 -z-10` wrapper
 * gets painted behind that background, which hides both the image and the
 * dark overlay and makes white player text invisible.
 *
 * Each practice always renders its OWN authored `thumbnail`. The per-category
 * image is purely an `onError` fallback so the page retains a usable dark
 * backdrop if a single asset fails to load — it is never the default.
 */
const PlayerBackground = ({ thumbnail, category }: PlayerBackgroundProps) => {
  const [src, setSrc] = useState(thumbnail);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // Reset when the practice (and therefore thumbnail) changes.
  useEffect(() => {
    setSrc(thumbnail);
    setLoaded(false);
    setErrored(false);
  }, [thumbnail]);

  const filter =
    category === "presence" || category === "flow"
      ? "saturate(0.6) sepia(15%) hue-rotate(85deg) brightness(0.9) contrast(1.1)"
      : "brightness(0.85) contrast(1.1) saturate(1.2)";

  return (
    <div className="absolute inset-0 z-0 bg-stone-900 overflow-hidden pointer-events-none">
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="eager"
        // @ts-expect-error fetchpriority is valid HTML but not yet in React's typings everywhere
        fetchpriority="high"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (!errored) {
            setErrored(true);
            setSrc(CATEGORY_FALLBACK[category]);
          }
        }}
        className="w-full h-full object-cover transition-opacity duration-500"
        style={{ filter, opacity: loaded ? 1 : 0 }}
      />
      {/* Always-on dark overlay so white text stays readable in every state. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-taupe-rich/30 to-black/50" />
    </div>
  );
};

export default PlayerBackground;