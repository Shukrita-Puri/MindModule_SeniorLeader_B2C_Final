import { cn } from "@/lib/utils";
import { Quote } from "lucide-react";

export interface WisdomCardProps {
  quote: string;
  attribution: string;
  context?: string;
  className?: string;
  variant?: 'default' | 'onDark';
}

export const WisdomCard = ({
  quote,
  attribution,
  context,
  className,
  variant = 'default'
}: WisdomCardProps) => {
  const isOnDark = variant === 'onDark';

  return (
    <div
      className={cn(
        "relative rounded-lg p-4",
        isOnDark
          ? "bg-white/85 backdrop-blur-sm border border-white/30 shadow-md"
          : "bg-muted/30 dark:bg-white/5 border-l-2 border-l-taupe/40",
        className
      )}
    >
      {/* Quote Icon */}
      <Quote className={cn(
        "absolute top-3 right-3 w-4 h-4",
        isOnDark ? "text-taupe/50" : "text-taupe/30"
      )} />
      
      {/* Quote Text */}
      <p className={cn(
        "text-sm font-headline italic leading-relaxed pr-6",
        isOnDark ? "text-foreground" : "text-foreground"
      )}>
        "{quote}"
      </p>
      
      {/* Attribution */}
      <p className={cn(
        "text-xs mt-2 text-right",
        isOnDark ? "text-muted-foreground" : "text-muted-foreground"
      )}>
        – {attribution}
      </p>
      
      {/* Optional Context */}
      {context && (
        <p className={cn(
          "text-xs mt-1 text-right",
          isOnDark ? "text-muted-foreground/80" : "text-muted-foreground/70"
        )}>
          {context}
        </p>
      )}
    </div>
  );
};

export default WisdomCard;
