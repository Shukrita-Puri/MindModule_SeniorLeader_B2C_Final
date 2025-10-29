interface ProgressIndicatorProps {
  percentage: number;
  estimatedTimeRemaining: number;
}

export const ProgressIndicator = ({
  percentage,
  estimatedTimeRemaining,
}: ProgressIndicatorProps) => {

  return (
    <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3">
      <div className="max-w-md mx-auto">
        <div className="relative h-1.5 bg-muted rounded-full overflow-hidden mb-2">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-gold via-gold to-primary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-medium">
            {percentage}% Complete
          </span>
          <span className="text-muted-foreground">
            ~{estimatedTimeRemaining} min remaining
          </span>
        </div>
      </div>
    </div>
  );
};
