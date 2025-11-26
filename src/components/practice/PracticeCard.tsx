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
    overview: "bg-gradient-to-br from-[#FAF9F6] via-[#F5F4F0] to-[#EDE9E3]",
    step: "bg-gradient-to-br from-[#FAFAF8] via-[#F7F5F2] to-[#F0EDE8]",
    science: "bg-gradient-to-br from-[#F5F4F0] via-[#FAF9F6] to-[#F0EDE8]"
  };

  return (
    <div
      className={cn(
        "relative min-h-[calc(100vh-8rem)] w-full rounded-3xl p-6 md:p-8 flex flex-col",
        "border border-primary/10",
        "shadow-[0_8px_32px_rgba(0,0,0,0.08)]",
        gradients[variant],
        className
      )}
    >
      {/* Subtle glow effect */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-t from-transparent via-white/20 to-white/40 pointer-events-none" />
      
      {/* Step number badge */}
      {stepNumber && (
        <div className="absolute top-6 left-6 w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
          <span className="text-primary font-semibold text-lg">
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
