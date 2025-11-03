import { cn } from "@/lib/utils";

interface GradientProgressProps {
  value: number;
  className?: string;
}

export const GradientProgress = ({ value, className }: GradientProgressProps) => {
  return (
    <div className={cn(
      "relative h-2 w-full overflow-hidden rounded-full bg-secondary/20 backdrop-blur-sm",
      className
    )}>
      <div
        className="h-full transition-all duration-300 ease-out rounded-full bg-gradient-to-r from-gold via-accent to-primary"
        style={{
          width: `${value}%`
        }}
      />
      <div
        className="absolute top-0 h-full w-20 blur-xl opacity-50 transition-all duration-300 bg-gold/30"
        style={{
          left: `${Math.max(0, value - 10)}%`
        }}
      />
    </div>
  );
};
