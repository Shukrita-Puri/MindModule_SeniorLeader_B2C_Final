import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { ChatCircle, X } from '@phosphor-icons/react';
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

const sourceLabels: Record<string, string> = {
  coach: 'Coach',
  practice: 'Practice',
  wins: 'Wins',
  checkins: 'Check-ins'
};

// Source dot colors
const sourceColors: Record<string, string> = {
  coach: 'bg-amber-400',
  practice: 'bg-blue-400',
  wins: 'bg-emerald-400',
  checkins: 'bg-violet-400'
};

const GENERIC_PATTERNS = [
  /here'?s one thing/i, /today i/i, /^i did$/i, /something good/i,
  /^win$/i, /^good day$/i, /^ok$/i, /^fine$/i,
];

const isGenericMention = (content: string): boolean => {
  if (content.length < 15) return true;
  return GENERIC_PATTERNS.some(pattern => pattern.test(content.trim()));
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
  const [selectedItem, setSelectedItem] = useState<UnifiedBubbleData | null>(null);
  const [bubbleDetails, setBubbleDetails] = useState<BubbleDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Bubble sizes: 64-96px
  const getBubbleSize = (weight: number) => 64 + (weight * 32);

  // Cap at 8 bubbles, sorted by weight
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => b.weight - a.weight).slice(0, 8);
  }, [items]);

  const updatePositions = useCallback(() => {
    if (!containerRef.current) return;
    const newPositions = new Map<string, DOMRect>();
    bubbleRefs.current.forEach((element, key) => {
      if (element) newPositions.set(key.toLowerCase(), element.getBoundingClientRect());
    });
    setBubblePositions(newPositions);
  }, []);

  useEffect(() => {
    updatePositions();
    const animationDelay = (sortedItems.length * 60) + 500;
    const t1 = setTimeout(updatePositions, animationDelay);
    const t2 = setTimeout(updatePositions, animationDelay + 300);
    
    const resizeObserver = new ResizeObserver(updatePositions);
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    window.addEventListener('scroll', updatePositions);
    
    return () => { clearTimeout(t1); clearTimeout(t2); resizeObserver.disconnect(); window.removeEventListener('scroll', updatePositions); };
  }, [sortedItems, updatePositions]);

  const handleBubbleClick = async (item: UnifiedBubbleData) => {
    setSelectedItem(item);
    setBubbleDetails(null);
    if (onBubbleClick) {
      setLoadingDetails(true);
      try {
        setBubbleDetails(await onBubbleClick(item.theme));
      } catch (error) {
        console.error('Failed to fetch bubble details:', error);
      } finally {
        setLoadingDetails(false);
      }
    }
  };

  const closeModal = () => { setSelectedItem(null); setBubbleDetails(null); };

  const getTopSource = (sources: UnifiedBubbleData['sources']): string => {
    const entries = Object.entries(sources).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return 'your reflections';
    return sourceLabels[entries[0][0]] || 'your reflections';
  };

  const getSourceBreakdown = (sources: UnifiedBubbleData['sources']) => {
    const parts: string[] = [];
    if (sources.coach > 0) parts.push(`${sources.coach} coach`);
    if (sources.practice > 0) parts.push(`${sources.practice} practice`);
    if (sources.wins > 0) parts.push(`${sources.wins} win${sources.wins > 1 ? 's' : ''}`);
    if (sources.checkins > 0) parts.push(`${sources.checkins} check-in${sources.checkins > 1 ? 's' : ''}`);
    return parts.join(', ');
  };

  const getMeaningfulMentions = (mentions: BubbleDetails['recentMentions'] | undefined) => {
    if (!mentions) return [];
    return mentions.filter(m => !isGenericMention(m.snippet));
  };

  // SVG connection paths with midpoint for labels
  const connectionPaths = useMemo(() => {
    if (!containerRef.current || relationships.length === 0 || bubblePositions.size === 0) return [];
    const containerRect = containerRef.current.getBoundingClientRect();
    
    return relationships.slice(0, 6).map((rel, index) => {
      const fromRect = bubblePositions.get(rel.from.toLowerCase());
      const toRect = bubblePositions.get(rel.to.toLowerCase());
      if (!fromRect || !toRect) return null;
      
      const x1 = fromRect.left + fromRect.width / 2 - containerRect.left;
      const y1 = fromRect.top + fromRect.height / 2 - containerRect.top;
      const x2 = toRect.left + toRect.width / 2 - containerRect.left;
      const y2 = toRect.top + toRect.height / 2 - containerRect.top;
      
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offset = Math.min(Math.abs(dx), Math.abs(dy)) * 0.3;
      const perpX = dist > 0 ? (-dy / dist) * offset : 0;
      const perpY = dist > 0 ? (dx / dist) * offset : 0;
      const cx = midX + perpX;
      const cy = midY + perpY;
      
      return {
        path: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`,
        strength: rel.strength,
        key: `${rel.from}-${rel.to}-${index}`,
        labelX: (x1 + 2 * cx + x2) / 4, // Point on quadratic curve at t=0.5
        labelY: (y1 + 2 * cy + y2) / 4,
        label: 'related',
      };
    }).filter(Boolean);
  }, [relationships, bubblePositions]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-sm text-muted-foreground max-w-xs">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div ref={containerRef} className="relative min-h-[200px]">
        {/* Connection lines with labels */}
        <svg 
          className="absolute inset-0 pointer-events-none z-0 overflow-visible"
          style={{ width: '100%', height: '100%', minHeight: '200px' }}
          preserveAspectRatio="none"
        >
          {connectionPaths.map((connection) => connection && (
            <g key={connection.key}>
              <path
                d={connection.path}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeOpacity={0.25 + connection.strength * 0.25}
                strokeDasharray="6 4"
                className="text-primary"
              />
              <text
                x={connection.labelX}
                y={connection.labelY - 6}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="9"
                opacity={0.5}
              >
                {connection.label}
              </text>
            </g>
          ))}
        </svg>
        
        {/* Bubbles */}
        <div className="flex flex-wrap justify-center items-center gap-2.5 py-4 relative z-10">
          {sortedItems.map((item, index) => {
            const size = getBubbleSize(item.weight);
            const isLarge = item.weight > 0.6;
            const isMedium = item.weight > 0.3;
            const activeSources = (['coach', 'practice', 'wins', 'checkins'] as const).filter(s => item.sources[s] > 0);
            
            return (
              <div
                key={`${item.theme}-${index}`}
                ref={(el) => { if (el) bubbleRefs.current.set(item.theme.toLowerCase(), el); }}
                onClick={() => handleBubbleClick(item)}
                className={cn(
                  "rounded-full flex flex-col items-center justify-center text-center cursor-pointer",
                  "bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5",
                  "border border-primary/20",
                  "shadow-[0_4px_20px_rgba(0,0,0,0.1),0_0_0_1px_rgba(255,255,255,0.1)_inset]",
                  "backdrop-blur-sm",
                  "hover:shadow-[0_8px_30px_rgba(0,0,0,0.15),0_0_20px_hsl(var(--primary)/0.1)]",
                  "hover:scale-105 transition-all duration-300",
                  "active:scale-100 relative overflow-hidden",
                  index % 3 === 0 && "mt-1",
                  index % 4 === 1 && "-mt-0.5",
                  index % 5 === 2 && "mt-2"
                )}
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  transform: `rotate(${(index % 5 - 2) * 1}deg)`,
                  animation: 'bubbleEntrance 0.4s ease-out forwards',
                  animationDelay: `${index * 60}ms`,
                  opacity: 0,
                }}
              >
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
                
                {/* Source indicator dots */}
                <div className="flex gap-1 mt-1 relative z-10">
                  {activeSources.map(source => (
                    <div 
                      key={source}
                      className={cn("w-1.5 h-1.5 rounded-full", sourceColors[source])}
                      title={sourceLabels[source]}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal */}
      {selectedItem && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div 
            className="relative bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-lg max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={closeModal} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors" aria-label="Close">
              <X size={18} />
            </button>
            
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary/15">
                  <span className="text-sm font-semibold text-primary">
                    {selectedItem.theme.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground text-lg">{selectedItem.theme}</h4>
                  <span className="text-xs text-muted-foreground">
                    {selectedItem.totalCount} mentions — mostly from {getTopSource(selectedItem.sources)}
                  </span>
                </div>
              </div>
              
              {/* Source breakdown */}
              <div className="flex flex-wrap gap-2">
                {(['coach', 'practice', 'wins', 'checkins'] as const).filter(s => selectedItem.sources[s] > 0).map(source => (
                  <span key={source} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className={cn("w-2 h-2 rounded-full", sourceColors[source])} />
                    {selectedItem.sources[source]} {sourceLabels[source]}
                  </span>
                ))}
              </div>
              
              {/* Recent mentions */}
              {loadingDetails ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : bubbleDetails && getMeaningfulMentions(bubbleDetails.recentMentions).length > 0 ? (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent mentions</h5>
                  {getMeaningfulMentions(bubbleDetails.recentMentions).slice(0, 2).map((mention, i) => (
                    <div key={i} className="bg-muted/50 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">{sourceLabels[mention.source]}</span>
                        <span className="text-[10px] text-muted-foreground">{mention.date}</span>
                      </div>
                      <p className="text-sm text-foreground line-clamp-2">"{mention.snippet}"</p>
                    </div>
                  ))}
                </div>
              ) : null}
              
              {/* Explore with coach */}
              <button
                onClick={() => {
                  closeModal();
                  navigate('/coach', { 
                    state: { 
                      initialPrompt: `I'd like to explore the theme of "${selectedItem.theme}" that's been coming up in my reflections.`,
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
          </div>
        </div>,
        document.body
      )}

      {/* CSS for bubble entrance animation */}
      <style>{`
        @keyframes bubbleEntrance {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default InnerWorldBubbles;
