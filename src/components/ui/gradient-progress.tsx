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
        className="h-full transition-all duration-300 ease-out rounded-full"
        style={{
          width: `${value}%`,
          background: `linear-gradient(to right, 
            hsl(var(--gold)) 0%, 
            hsl(var(--gold-light)) 50%, 
            hsl(var(--primary)) 100%)`
        }}
      />
      <div
        className="absolute top-0 h-full w-20 blur-xl opacity-50 transition-all duration-300"
        style={{
          left: `${Math.max(0, value - 10)}%`,
          background: `radial-gradient(circle, hsl(var(--gold)) 0%, transparent 70%)`
        }}
      />
    </div>
  );
};
