import { Button } from '@/components/ui/button';
import { SkipForward, Pause } from 'lucide-react';
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
  inline?: boolean;
  lightBackground?: boolean;
}

const PracticeQueueProgress = ({ 
  currentIndex, 
  totalCount, 
  queue,
  onSkip,
  onPause,
  onComplete,
  inline = false,
  lightBackground = false
}: PracticeQueueProgressProps) => {
  const nextPractice = queue[currentIndex + 1];
  const isLastPractice = currentIndex === totalCount - 1;

  // Don't show progress UI for single practice
  if (totalCount <= 1) {
    return null;
  }

  return (
    <div 
      className={cn(
        inline 
          ? "relative w-full"
          : "fixed left-0 right-0 z-40 bg-white/10 dark:bg-black/10 backdrop-blur-2xl border-b border-white/10"
      )}
      style={!inline ? { top: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' } : undefined}
    >
      <div className="max-w-4xl mx-auto px-4 py-3">
        {/* Minimal Progress Dots - top right aligned */}
        <div className="flex items-center justify-between mb-3">
        {/* Up next preview - always white text since wrapper is dark */}
          {nextPractice && (
            <div className="text-xs font-medium text-white/90 drop-shadow-sm">
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
                    ? "w-2.5 h-2.5 bg-saffron shadow-[0_0_8px_rgba(255,140,66,0.6)]"
                    : index < currentIndex
                    ? "w-2 h-2 bg-saffron/60"
                    : "w-2 h-2 bg-white/40"
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
            className="text-xs font-medium text-white/90 hover:text-white hover:bg-white/15 drop-shadow-sm"
          >
            <SkipForward className="w-3.5 h-3.5 mr-1.5" />
            {isLastPractice ? 'Skip & Exit' : 'Skip'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onPause}
            className="text-xs font-medium text-white/90 hover:text-white hover:bg-white/15 drop-shadow-sm"
          >
            <Pause className="w-3.5 h-3.5 mr-1.5" />
            Pause
          </Button>
          <Button
            size="sm"
            onClick={onComplete}
            className="ml-auto text-xs bg-saffron hover:bg-saffron/90 text-white font-medium"
          >
            {isLastPractice ? 'Complete' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PracticeQueueProgress;