import * as React from "react";
import { cn } from "@/lib/utils";

interface GoldCardProps {
  children: React.ReactNode;
  variant?: 'subtle' | 'prominent' | 'glowing';
  className?: string;
}

export const GoldCard = ({ children, variant = 'prominent', className }: GoldCardProps) => {
  const variants = {
    subtle: "border border-gold/30 bg-card/50",
    prominent: "border-2 border-gold/50 bg-card/70",
    glowing: "border-2 border-gold/60 bg-card/80 shadow-[0_0_30px_rgba(217,173,96,0.15)]"
  };

  return (
    <div className={cn(
      "rounded-3xl backdrop-blur-md transition-all duration-300",
      variants[variant],
      className
    )}>
      {children}
    </div>
  );
};
