import { X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
    textColor: "text-[hsl(152,48%,35%)]", // Forest Green
  },
  navigator: {
    textColor: "text-indigo-700",
  },
  architect: {
    textColor: "text-red-800", // Bordeaux
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
        <div className="bg-background mx-4 mb-4 rounded-xl shadow-2xl max-w-2xl mx-auto overflow-hidden border-t-2 border-[hsl(var(--gold))]/40">
          {/* Header with Info and X Button */}
          <div className="px-4 pt-4 pb-3 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <h2 className={`font-display text-sm font-semibold ${config.textColor}`}>
                Mind Module: The Observatory
              </h2>
              
              {/* Info Button with Tooltip */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="hover:bg-muted rounded-full p-0.5 transition-colors">
                      <Info size={14} className="text-[hsl(var(--gold))]" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Wisdom enriching your thinking</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            {/* X Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="hover:bg-muted h-7 w-7 p-0 -mt-1"
            >
              <X size={16} />
            </Button>
          </div>

          {/* Dusted Gold Line */}
          <div className="mx-4 h-[2px] bg-gradient-to-r from-transparent via-[hsl(var(--gold))]/60 to-transparent" />

          {/* Body Content */}
          <div className="px-4 pt-3 pb-4 space-y-3">
            {/* Signal */}
            <div>
              <p className="text-xs font-semibold text-foreground/60 mb-0.5">Signal:</p>
              <p className="text-xs text-foreground leading-relaxed">{signal}</p>
            </div>

            {/* Lens */}
            <div>
              <p className="text-xs font-semibold text-foreground/60 mb-0.5">Lens:</p>
              <p className="text-xs text-foreground leading-relaxed">{lens}</p>
            </div>

            {/* Application */}
            <div>
              <p className="text-xs font-semibold text-foreground/60 mb-0.5">Application:</p>
              <p className="text-xs text-foreground leading-relaxed">{application}</p>
            </div>

            {/* CTA Button */}
            <div className="pt-1">
              <Button
                onClick={handleCtaClick}
                className="w-full bg-[hsl(var(--gold))] hover:bg-[hsl(var(--gold))]/90 text-gold-foreground text-xs font-medium shadow-lg border border-[hsl(var(--gold))]/30 h-9"
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
