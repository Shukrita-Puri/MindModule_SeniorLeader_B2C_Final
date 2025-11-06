import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SkipForward, Pause, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface QueuedPractice {
  id: string;
  title: string;
  contentType: 'soundbath' | 'guided-practice' | 'micro-practice';
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
  const navigate = useNavigate();
  const current = queue[currentIndex];
  const nextPractice = queue[currentIndex + 1];
  const isLastPractice = currentIndex === totalCount - 1;

  return (
    <div className="fixed top-16 left-0 right-0 bg-card/95 backdrop-blur-sm border-b border-border shadow-sm z-40">
      <div className="max-w-4xl mx-auto px-4 py-3">
        {/* Progress Indicator */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs">
              Practice {currentIndex + 1} of {totalCount}
            </Badge>
            <span className="text-sm font-medium text-foreground">
              {current.title}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {current.duration} min
          </div>
        </div>

        {/* Progress Bar */}
        <div className="relative h-1.5 bg-muted rounded-full overflow-hidden mb-3">
          <div 
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-saffron to-gold transition-all duration-500"
            style={{ width: `${((currentIndex + 1) / totalCount) * 100}%` }}
          />
        </div>

        {/* Next Practice Preview */}
        {nextPractice && (
          <div className="text-xs text-muted-foreground mb-3">
            Up next: {nextPractice.title} ({nextPractice.duration} min)
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {!isLastPractice && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSkip}
              className="text-xs"
            >
              <SkipForward className="w-3.5 h-3.5 mr-1.5" />
              Skip to Next
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onPause}
            className="text-xs"
          >
            <Pause className="w-3.5 h-3.5 mr-1.5" />
            Pause Ritual
          </Button>
          <Button
            size="sm"
            onClick={onComplete}
            className="ml-auto text-xs bg-gradient-to-r from-taupe via-taupe-highlight to-taupe hover:opacity-90 text-white"
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            {isLastPractice ? 'Complete Ritual' : 'Complete & Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PracticeQueueProgress;
