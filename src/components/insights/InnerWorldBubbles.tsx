import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChatCircle } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

interface UnifiedBubbleData {
  theme: string;
  totalCount: number;
  weight: number;
  sources: {
    coach: number;
    practice: number;
    wins: number;
    checkins: number;
  };
}

interface BubbleDetails {
  keyword: string;
  totalCount: number;
  recentMentions: {
    snippet: string;
    date: string;
    source: 'coach' | 'practice' | 'wins' | 'checkins';
    sessionId?: string;
  }[];
}

interface ThemeRelationship {
  from: string;
  to: string;
  strength: number;
}

interface InnerWorldBubblesProps {
  items: UnifiedBubbleData[];
  relationships?: ThemeRelationship[];
  emptyMessage?: string;
  onBubbleClick?: (keyword: string) => Promise<BubbleDetails | null>;
}

// Source labels for display
const sourceLabels: Record<string, string> = {
  coach: 'Coach',
  practice: 'Practice',
  wins: 'Wins',
  checkins: 'Check-ins'
};

const InnerWorldBubbles = ({ 
  items, 
  relationships = [],
  emptyMessage = 'Complete check-ins, practices, and coach chats to see patterns emerge.',
  onBubbleClick
}: InnerWorldBubblesProps) => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const bubbleRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [bubblePositions, setBubblePositions] = useState<Map<string, DOMRect>>(new Map());
  const [selectedBubble, setSelectedBubble] = useState<string | null>(null);
  const [bubbleDetails, setBubbleDetails] = useState<BubbleDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Calculate bubble sizes based on weight (60px to 110px)
  const getBubbleSize = (weight: number) => {
    const minSize = 64;
    const maxSize = 110;
    return minSize + (weight * (maxSize - minSize));
  };

  // Sort by weight for visual hierarchy
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => b.weight - a.weight).slice(0, 12);
  }, [items]);

  // Update bubble positions for drawing connections
  const updatePositions = useCallback(() => {
    if (!containerRef.current) return;
    
    const newPositions = new Map<string, DOMRect>();
    bubbleRefs.current.forEach((element, key) => {
      if (element) {
        newPositions.set(key.toLowerCase(), element.getBoundingClientRect());
      }
    });
    setBubblePositions(newPositions);
  }, []);

  useEffect(() => {
    updatePositions();
    
    const resizeObserver = new ResizeObserver(updatePositions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    window.addEventListener('scroll', updatePositions);
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('scroll', updatePositions);
    };
  }, [sortedItems, updatePositions]);

  // Handle bubble click
  const handleBubbleClick = async (item: UnifiedBubbleData) => {
    setSelectedBubble(item.theme);
    setBubbleDetails(null);
    
    if (onBubbleClick) {
      setLoadingDetails(true);
      try {
        const details = await onBubbleClick(item.theme);
        setBubbleDetails(details);
      } catch (error) {
        console.error('Failed to fetch bubble details:', error);
      } finally {
        setLoadingDetails(false);
      }
    }
  };

  // Get source breakdown text
  const getSourceBreakdown = (sources: UnifiedBubbleData['sources']) => {
    const parts: string[] = [];
    if (sources.coach > 0) parts.push(`${sources.coach} coach`);
    if (sources.practice > 0) parts.push(`${sources.practice} practice`);
    if (sources.wins > 0) parts.push(`${sources.wins} win${sources.wins > 1 ? 's' : ''}`);
    if (sources.checkins > 0) parts.push(`${sources.checkins} check-in${sources.checkins > 1 ? 's' : ''}`);
    return parts.join(', ');
  };

  // Calculate SVG paths for connections
  const connectionPaths = useMemo(() => {
    if (!containerRef.current || relationships.length === 0 || bubblePositions.size === 0) {
      return [];
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    
    return relationships.map((rel, index) => {
      const fromRect = bubblePositions.get(rel.from.toLowerCase());
      const toRect = bubblePositions.get(rel.to.toLowerCase());
      
      if (!fromRect || !toRect) return null;
      
      const x1 = fromRect.left + fromRect.width / 2 - containerRect.left;
      const y1 = fromRect.top + fromRect.height / 2 - containerRect.top;
      const x2 = toRect.left + toRect.width / 2 - containerRect.left;
      const y2 = toRect.top + toRect.height / 2 - containerRect.top;
      
      // Control point for curve
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const offset = Math.min(Math.abs(dx), Math.abs(dy)) * 0.3;
      
      // Perpendicular offset for curve
      const perpX = -dy / Math.sqrt(dx * dx + dy * dy) * offset;
      const perpY = dx / Math.sqrt(dx * dx + dy * dy) * offset;
      
      const cx = midX + perpX;
      const cy = midY + perpY;
      
      return {
        path: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`,
        strength: rel.strength,
        key: `${rel.from}-${rel.to}-${index}`
      };
    }).filter(Boolean);
  }, [relationships, bubblePositions]);

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
    <div className="space-y-4">
      {/* Organic bubble cluster with SVG overlay for connections */}
      <div ref={containerRef} className="relative">
        {/* Connection lines SVG */}
        {connectionPaths.length > 0 && (
          <svg 
            className="absolute inset-0 pointer-events-none z-0"
            style={{ width: '100%', height: '100%' }}
          >
            {connectionPaths.map((connection) => connection && (
              <path
                key={connection.key}
                d={connection.path}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeOpacity={connection.strength * 0.2}
                strokeDasharray="4 4"
                className="text-muted-foreground"
              />
            ))}
          </svg>
        )}
        
        {/* Bubbles with luxury glass morphism styling */}
        <div className="flex flex-wrap justify-center items-center gap-2.5 py-4 relative z-10">
          {sortedItems.map((item, index) => {
            const size = getBubbleSize(item.weight);
            const isLarge = item.weight > 0.6;
            const isMedium = item.weight > 0.3;
            
            return (
              <Popover key={`${item.theme}-${index}`}>
                <PopoverTrigger asChild>
                  <div
                    ref={(el) => {
                      if (el) bubbleRefs.current.set(item.theme.toLowerCase(), el);
                    }}
                    onClick={() => handleBubbleClick(item)}
                    className={cn(
                      "rounded-full flex flex-col items-center justify-center text-center cursor-pointer",
                      "bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5",
                      "border border-primary/20",
                      "shadow-[0_4px_20px_rgba(0,0,0,0.1),0_0_0_1px_rgba(255,255,255,0.1)_inset]",
                      "backdrop-blur-sm",
                      "hover:shadow-[0_8px_30px_rgba(0,0,0,0.15),0_0_20px_hsl(var(--primary)/0.1)]",
                      "hover:scale-105 transition-all duration-300",
                      "active:scale-100",
                      "relative overflow-hidden",
                      // Organic positioning offsets
                      index % 3 === 0 && "mt-1",
                      index % 4 === 1 && "-mt-0.5",
                      index % 5 === 2 && "mt-2"
                    )}
                    style={{
                      width: `${size}px`,
                      height: `${size}px`,
                      transform: `rotate(${(index % 5 - 2) * 1}deg)`,
                      // Staggered entrance animation
                      animation: 'bubbleEntrance 0.4s ease-out forwards',
                      animationDelay: `${index * 60}ms`,
                      opacity: 0,
                    }}
                  >
                    {/* Glass highlight */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent opacity-60 pointer-events-none" />
                    
                    <span 
                      className={cn(
                        "font-medium leading-tight px-2 relative z-10",
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
                      {item.theme}
                    </span>
                    <span 
                      className={cn(
                        "opacity-50 mt-0.5 relative z-10",
                        isLarge ? "text-xs" : "text-[10px]"
                      )}
                    >
                      {item.totalCount}×
                    </span>
                  </div>
                </PopoverTrigger>
                
                <PopoverContent 
                  className="w-72 p-4 bg-card/95 backdrop-blur-lg border-border/50 shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
                  side="top"
                  sideOffset={8}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-foreground">
                        {item.theme}
                      </h4>
                      <span className="text-xs text-muted-foreground">
                        {item.totalCount} mentions
                      </span>
                    </div>
                    
                    {/* Source breakdown */}
                    <p className="text-xs text-muted-foreground">
                      From: {getSourceBreakdown(item.sources)}
                    </p>
                    
                    {loadingDetails && selectedBubble === item.theme ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      </div>
                    ) : bubbleDetails && selectedBubble === item.theme && bubbleDetails.recentMentions.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Recent mentions
                        </p>
                        {bubbleDetails.recentMentions.map((mention, i) => (
                          <div key={i} className="bg-muted/30 rounded-lg p-2.5">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                                {sourceLabels[mention.source]}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {mention.date}
                              </span>
                            </div>
                            <p className="text-sm text-foreground line-clamp-2">
                              "{mention.snippet}"
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-2 text-sm text-muted-foreground/70 text-center">
                        Tap to load recent mentions
                      </div>
                    )}
                    
                    {/* Explore with coach button - show if theme has coach mentions */}
                    {item.sources.coach > 0 && (
                      <button
                        onClick={() => navigate('/coach', { 
                          state: { 
                            initialPrompt: `I'd like to explore the theme of "${item.theme}" that's been coming up.`,
                            flowType: 'explore'
                          }
                        })}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-saffron/15 text-saffron hover:bg-saffron/25 transition-colors text-sm font-medium"
                      >
                        <ChatCircle weight="duotone" className="w-4 h-4" />
                        Explore with Coach
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      </div>
      
      {/* Relationship indicator - subtle, no legend */}
      {relationships.length > 0 && (
        <p className="text-center text-xs text-muted-foreground/50">
          Dotted lines show related themes
        </p>
      )}

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

export default InnerWorldBubbles;
