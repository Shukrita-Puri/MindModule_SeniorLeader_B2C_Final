import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface BubbleData {
  label: string;
  count: number;
  weight: number;
  source: 'coach' | 'practice' | 'content';
}

interface InnerWorldBubblesProps {
  items: BubbleData[];
  emptyMessage?: string;
}

// Source-based color schemes using semantic tokens
const sourceStyles = {
  coach: 'bg-saffron/15 text-saffron border-saffron/25 hover:bg-saffron/20',
  practice: 'bg-primary/15 text-primary border-primary/25 hover:bg-primary/20',
  content: 'bg-taupe/15 text-foreground border-taupe/25 hover:bg-taupe/20'
};

const sourceLabels = {
  coach: 'conversation',
  practice: 'practice',
  content: 'content'
};

const InnerWorldBubbles = ({ items, emptyMessage = 'Complete check-ins, practices, and coach chats to see patterns emerge.' }: InnerWorldBubblesProps) => {
  // Calculate bubble sizes based on weight (60px to 120px)
  const getBubbleSize = (weight: number) => {
    const minSize = 72;
    const maxSize = 120;
    return minSize + (weight * (maxSize - minSize));
  };

  // Sort by weight for visual hierarchy
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => b.weight - a.weight).slice(0, 12); // Limit to top 12
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-sm text-muted-foreground max-w-xs">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Organic bubble cluster */}
      <div className="flex flex-wrap justify-center items-center gap-3 py-4">
        {sortedItems.map((item, index) => {
          const size = getBubbleSize(item.weight);
          const isLarge = item.weight > 0.6;
          const isMedium = item.weight > 0.3;
          
          return (
            <div
              key={`${item.label}-${index}`}
              className={cn(
                "rounded-full border flex flex-col items-center justify-center text-center transition-all duration-300 cursor-default",
                "hover:scale-105 hover:shadow-lg",
                sourceStyles[item.source],
                // Organic positioning with slight rotations and margins
                index % 3 === 0 && "mt-2",
                index % 4 === 1 && "-mt-1",
                index % 5 === 2 && "mt-3"
              )}
              style={{
                width: `${size}px`,
                height: `${size}px`,
                transform: `rotate(${(index % 5 - 2) * 1.5}deg)`,
              }}
            >
              <span 
                className={cn(
                  "font-medium leading-tight px-2",
                  isLarge ? "text-sm" : isMedium ? "text-xs" : "text-[11px]"
                )}
                style={{
                  maxWidth: `${size - 16}px`,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {item.label}
              </span>
              <span 
                className={cn(
                  "opacity-60 mt-0.5",
                  isLarge ? "text-xs" : "text-[10px]"
                )}
              >
                {item.count} {sourceLabels[item.source]}{item.count !== 1 ? 's' : ''}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-saffron/40" />
          <span>Conversations</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary/40" />
          <span>Practices</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-taupe/40" />
          <span>Content</span>
        </div>
      </div>
    </div>
  );
};

export default InnerWorldBubbles;
