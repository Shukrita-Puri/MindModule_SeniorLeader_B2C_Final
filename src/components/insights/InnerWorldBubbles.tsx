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

// Source labels for display
const sourceLabels: Record<string, string> = {
  coach: 'Coach',
  practice: 'Practice',
  wins: 'Wins',
  checkins: 'Check-ins'
};

// Inner Mastery-connected theme insights
const THEME_INSIGHTS: Record<string, string> = {
  'focus': `Focus patterns reveal your Self-Regulation capacity. When focus appears frequently, it signals your attention management systems are strengthening—critical for sustained executive performance.`,
  'presence': `Presence is foundational to Emotional Intelligence. Your repeated attention to being present suggests you're building the awareness that enables responsive (vs. reactive) leadership.`,
  'communication': `Communication themes reflect Emotional Intelligence development. Effective communication requires reading others' states and adapting your approach—a skill you're evidently practicing.`,
  'self-awareness': `Self-awareness is the cornerstone of all three Inner Mastery domains. Your attention to this theme suggests strong metacognitive development and growing emotional literacy.`,
  'energy': `Energy management is core Self-Regulation. Tracking energy patterns helps you optimize performance across different demands and supports sustainable high achievement.`,
  'growth': `Growth orientation builds Resilience. Each time you notice growth, you reinforce the neural pathways that frame challenges as opportunities rather than threats.`,
  'balance': `Balance themes indicate sophisticated Self-Regulation. You're attending to the interplay between output and recovery—essential for sustained high performance without burnout.`,
  'achievement': `Achievement patterns anchor success in your identity. This supports Resilience by building a track record your nervous system can reference during challenging times.`,
  'calm': `Calm reflects nervous system regulation—a core Self-Regulation indicator. Your attention to calm states suggests you're building vagal tone and stress recovery capacity.`,
  'clarity': `Clarity emerges when cognitive load is managed well. This theme suggests your Self-Regulation practices are creating mental space for strategic thinking.`,
  'confidence': `Confidence patterns reflect internal security. This Resilience marker indicates you're building the psychological foundation for taking calculated risks.`,
  'stress': `Awareness of stress is the first step to managing it. By tracking stress patterns, you're developing the Self-Regulation awareness that enables proactive intervention.`,
  'relationships': `Relationship themes indicate Emotional Intelligence focus. Your attention here suggests you're developing the social awareness that enables influence and connection.`,
  'boundaries': `Boundary awareness reflects mature Self-Regulation. Knowing where you end and others begin is essential for sustainable leadership and emotional health.`,
  'resilience': `You're explicitly building Resilience—the capacity to recover from setback. This meta-skill compounds over time, making you more adaptable.`,
};

const getThemeInsight = (theme: string): string => {
  const normalizedTheme = theme.toLowerCase();
  const insight = THEME_INSIGHTS[normalizedTheme];
  if (insight) return insight;
  
  // Default insight for unknown themes
  return `"${theme}" emerges as a recurring pattern in your inner world. Awareness of this theme builds Emotional Intelligence through deepening self-knowledge—the foundation of all inner mastery.`;
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
    // Initial update
    updatePositions();
    
    // Delayed update after bubble animations complete (60ms per bubble + 500ms margin)
    const animationDelay = (sortedItems.length * 60) + 500;
    const animationTimeout = setTimeout(updatePositions, animationDelay);
    
    // Additional delayed update for position settling
    const settleTimeout = setTimeout(updatePositions, animationDelay + 300);
    
    const resizeObserver = new ResizeObserver(updatePositions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    window.addEventListener('scroll', updatePositions);
    
    return () => {
      clearTimeout(animationTimeout);
      clearTimeout(settleTimeout);
      resizeObserver.disconnect();
      window.removeEventListener('scroll', updatePositions);
    };
  }, [sortedItems, updatePositions]);

  // Handle bubble click
  const handleBubbleClick = async (item: UnifiedBubbleData) => {
    setSelectedItem(item);
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

  const closeModal = () => {
    setSelectedItem(null);
    setBubbleDetails(null);
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

  // Filter meaningful mentions
  const getMeaningfulMentions = (mentions: BubbleDetails['recentMentions'] | undefined) => {
    if (!mentions) return [];
    return mentions.filter(m => !isGenericMention(m.snippet));
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
      <div ref={containerRef} className="relative min-h-[200px]">
        {/* Connection lines SVG - always render, use explicit dimensions */}
        <svg 
          className="absolute inset-0 pointer-events-none z-0 overflow-visible"
          style={{ width: '100%', height: '100%', minHeight: '200px' }}
          preserveAspectRatio="none"
        >
          {connectionPaths.map((connection) => connection && (
            <path
              key={connection.key}
              d={connection.path}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeOpacity={0.25 + connection.strength * 0.25}
              strokeDasharray="6 4"
              className="text-primary"
            />
          ))}
        </svg>
        
        {/* Bubbles with luxury glass morphism styling */}
        <div className="flex flex-wrap justify-center items-center gap-2.5 py-4 relative z-10">
          {sortedItems.map((item, index) => {
            const size = getBubbleSize(item.weight);
            const isLarge = item.weight > 0.6;
            const isMedium = item.weight > 0.3;
            
            return (
              <div
                key={`${item.theme}-${index}`}
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
            );
          })}
        </div>
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
            className="relative bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-lg max-h-[80vh] overflow-y-auto"
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
              {/* Theme header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary/15">
                  <span className="text-sm font-semibold text-primary">
                    {selectedItem.theme.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground text-lg">
                    {selectedItem.theme}
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    {selectedItem.totalCount} mentions
                  </span>
                </div>
              </div>
              
              {/* Source breakdown */}
              <p className="text-xs text-muted-foreground">
                From: {getSourceBreakdown(selectedItem.sources)}
              </p>
              
              {/* Insight with border accent */}
              <div className="border-l-2 border-primary/30 pl-3">
                <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Insight
                </h5>
                <p className="text-sm text-foreground leading-relaxed">
                  {getThemeInsight(selectedItem.theme)}
                </p>
              </div>
              
              {/* Recent mentions */}
              {loadingDetails ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : bubbleDetails && getMeaningfulMentions(bubbleDetails.recentMentions).length > 0 ? (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Recent mentions
                  </h5>
                  {getMeaningfulMentions(bubbleDetails.recentMentions).slice(0, 2).map((mention, i) => (
                    <div key={i} className="bg-muted/50 rounded-xl p-3">
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
              ) : null}
              
              {/* Explore with coach button */}
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
