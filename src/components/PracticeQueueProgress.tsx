import { Button } from '@/components/ui/button';
import { SkipForward, Pause, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QueuedPractice {
  id: string;
  title: string;
  contentType: 'soundbath' | 'guided-practice' | 'micro-practice' | 'coach';
  category: string;
  duration: number;
}

interface PracticeQueueProgressProps {
  currentIndex: number;
  totalCount: number;
  queue: QueuedPractice[];
  onSkip: () => void;
  onPause: () => void;
  onComplete: () => void;
}

const PracticeQueueProgress = ({ 
  currentIndex, 
  totalCount, 
  queue,
  onSkip,
  onPause,
  onComplete
}: PracticeQueueProgressProps) => {
  const nextPractice = queue[currentIndex + 1];
  const isLastPractice = currentIndex === totalCount - 1;

  // Don't show progress UI for single practice
  if (totalCount <= 1) {
    return null;
  }

  return (
    <div className="fixed top-16 left-0 right-0 bg-white/30 dark:bg-black/20 backdrop-blur-xl border-b border-white/20 z-40">
      <div className="max-w-4xl mx-auto px-4 py-3">
        {/* Minimal Progress Dots - top right aligned */}
        <div className="flex items-center justify-between mb-3">
        {/* Up next preview - visible text */}
          {nextPractice && (
            <div className="text-xs text-foreground/80 font-medium">
              Up next: {nextPractice.title}
            </div>
          )}
          {!nextPractice && <div />}
          
          {/* Elegant progress dots */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalCount }).map((_, index) => (
              <div
                key={index}
                className={cn(
                  "transition-all duration-300 rounded-full",
                  index === currentIndex
                    ? "w-2.5 h-2.5 bg-saffron shadow-[0_0_8px_rgba(255,140,66,0.4)]"
                    : index < currentIndex
                    ? "w-2 h-2 bg-saffron/50"
                    : "w-2 h-2 bg-muted-foreground/20"
                )}
              />
            ))}
          </div>
        </div>

        {/* Action Buttons - refined styling */}
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            className="text-xs text-foreground/80 hover:text-foreground font-medium"
          >
            <SkipForward className="w-3.5 h-3.5 mr-1.5" />
            {isLastPractice ? 'Skip & Exit' : 'Skip'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onPause}
            className="text-xs text-foreground/80 hover:text-foreground font-medium"
          >
            <Pause className="w-3.5 h-3.5 mr-1.5" />
            Pause
          </Button>
          <Button
            size="sm"
            onClick={onComplete}
            className="ml-auto text-xs bg-saffron hover:bg-saffron/90 text-charcoal font-medium"
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            {isLastPractice ? 'Complete' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PracticeQueueProgress;