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
  lightBackground = false,
}: PracticeQueueProgressProps) => {
  const nextPractice = queue[currentIndex + 1];
  const isLastPractice = currentIndex === totalCount - 1;

  if (totalCount <= 1) {
    return null;
  }

  const subtleTextClass = lightBackground
    ? 'text-foreground/80'
    : 'text-white/90 drop-shadow-sm';

  const ghostButtonClass = lightBackground
    ? 'text-xs font-medium text-foreground/80 hover:text-foreground hover:bg-background/60'
    : 'text-xs font-medium text-white/90 hover:text-white hover:bg-white/15 drop-shadow-sm';

  const ctaButtonClass = lightBackground
    ? 'ml-auto text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-medium'
    : 'ml-auto text-xs bg-saffron hover:bg-saffron/90 text-white font-medium';

  return (
    <div
      className={cn(
        inline
          ? 'relative w-full'
          : 'fixed left-0 right-0 z-40 bg-background/70 backdrop-blur-xl border-b border-border/50'
      )}
      style={!inline ? { top: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' } : undefined}
    >
      <div className="max-w-4xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          {nextPractice ? (
            <div className={cn('text-xs font-medium', subtleTextClass)}>
              Up next: {nextPractice.title}
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalCount }).map((_, index) => (
              <div
                key={index}
                className={cn(
                  'transition-all duration-300 rounded-full',
                  index === currentIndex
                    ? lightBackground
                      ? 'w-2.5 h-2.5 bg-primary'
                      : 'w-2.5 h-2.5 bg-saffron shadow-[0_0_8px_rgba(255,140,66,0.6)]'
                    : index < currentIndex
                      ? lightBackground
                        ? 'w-2 h-2 bg-primary/60'
                        : 'w-2 h-2 bg-saffron/60'
                      : lightBackground
                        ? 'w-2 h-2 bg-muted-foreground/30'
                        : 'w-2 h-2 bg-white/40'
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onSkip} className={ghostButtonClass}>
            <SkipForward className="w-3.5 h-3.5 mr-1.5" />
            {isLastPractice ? 'Skip & Exit' : 'Skip'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onPause} className={ghostButtonClass}>
            <Pause className="w-3.5 h-3.5 mr-1.5" />
            Pause
          </Button>
          <Button size="sm" onClick={onComplete} className={ctaButtonClass}>
            {isLastPractice ? 'Complete' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PracticeQueueProgress;
