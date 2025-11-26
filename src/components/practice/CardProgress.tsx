import { cn } from "@/lib/utils";

interface CardProgressProps {
  total: number;
  current: number;
  className?: string;
}

export const CardProgress = ({ total, current, className }: CardProgressProps) => {
  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      {Array.from({ length: total }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "h-2 rounded-full transition-all duration-300",
            index === current
              ? "w-6 bg-primary"
              : index < current
                ? "w-2 bg-primary/60"
                : "w-2 bg-primary/20"
          )}
        />
      ))}
    </div>
  );
};

export default CardProgress;
