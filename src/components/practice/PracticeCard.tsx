import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface PracticeCardProps {
  children: ReactNode;
  variant?: "overview" | "step" | "science";
  stepNumber?: number;
  className?: string;
}

export const PracticeCard = ({ 
  children, 
  variant = "step", 
  stepNumber,
  className 
}: PracticeCardProps) => {
  const gradients = {
    overview: "bg-gradient-to-br from-amber-900/90 via-amber-800/85 to-stone-900/90",
    step: "bg-gradient-to-br from-stone-900/95 via-stone-800/90 to-amber-950/85",
    science: "bg-gradient-to-br from-amber-950/90 via-stone-900/90 to-stone-800/85"
  };

  return (
    <div
      className={cn(
        "relative min-h-[calc(100vh-8rem)] w-full rounded-3xl p-6 md:p-8 flex flex-col",
        "border border-white/10",
        "shadow-[0_8px_32px_rgba(0,0,0,0.3)]",
        gradients[variant],
        className
      )}
    >
      {/* Subtle glow effect */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-t from-transparent via-white/[0.02] to-white/[0.05] pointer-events-none" />
      
      {/* Step number badge */}
      {stepNumber && (
        <div className="absolute top-6 left-6 w-10 h-10 rounded-full bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
          <span className="text-amber-300 font-semibold text-lg">
            {stepNumber}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
};

export default PracticeCard;
