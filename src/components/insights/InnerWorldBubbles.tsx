import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChatCircle } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

interface BubbleData {
  label: string;
  count: number;
  weight: number;
  source: 'coach' | 'practice' | 'content';
}

interface BubbleDetails {
  keyword: string;
  source: 'coach' | 'practice' | 'content';
  totalCount: number;
  recentMentions: {
    snippet: string;
    date: string;
    sessionId?: string;
  }[];
}

interface ThemeRelationship {
  from: string;
  to: string;
  strength: number;
}

interface InnerWorldBubblesProps {
  items: BubbleData[];
  relationships?: ThemeRelationship[];
  emptyMessage?: string;
  onBubbleClick?: (keyword: string, source: 'coach' | 'practice' | 'content') => Promise<BubbleDetails | null>;
}

// Source-based color schemes using semantic tokens
const sourceStyles = {
  coach: 'bg-saffron/15 text-saffron border-saffron/25 hover:bg-saffron/25 hover:border-saffron/40',
  practice: 'bg-primary/15 text-primary border-primary/25 hover:bg-primary/25 hover:border-primary/40',
  content: 'bg-taupe/15 text-foreground border-taupe/25 hover:bg-taupe/25 hover:border-taupe/40'
};

const sourceLabels = {
  coach: 'conversation',
  practice: 'practice',
  content: 'content'
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

  // Calculate bubble sizes based on weight (60px to 120px)
  const getBubbleSize = (weight: number) => {
    const minSize = 72;
    const maxSize = 120;
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
  const handleBubbleClick = async (item: BubbleData) => {
    setSelectedBubble(item.label);
    setBubbleDetails(null);
    
    if (onBubbleClick) {
      setLoadingDetails(true);
      try {
        const details = await onBubbleClick(item.label, item.source);
        setBubbleDetails(details);
      } catch (error) {
        console.error('Failed to fetch bubble details:', error);
      } finally {
        setLoadingDetails(false);
      }
    }
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
    <div className="space-y-6">
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
                strokeOpacity={connection.strength * 0.25}
                strokeDasharray="4 4"
                className="text-muted-foreground"
              />
            ))}
          </svg>
        )}
        
        {/* Bubbles */}
        <div className="flex flex-wrap justify-center items-center gap-3 py-4 relative z-10">
          {sortedItems.map((item, index) => {
            const size = getBubbleSize(item.weight);
            const isLarge = item.weight > 0.6;
            const isMedium = item.weight > 0.3;
            
            return (
              <Popover key={`${item.label}-${index}`}>
                <PopoverTrigger asChild>
                  <div
                    ref={(el) => {
                      if (el) bubbleRefs.current.set(item.label.toLowerCase(), el);
                    }}
                    onClick={() => handleBubbleClick(item)}
                    className={cn(
                      "rounded-full border flex flex-col items-center justify-center text-center transition-all duration-300 cursor-pointer",
                      "hover:scale-110 hover:shadow-xl active:scale-105",
                      sourceStyles[item.source],
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
                </PopoverTrigger>
                
                <PopoverContent 
                  className="w-72 p-4 bg-card/95 backdrop-blur-lg border-border/50"
                  side="top"
                  sideOffset={8}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-foreground capitalize">
                        {item.label}
                      </h4>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        item.source === 'coach' && "bg-saffron/20 text-saffron",
                        item.source === 'practice' && "bg-primary/20 text-primary",
                        item.source === 'content' && "bg-taupe/20 text-muted-foreground"
                      )}>
                        {sourceLabels[item.source]}
                      </span>
                    </div>
                    
                    <p className="text-sm text-muted-foreground">
                      {item.count} {sourceLabels[item.source]}{item.count !== 1 ? 's' : ''} in the last 7 days
                    </p>
                    
                    {loadingDetails && selectedBubble === item.label ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      </div>
                    ) : bubbleDetails && selectedBubble === item.label && bubbleDetails.recentMentions.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Recent mentions
                        </p>
                        {bubbleDetails.recentMentions.map((mention, i) => (
                          <div key={i} className="bg-muted/30 rounded-lg p-2.5">
                            <p className="text-sm text-foreground line-clamp-2">
                              "{mention.snippet}"
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {mention.date}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-2 text-sm text-muted-foreground/70 text-center">
                        Tap to load recent mentions
                      </div>
                    )}
                    
                    {item.source === 'coach' && (
                      <button
                        onClick={() => navigate('/coach', { 
                          state: { 
                            initialPrompt: `I'd like to explore the theme of "${item.label}" that's been coming up in our conversations.`,
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
      
      {/* Relationship indicator */}
      {relationships.length > 0 && (
        <p className="text-center text-xs text-muted-foreground/60">
          Dotted lines show related themes
        </p>
      )}
    </div>
  );
};

export default InnerWorldBubbles;
