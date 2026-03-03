import { useState, useEffect } from "react";

// Global cache so we don't re-fetch metadata for the same audio file
const durationCache: Record<string, number> = {};

/**
 * Formats seconds into m:ss display (e.g. 381 → "6:21")
 */
export const formatAudioDuration = (totalSeconds: number): string => {
  if (!totalSeconds || totalSeconds <= 0) return "0:00";
  const rounded = Math.floor(totalSeconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

/**
 * Formats seconds into a friendly label like "6:21 min" or "42:15 min"
 */
export const formatAudioDurationLabel = (totalSeconds: number): string => {
  if (!totalSeconds || totalSeconds <= 0) return "0:00 min";
  return `${formatAudioDuration(totalSeconds)} min`;
};

/**
 * Hook to load real audio duration from an audio file's metadata.
 * Returns duration in seconds (or null while loading).
 * Results are cached globally so each URL is only fetched once.
 */
export const useAudioDuration = (audioSrc: string | undefined): number | null => {
  const [duration, setDuration] = useState<number | null>(
    audioSrc && durationCache[audioSrc] ? durationCache[audioSrc] : null
  );

  useEffect(() => {
    if (!audioSrc) {
      setDuration(null);
      return;
    }

    // Return cached value
    if (durationCache[audioSrc]) {
      setDuration(durationCache[audioSrc]);
      return;
    }

    const audio = new Audio();
    audio.preload = "metadata";

    const handleLoaded = () => {
      const dur = audio.duration;
      if (dur && isFinite(dur)) {
        durationCache[audioSrc] = dur;
        setDuration(dur);
      }
      // Clean up
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("error", handleError);
      audio.src = "";
    };

    const handleError = () => {
      console.warn(`Failed to load audio metadata for: ${audioSrc}`);
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("error", handleError);
      audio.src = "";
    };

    audio.addEventListener("loadedmetadata", handleLoaded);
    audio.addEventListener("error", handleError);
    audio.src = audioSrc;

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("error", handleError);
      audio.src = "";
    };
  }, [audioSrc]);

  return duration;
};

/**
 * Hook to batch-load audio durations for multiple items.
 * Returns a map of audioSrc → duration in seconds.
 */
export const useAudioDurations = (
  items: Array<{ id: string; audioSrc?: string }>
): Record<string, number> => {
  const [durations, setDurations] = useState<Record<string, number>>({});

  useEffect(() => {
    const toLoad = items.filter(
      (item) => item.audioSrc && !durationCache[item.audioSrc]
    );

    // Set any already-cached values immediately
    const cached: Record<string, number> = {};
    items.forEach((item) => {
      if (item.audioSrc && durationCache[item.audioSrc]) {
        cached[item.id] = durationCache[item.audioSrc];
      }
    });
    if (Object.keys(cached).length > 0) {
      setDurations((prev) => ({ ...prev, ...cached }));
    }

    // Load the rest
    toLoad.forEach((item) => {
      if (!item.audioSrc) return;
      const audioSrc = item.audioSrc;
      const audio = new Audio();
      audio.preload = "metadata";

      const handleLoaded = () => {
        const dur = audio.duration;
        if (dur && isFinite(dur)) {
          durationCache[audioSrc] = dur;
          setDurations((prev) => ({ ...prev, [item.id]: dur }));
        }
        audio.removeEventListener("loadedmetadata", handleLoaded);
        audio.src = "";
      };

      audio.addEventListener("loadedmetadata", handleLoaded);
      audio.addEventListener("error", () => {
        audio.src = "";
      });
      audio.src = audioSrc;
    });
  }, [items.map((i) => i.id).join(",")]);

  return durations;
};
