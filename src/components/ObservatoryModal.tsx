import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ObservatoryVariant = "mirror" | "navigator" | "architect";

interface ObservatoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  variant?: ObservatoryVariant;
  signal: string;
  lens: string;
  application: string;
  ctaText: string;
}

const variantConfig = {
  mirror: {
    label: "Reflective Insight",
    headlineClass: "bg-[hsl(152,48%,25%)]", // Forest Green
  },
  navigator: {
    label: "Strategic Calibration",
    headlineClass: "bg-gradient-to-r from-indigo-900 to-amber-600",
  },
  architect: {
    label: "Synthesis Pattern",
    headlineClass: "bg-gradient-to-r from-red-900 to-amber-600", // Bordeaux-gold
  },
};

const ObservatoryModal = ({
  isOpen,
  onClose,
  variant = "mirror",
  signal,
  lens,
  application,
  ctaText,
}: ObservatoryModalProps) => {
  const config = variantConfig[variant];

  if (!isOpen) return null;

  const handleCtaClick = () => {
    onClose();
  };

  return (
    <>
      {/* Backdrop blur */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      {/* Modal sliding from bottom */}
      <div className="fixed inset-x-0 bottom-0 z-[101] animate-in slide-in-from-bottom duration-300">
        <div className="bg-background mx-4 mb-4 rounded-2xl shadow-2xl max-w-2xl mx-auto overflow-hidden">
          {/* Headline Section with Gold Ribbon on Forest Green/Variant Background */}
          <div className={`${config.headlineClass} px-6 py-4 relative`}>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="bg-gradient-to-r from-amber-500 to-yellow-600 px-4 py-1.5 inline-block rounded-md">
                  <h2 className="font-display text-white text-lg font-semibold tracking-wide">
                    Mind Module: The Observatory
                  </h2>
                </div>
                <p className="text-amber-100/80 text-xs mt-1 ml-1">{config.label}</p>
              </div>
              
              {/* X Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-white hover:bg-white/20 h-8 w-8 p-0 ml-2"
              >
                <X size={20} />
              </Button>
            </div>
          </div>

          {/* Decorative Gold Line with Scroll Icon */}
          <div className="flex items-center justify-center py-3 bg-background">
            <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-amber-600/50 to-amber-600/80" />
            <div className="px-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-amber-600">
                <circle cx="12" cy="6" r="1.5" fill="currentColor" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                <circle cx="12" cy="18" r="1.5" fill="currentColor" />
              </svg>
            </div>
            <div className="flex-1 h-[1px] bg-gradient-to-l from-transparent via-amber-600/50 to-amber-600/80" />
          </div>

          {/* Body Content */}
          <div className="px-6 pb-6 space-y-4">
            {/* Signal */}
            <div>
              <p className="text-sm font-semibold text-foreground/60 mb-1">Signal:</p>
              <p className="text-foreground leading-relaxed">{signal}</p>
            </div>

            {/* Lens */}
            <div>
              <p className="text-sm font-semibold text-foreground/60 mb-1">Lens:</p>
              <p className="text-foreground leading-relaxed">{lens}</p>
            </div>

            {/* Application */}
            <div>
              <p className="text-sm font-semibold text-foreground/60 mb-1">Application:</p>
              <p className="text-foreground leading-relaxed">{application}</p>
            </div>

            {/* CTA Button */}
            <div className="pt-2">
              <Button
                onClick={handleCtaClick}
                className="w-full bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white font-medium shadow-md"
              >
                {ctaText}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ObservatoryModal;
