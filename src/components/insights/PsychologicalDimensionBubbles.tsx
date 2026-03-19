import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { ChatCircle, X } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

interface DimensionData {
  dimension: 'emotion' | 'agency' | 'regulation' | 'growth';
  value: string;
  count: number;
  displayLabel?: string;
  insight?: string;
}

interface WinWithDimensions {
  content: string;
  date: string;
  primary_emotion?: string | null;
  agency_type?: string | null;
  regulation_level?: string | null;
  growth_signal?: string | null;
}

interface PsychologicalDimensionBubblesProps {
  data: DimensionData[];
  emptyMessage?: string;
  relatedWins?: WinWithDimensions[];
}

// Color schemes by dimension type — sentiment removed (internal only)
const DIMENSION_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  'emotion': { bg: 'bg-rose-400/15', text: 'text-rose-500', border: 'border-rose-400/25' },
  'agency': { bg: 'bg-sky-500/15', text: 'text-sky-600', border: 'border-sky-500/25' },
  'regulation': { bg: 'bg-violet-500/15', text: 'text-violet-600', border: 'border-violet-500/25' },
  'growth': { bg: 'bg-saffron/15', text: 'text-saffron', border: 'border-saffron/25' },
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

const getDimensionStyle = (dimension: string) => {
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
  emptyMessage = 'Complete coach sessions to see your psychological patterns.',
  relatedWins
}: PsychologicalDimensionBubblesProps) => {
  const navigate = useNavigate();
  const [selectedItem, setSelectedItem] = useState<DimensionData | null>(null);
  
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => b.count - a.count).slice(0, 12);
  }, [data]);

  const maxCount = useMemo(() => {
    return Math.max(...sortedData.map(d => d.count), 1);
  }, [sortedData]);

  // Dimension field mapping: which field to check for each dimension type
  const DIMENSION_FIELD_MAP: Record<string, keyof WinWithDimensions> = {
    emotion: 'primary_emotion',
    agency: 'agency_type',
    regulation: 'regulation_level',
    growth: 'growth_signal',
  };

  const filteredWins = useMemo(() => {
    if (!selectedItem || !relatedWins) return [];
    const field = DIMENSION_FIELD_MAP[selectedItem.dimension];
    if (!field) return [];
    return relatedWins
      .filter(win => {
        const val = win[field];
        return typeof val === 'string' && val.toLowerCase() === selectedItem.value.toLowerCase();
      })
      .filter(win => !isGenericWin(win.content));
  }, [selectedItem, relatedWins]);

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
          const style = getDimensionStyle(item.dimension);
          const isLarge = size > 70;
          
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
              <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/30 to-transparent opacity-50 pointer-events-none" />
              
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
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          
          <div 
            className="relative bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={closeModal}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  getDimensionStyle(selectedItem.dimension).bg
                )}>
                  <span className={cn(
                    "text-sm font-semibold capitalize", 
                    getDimensionStyle(selectedItem.dimension).text
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
                    getDimensionStyle(selectedItem.dimension).bg, 
                    getDimensionStyle(selectedItem.dimension).text
                  )}>
                    {selectedItem.displayLabel || selectedItem.dimension}
                  </span>
                </div>
              </div>
              
              {/* Insight from server */}
              <div className="border-l-2 border-primary/30 pl-3">
                <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Insight
                </h5>
                <p className="text-sm text-foreground leading-relaxed">
                  {selectedItem.insight || `This theme appears ${selectedItem.count} times in your reflections.`}
                </p>
              </div>
              
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

      {/* Color Legend — uses C-suite display labels, no sentiment */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground pt-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400/50"></span>
          <span>What you felt</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-500/50"></span>
          <span>How you showed up</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-violet-500/50"></span>
          <span>How you led yourself</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-saffron/50"></span>
          <span>What it built</span>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground/50">
        Tap a bubble to explore its meaning
      </p>

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
