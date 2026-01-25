import { cn } from "@/lib/utils";
import { Quote } from "lucide-react";

export interface WisdomCardProps {
  quote: string;
  attribution: string;
  context?: string;
  className?: string;
}

export const WisdomCard = ({
  quote,
  attribution,
  context,
  className
}: WisdomCardProps) => {
  return (
    <div
      className={cn(
        "relative rounded-lg p-4",
        "bg-muted/30 dark:bg-white/5",
        "border-l-2 border-l-taupe/40",
        className
      )}
    >
      {/* Quote Icon */}
      <Quote className="absolute top-3 right-3 w-4 h-4 text-taupe/30" />
      
      {/* Quote Text */}
      <p className="text-sm font-headline italic text-foreground leading-relaxed pr-6">
        "{quote}"
      </p>
      
      {/* Attribution */}
      <p className="text-xs text-muted-foreground mt-2 text-right">
        — {attribution}
      </p>
      
      {/* Optional Context */}
      {context && (
        <p className="text-[10px] text-muted-foreground/70 mt-1 text-right">
          {context}
        </p>
      )}
    </div>
  );
};

export default WisdomCard;
