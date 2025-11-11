// Centralized thumbnail imports for micro exercises
import pauseMauve from "@/assets/mindset-pause-mauve.jpg";
import flowBlue from "@/assets/mindset-flow-blue.jpg";
import renewalColorful from "@/assets/mindset-renewal-colorful.jpg";

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
