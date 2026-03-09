// Centralized thumbnail imports for micro exercises
import pauseMauve from "@/assets/recalibrate/pause/mindset-pause-mauve.jpg";
import flowBlue from "@/assets/recalibrate/presence/mindset-flow-blue.jpg";
import renewalColorful from "@/assets/recalibrate/power-up/mindset-renewal-colorful.jpg";

export const getThumbnailByCategory = (category: string): string => {
  switch (category) {
    case 'pause':
      return pauseMauve;
    case 'presence':
      return flowBlue;
    case 'power-up':
      return renewalColorful;
    default:
      return pauseMauve;
  }
};
