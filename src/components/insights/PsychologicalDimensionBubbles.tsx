import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface DimensionData {
  dimension: 'sentiment' | 'emotion' | 'agency' | 'regulation' | 'growth';
  value: string;
  count: number;
}

interface PsychologicalDimensionBubblesProps {
  data: DimensionData[];
  emptyMessage?: string;
}

// Color schemes by dimension type
const DIMENSION_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  // Sentiment colors
  'sentiment-positive': { bg: 'bg-emerald-500/15', text: 'text-emerald-600', border: 'border-emerald-500/25' },
  'sentiment-negative': { bg: 'bg-rose-500/15', text: 'text-rose-600', border: 'border-rose-500/25' },
  'sentiment-mixed': { bg: 'bg-amber-500/15', text: 'text-amber-600', border: 'border-amber-500/25' },
  'sentiment-neutral': { bg: 'bg-slate-500/15', text: 'text-slate-600', border: 'border-slate-500/25' },
  // Emotion colors (warm tones)
  'emotion': { bg: 'bg-orange-400/15', text: 'text-orange-600', border: 'border-orange-400/25' },
  // Agency colors (blue/teal)
  'agency': { bg: 'bg-sky-500/15', text: 'text-sky-600', border: 'border-sky-500/25' },
  // Regulation colors (purple/violet)
  'regulation': { bg: 'bg-violet-500/15', text: 'text-violet-600', border: 'border-violet-500/25' },
  // Growth colors (saffron/gold)
  'growth': { bg: 'bg-saffron/15', text: 'text-saffron', border: 'border-saffron/25' },
};

const getDimensionStyle = (dimension: string, value: string) => {
  // Special handling for sentiment which has value-specific colors
  if (dimension === 'sentiment') {
    const key = `sentiment-${value.toLowerCase()}`;
    return DIMENSION_STYLES[key] || DIMENSION_STYLES['sentiment-neutral'];
  }
  return DIMENSION_STYLES[dimension] || DIMENSION_STYLES['emotion'];
};

// Calculate bubble size based on count (48px to 88px)
const getBubbleSize = (count: number, maxCount: number) => {
  const minSize = 48;
  const maxSize = 88;
  const ratio = maxCount > 1 ? count / maxCount : 1;
  return minSize + (ratio * (maxSize - minSize));
};

const PsychologicalDimensionBubbles = ({ 
  data,
  emptyMessage = 'Complete coach sessions to see your psychological patterns.'
}: PsychologicalDimensionBubblesProps) => {
  
  // Sort by count and limit
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => b.count - a.count).slice(0, 12);
  }, [data]);

  const maxCount = useMemo(() => {
    return Math.max(...sortedData.map(d => d.count), 1);
  }, [sortedData]);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-sm text-muted-foreground max-w-xs">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Organic bubble cluster */}
      <div className="flex flex-wrap justify-center items-center gap-2.5 py-4">
        {sortedData.map((item, index) => {
          const size = getBubbleSize(item.count, maxCount);
          const style = getDimensionStyle(item.dimension, item.value);
          const isLarge = size > 70;
          
          return (
            <div
              key={`${item.dimension}-${item.value}-${index}`}
              className={cn(
                "rounded-full flex flex-col items-center justify-center text-center",
                "border backdrop-blur-sm",
                "shadow-[0_4px_16px_rgba(0,0,0,0.06),0_0_0_1px_rgba(255,255,255,0.1)_inset]",
                "hover:shadow-[0_6px_24px_rgba(0,0,0,0.1)]",
                "hover:scale-105 transition-all duration-300",
                "relative overflow-hidden",
                style.bg,
                style.text,
                style.border,
                // Organic positioning
                index % 3 === 0 && "mt-1",
                index % 4 === 1 && "-mt-0.5",
                index % 5 === 2 && "mt-2"
              )}
              style={{
                width: `${size}px`,
                height: `${size}px`,
                transform: `rotate(${(index % 5 - 2) * 1.5}deg)`,
                animation: 'bubbleEntrance 0.4s ease-out forwards',
                animationDelay: `${index * 50}ms`,
                opacity: 0,
              }}
            >
              {/* Glass highlight */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/30 to-transparent opacity-50 pointer-events-none" />
              
              <span 
                className={cn(
                  "font-medium leading-tight px-1.5 relative z-10 capitalize",
                  isLarge ? "text-xs" : "text-[10px]"
                )}
                style={{
                  maxWidth: `${size - 12}px`,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.value}
              </span>
              {item.count > 1 && (
                <span className="text-[9px] opacity-60 mt-0.5 relative z-10">
                  {item.count}×
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* CSS for bubble entrance animation */}
      <style>{`
        @keyframes bubbleEntrance {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default PsychologicalDimensionBubbles;
