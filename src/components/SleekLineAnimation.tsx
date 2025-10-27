import { cn } from "@/lib/utils";

interface SleekLineAnimationProps {
  isActive: boolean;
  color?: "primary" | "accent";
  className?: string;
}

const SleekLineAnimation = ({ isActive, color = "primary", className }: SleekLineAnimationProps) => {
  const colorClass = color === "primary" ? "bg-primary" : "bg-accent";
  
  return (
    <div className={cn("relative w-48 h-0.5 mx-auto my-4", className)}>
      {/* Base line (always visible, subtle) */}
      <div className="absolute inset-0 bg-border/30 rounded-full" />
      
      {/* Animated moving line (only when speaking) */}
      {isActive && (
        <div className={cn(
          "absolute inset-y-0 left-0 w-16 rounded-full",
          colorClass,
          "animate-slide"
        )} />
      )}
    </div>
  );
};

export default SleekLineAnimation;
