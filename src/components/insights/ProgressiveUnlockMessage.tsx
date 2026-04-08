import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProgressiveUnlockMessageProps {
  currentCount: number;
  unlockAt: number;
  featureName: string;
  previewText: string;
  className?: string;
}

const ProgressiveUnlockMessage = ({
  currentCount,
  unlockAt,
  featureName,
  previewText,
  className
}: ProgressiveUnlockMessageProps) => {
  const remaining = unlockAt - currentCount;
  const progress = Math.min((currentCount / unlockAt) * 100, 100);

  return (
    <div className={cn(
      "relative p-5 rounded-xl border border-dashed border-muted-foreground/20 bg-muted/10",
      "flex flex-col items-center text-center",
      className
    )}>
      {/* Lock icon with subtle glow */}
      <div className="relative mb-3">
        <div className="absolute inset-0 bg-saffron/20 blur-xl rounded-full" />
        <Lock className="w-8 h-8 text-muted-foreground/50 relative" />
      </div>
      
      {/* Feature name */}
      <p className="text-sm font-medium text-foreground mb-1">
        {featureName}
      </p>
      
      {/* Unlock progress */}
      <p className="text-xs text-muted-foreground mb-3">
        Unlocks in {remaining} more {remaining === 1 ? 'day' : 'days'} of check-ins
      </p>
      
      {/* Progress bar */}
      <div className="w-full max-w-[200px] h-2 bg-muted/30 rounded-full overflow-hidden mb-3">
        <div 
          className="h-full rounded-full bg-gradient-to-r from-saffron/60 to-saffron transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      
      {/* Progress dots */}
      <div className="flex items-center gap-1.5 mb-3">
        {Array.from({ length: unlockAt }).map((_, i) => (
          <div 
            key={i}
            className={cn(
              "w-2.5 h-2.5 rounded-full transition-all",
              i < currentCount 
                ? "bg-saffron shadow-[0_0_8px_rgba(242,106,80,0.4)]" 
                : "bg-muted-foreground/20"
            )}
          />
        ))}
      </div>
      
      {/* Preview text */}
      <p className="text-xs text-muted-foreground/70 max-w-[240px] leading-relaxed">
        {previewText}
      </p>
    </div>
  );
};

export default ProgressiveUnlockMessage;
