import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { ChatCircle, X } from '@phosphor-icons/react';
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

// Color schemes by dimension type - Emotion changed to rose to differentiate from Growth
const DIMENSION_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  // Sentiment colors (emerald)
  'sentiment-positive': { bg: 'bg-emerald-500/15', text: 'text-emerald-600', border: 'border-emerald-500/25' },
  'sentiment-negative': { bg: 'bg-rose-500/15', text: 'text-rose-600', border: 'border-rose-500/25' },
  'sentiment-mixed': { bg: 'bg-amber-500/15', text: 'text-amber-600', border: 'border-amber-500/25' },
  'sentiment-neutral': { bg: 'bg-slate-500/15', text: 'text-slate-600', border: 'border-slate-500/25' },
  // Emotion colors (rose/coral - differentiated from growth)
  'emotion': { bg: 'bg-rose-400/15', text: 'text-rose-500', border: 'border-rose-400/25' },
  // Agency colors (blue/sky)
  'agency': { bg: 'bg-sky-500/15', text: 'text-sky-600', border: 'border-sky-500/25' },
  // Regulation colors (purple/violet)
  'regulation': { bg: 'bg-violet-500/15', text: 'text-violet-600', border: 'border-violet-500/25' },
  // Growth colors (saffron/gold)
  'growth': { bg: 'bg-saffron/15', text: 'text-saffron', border: 'border-saffron/25' },
};

// Deeper Inner Mastery-connected insights
const DIMENSION_INSIGHTS: Record<string, (value: string, count: number) => string> = {
  sentiment: (value, count) => {
    if (value.toLowerCase() === 'positive') {
      return `Consistently capturing positive moments strengthens your Self-Regulation. This practice builds neural pathways for noticing success, which research shows increases resilience under pressure.`;
    }
    if (value.toLowerCase() === 'negative') {
      return `Acknowledging difficult experiences is a core Emotional Intelligence skill. By naming challenges honestly, you're developing the self-awareness that precedes emotional regulation.`;
    }
    if (value.toLowerCase() === 'mixed') {
      return `Holding both challenge and growth simultaneously reflects mature Self-Regulation. This nuanced awareness prevents reactive thinking and supports clearer decision-making.`;
    }
    return `Balanced reflection supports Self-Regulation by maintaining accurate self-perception under varying conditions.`;
  },
  emotion: (value, count) => {
    const emotionMap: Record<string, string> = {
      pride: `Pride anchors accomplishment in your nervous system. This emotional marker strengthens your internal sense of competence—a key driver of Resilience when facing future challenges.`,
      gratitude: `Gratitude shifts your nervous system toward parasympathetic activation. Regular gratitude practice has been shown to increase Resilience and reduce stress reactivity by up to 25%.`,
      relief: `Noticing relief indicates you're tracking pressure cycles. This Self-Regulation skill helps you recognize recovery moments and prevent chronic stress accumulation.`,
      joy: `Joy captures flow states and peak experiences. Tracking these moments reveals your optimal conditions—key Emotional Intelligence for designing environments that support high performance.`,
      frustration: `Naming frustration without being consumed by it is advanced Emotional Intelligence. This awareness is the first step toward transforming friction into fuel.`,
      anxiety: `Acknowledging anxiety patterns builds Self-Regulation capacity. Recognition creates a pause between stimulus and response—the foundation of emotional mastery.`,
      calm: `Calm appearances reflect nervous system regulation. Your practices are building vagal tone, which research links to faster recovery from stress and improved decision quality.`,
    };
    return emotionMap[value.toLowerCase()] || 
      `This emotional pattern appears ${count} times, suggesting it's a significant part of your inner landscape. Tracking it builds Emotional Intelligence through deepening self-awareness.`;
  },
  agency: (value, count) => {
    if (value.toLowerCase().includes('proactive') || value.toLowerCase().includes('responsive')) {
      return `Taking initiative before external pressure reflects strong Self-Regulation. This proactive stance is a hallmark of high-performing leaders who shape conditions rather than react to them.`;
    }
    if (value.toLowerCase().includes('internal') || value.toLowerCase().includes('self')) {
      return `Recognizing your role in outcomes reflects an internal locus of control—a core Resilience factor. Leaders with this orientation recover 40% faster from setbacks.`;
    }
    return `Your sense of agency—feeling in control of outcomes—is a cornerstone of Resilience. This pattern suggests you're building the psychological capital that sustains performance under pressure.`;
  },
  regulation: (value, count) => {
    if (value.toLowerCase() === 'regulated') {
      return `Regulated states indicate your nervous system capacity is growing. Each time you notice regulation, you're reinforcing the neural circuitry for calm under pressure—essential for executive decision-making.`;
    }
    if (value.toLowerCase() === 'reactive') {
      return `Noticing reactivity is itself a form of Self-Regulation. This meta-awareness creates space between trigger and response, where better choices become possible.`;
    }
    return `Tracking your regulation patterns builds metacognitive awareness—the ability to observe your own emotional state. This is foundational Emotional Intelligence for senior leaders.`;
  },
  growth: (value, count) => {
    const growthMap: Record<string, string> = {
      mastery: `Mastery orientation reflects your commitment to continuous improvement. This growth mindset is directly correlated with Resilience—you view challenges as development opportunities rather than threats.`,
      resilience: `You're explicitly building Resilience—the capacity to recover from setback. This meta-skill compounds over time, making you more adaptable and less affected by external volatility.`,
      presence: `Presence is the foundation of Emotional Intelligence. Your awareness of the present moment creates space for responsive (vs. reactive) leadership and deeper connection with others.`,
      progress: `Tracking progress builds Self-Regulation by reinforcing momentum. Each noted advancement strengthens your belief in your ability to grow—a key predictor of sustained performance.`,
      learning: `A learning orientation is the engine of growth. By framing experiences as lessons, you're building Resilience and ensuring that even setbacks contribute to your development.`,
    };
    return growthMap[value.toLowerCase()] || 
      `This growth signal indicates forward momentum in your inner development. Consistent growth tracking strengthens your identity as someone who continuously evolves.`;
  }
};

// Generic patterns to filter out
const GENERIC_PATTERNS = [
  /here'?s one thing/i,
  /today i/i,
  /^i did$/i,
  /something good/i,
  /^win$/i,
  /^good day$/i,
  /^ok$/i,
  /^fine$/i,
];

const isGenericWin = (content: string): boolean => {
  if (content.length < 20) return true;
  return GENERIC_PATTERNS.some(pattern => pattern.test(content.trim()));
};

const getDimensionStyle = (dimension: string, value: string) => {
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
  const [selectedItem, setSelectedItem] = useState<DimensionData | null>(null);
  
  // Sort by count and limit
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => b.count - a.count).slice(0, 12);
  }, [data]);

  const maxCount = useMemo(() => {
    return Math.max(...sortedData.map(d => d.count), 1);
  }, [sortedData]);

  // Filter out generic wins
  const meaningfulWins = useMemo(() => {
    return relatedWins?.filter(win => !isGenericWin(win.content)) || [];
  }, [relatedWins]);

  const closeModal = () => setSelectedItem(null);

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
          
          // Extract single word for display (first word only)
          const displayLabel = item.value.split(' ')[0];
          
          return (
            <div
              key={`${item.dimension}-${item.value}-${index}`}
              onClick={() => setSelectedItem(item)}
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
          );
        })}
      </div>

      {/* Centered Modal via Portal */}
      {selectedItem && createPortal(
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          {/* Blur backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          
          {/* Modal content */}
          <div 
            className="relative bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close X button */}
            <button 
              onClick={closeModal}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            
            {/* Content */}
            <div className="space-y-4">
              {/* Bubble header with color indicator */}
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  getDimensionStyle(selectedItem.dimension, selectedItem.value).bg
                )}>
                  <span className={cn(
                    "text-sm font-semibold capitalize", 
                    getDimensionStyle(selectedItem.dimension, selectedItem.value).text
                  )}>
                    {selectedItem.value.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground capitalize text-lg">
                    {selectedItem.value}
                  </h4>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full",
                    getDimensionStyle(selectedItem.dimension, selectedItem.value).bg, 
                    getDimensionStyle(selectedItem.dimension, selectedItem.value).text
                  )}>
                    {getDimensionLabel(selectedItem.dimension)}
                  </span>
                </div>
              </div>
              
              {/* Insight with border accent */}
              <div className="border-l-2 border-primary/30 pl-3">
                <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Insight
                </h5>
                <p className="text-sm text-foreground leading-relaxed">
                  {DIMENSION_INSIGHTS[selectedItem.dimension]?.(selectedItem.value, selectedItem.count) || 
                    `This theme appears ${selectedItem.count} times in your reflections.`}
                </p>
              </div>
              
              {/* Related wins preview if available */}
              {meaningfulWins.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    From your wins
                  </h5>
                  {meaningfulWins.slice(0, 2).map((win, i) => (
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
                onClick={() => {
                  closeModal();
                  navigate('/coach', { 
                    state: { 
                      initialPrompt: `I've noticed "${selectedItem.value}" comes up often in my reflections. Can we explore what this pattern means?`,
                      flowType: 'explore'
                    }
                  });
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-saffron/15 text-saffron hover:bg-saffron/25 transition-colors text-sm font-medium"
              >
                <ChatCircle weight="duotone" className="w-4 h-4" />
                Explore with Coach
              </button>
            </div>
            
            {/* Got it button */}
            <button
              onClick={closeModal}
              className="mt-4 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Color Legend - explains what each color means */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground pt-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/50"></span>
          <span>Sentiment</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400/50"></span>
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
