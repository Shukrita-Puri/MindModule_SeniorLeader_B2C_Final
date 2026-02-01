import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChatCircle } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

interface DimensionData {
  dimension: 'sentiment' | 'emotion' | 'agency' | 'regulation' | 'growth';
  value: string;
  count: number;
}

interface PsychologicalDimensionBubblesProps {
  data: DimensionData[];
  emptyMessage?: string;
  relatedWins?: Array<{ content: string; date: string }>;
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

// Dimension insights templates
const DIMENSION_INSIGHTS: Record<string, (value: string, count: number) => string> = {
  sentiment: (value, count) => {
    if (value.toLowerCase() === 'positive') {
      return `You frequently capture moments of accomplishment and joy. This reflects strong self-recognition and a bias toward acknowledging progress.`;
    }
    if (value.toLowerCase() === 'negative') {
      return `You're honest about challenges. Acknowledging difficulties is the first step toward processing and growth.`;
    }
    if (value.toLowerCase() === 'mixed') {
      return `You hold complexity well, recognizing that experiences often contain both challenge and growth.`;
    }
    return `Your reflections show a balanced perspective on daily experiences.`;
  },
  emotion: (value, count) => {
    const emotionMap: Record<string, string> = {
      pride: `Pride appears frequently in your wins. You're learning to own your accomplishments.`,
      gratitude: `Gratitude is a recurring theme. This orientation builds resilience and wellbeing.`,
      relief: `You often notice moments of relief. This suggests you're aware of pressure releasing.`,
      joy: `Joy surfaces naturally in your reflections. This positive orientation supports mental fitness.`,
      frustration: `You acknowledge frustration openly. This awareness helps you process challenges.`,
      anxiety: `You notice anxiety patterns. Awareness is the first step toward regulation.`,
      calm: `Calm is a recurring state in your wins. Your practices are building equanimity.`,
    };
    return emotionMap[value.toLowerCase()] || `${value} appears ${count} times in your wins, revealing an important emotional theme.`;
  },
  agency: (value, count) => {
    if (value.toLowerCase().includes('internal') || value.toLowerCase().includes('self')) {
      return `You recognize your own role in positive outcomes. This internal locus of control supports resilience.`;
    }
    return `Your wins reflect awareness of how agency plays out in your experiences.`;
  },
  regulation: (value, count) => {
    if (value.toLowerCase() === 'regulated') {
      return `You're capturing moments of emotional regulation. Your nervous system capacity is growing.`;
    }
    if (value.toLowerCase() === 'reactive') {
      return `You notice reactive moments. This awareness is itself a form of regulation.`;
    }
    return `Your reflections show growing awareness of emotional regulation patterns.`;
  },
  growth: (value, count) => {
    const growthMap: Record<string, string> = {
      mastery: `Mastery themes appear frequently. You're developing competence and skill.`,
      resilience: `Resilience is a core theme. You're building capacity to handle difficulty.`,
      presence: `Presence emerges in your wins. You're cultivating awareness and grounding.`,
      progress: `You notice progress well. This growth mindset accelerates development.`,
      learning: `Learning is a key theme. You're oriented toward continuous improvement.`,
    };
    return growthMap[value.toLowerCase()] || `${value} signals growth and development in your journey.`;
  }
};

const getDimensionStyle = (dimension: string, value: string) => {
  // Special handling for sentiment which has value-specific colors
  if (dimension === 'sentiment') {
    const key = `sentiment-${value.toLowerCase()}`;
    return DIMENSION_STYLES[key] || DIMENSION_STYLES['sentiment-neutral'];
  }
  return DIMENSION_STYLES[dimension] || DIMENSION_STYLES['emotion'];
};

const getDimensionLabel = (dimension: string): string => {
  const labels: Record<string, string> = {
    sentiment: 'Sentiment',
    emotion: 'Emotion',
    agency: 'Agency',
    regulation: 'Regulation',
    growth: 'Growth Signal'
  };
  return labels[dimension] || dimension;
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
  emptyMessage = 'Complete coach sessions to see your psychological patterns.',
  relatedWins
}: PsychologicalDimensionBubblesProps) => {
  const navigate = useNavigate();
  const [selectedBubble, setSelectedBubble] = useState<string | null>(null);
  
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
          const insightText = DIMENSION_INSIGHTS[item.dimension]?.(item.value, item.count) || 
            `This theme appears ${item.count} times in your reflections.`;
          
          // Extract single word for display (first word only)
          const displayLabel = item.value.split(' ')[0];
          
          return (
            <Popover key={`${item.dimension}-${item.value}-${index}`}>
              <PopoverTrigger asChild>
                <div
                  onClick={() => setSelectedBubble(`${item.dimension}-${item.value}`)}
                  className={cn(
                    "rounded-full flex flex-col items-center justify-center text-center cursor-pointer",
                    "border backdrop-blur-sm",
                    "shadow-[0_4px_16px_rgba(0,0,0,0.06),0_0_0_1px_rgba(255,255,255,0.1)_inset]",
                    "hover:shadow-[0_6px_24px_rgba(0,0,0,0.1)]",
                    "hover:scale-105 transition-all duration-300",
                    "active:scale-100",
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
                  
                  {/* Single-word label for visibility */}
                  <span 
                    className={cn(
                      "font-semibold leading-tight px-1 relative z-10 capitalize",
                      isLarge ? "text-xs" : "text-[10px]"
                    )}
                  >
                    {displayLabel}
                  </span>
                  {item.count > 1 && (
                    <span className="text-[9px] opacity-60 mt-0.5 relative z-10">
                      {item.count}×
                    </span>
                  )}
                </div>
              </PopoverTrigger>
              
              {/* Mindsera-style insight popover */}
              <PopoverContent 
                className="w-80 p-5 bg-white dark:bg-card border-0 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] rounded-2xl"
                side="bottom"
                sideOffset={12}
              >
                <div className="space-y-4">
                  {/* Bubble header with color indicator */}
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      style.bg
                    )}>
                      <span className={cn("text-sm font-semibold capitalize", style.text)}>
                        {item.value.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground capitalize text-lg">
                        {item.value}
                      </h4>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        style.bg, style.text
                      )}>
                        {getDimensionLabel(item.dimension)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Summary insight with border accent */}
                  <div className="border-l-2 border-primary/30 pl-3">
                    <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Summary
                    </h5>
                    <p className="text-sm text-foreground leading-relaxed">
                      {insightText}
                    </p>
                  </div>
                  
                  {/* Related wins preview if available */}
                  {relatedWins && relatedWins.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        From your wins
                      </h5>
                      {relatedWins.slice(0, 2).map((win, i) => (
                        <div key={i} className="bg-muted/50 rounded-xl p-3 text-sm text-foreground">
                          "{win.content}"
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {win.date}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Explore with coach button */}
                  <button
                    onClick={() => navigate('/coach', { 
                      state: { 
                        initialPrompt: `I've noticed "${item.value}" comes up often in my reflections. Can we explore what this pattern means?`,
                        flowType: 'explore'
                      }
                    })}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-saffron/15 text-saffron hover:bg-saffron/25 transition-colors text-sm font-medium"
                  >
                    <ChatCircle weight="duotone" className="w-4 h-4" />
                    Explore with Coach
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>

      {/* Color Legend - explains what each color means */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground pt-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/50"></span>
          <span>Sentiment</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-400/50"></span>
          <span>Emotion</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-500/50"></span>
          <span>Agency</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-violet-500/50"></span>
          <span>Regulation</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-saffron/50"></span>
          <span>Growth</span>
        </div>
      </div>

      {/* Hint text */}
      <p className="text-center text-xs text-muted-foreground/50">
        Tap a bubble to explore its meaning
      </p>

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
