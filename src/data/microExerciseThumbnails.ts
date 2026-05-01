// Centralized thumbnail imports for micro exercises
import pauseVisual from "@/assets/recalibrate/pause/soundscape-pause-visual.jpg";
import flowVisual from "@/assets/recalibrate/presence/soundscape-flow-visual.jpg";
import renewalVisual from "@/assets/recalibrate/power-up/soundscape-renewal-visual.jpg";

export const getThumbnailByCategory = (category: string): string => {
  switch (category) {
    case 'pause':
      return pauseVisual;
    case 'presence':
      return flowVisual;
    case 'power-up':
      return renewalVisual;
    default:
      return pauseVisual;
  }
};
