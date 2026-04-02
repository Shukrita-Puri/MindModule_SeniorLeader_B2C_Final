import { useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { ChatCircle, X } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

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

interface ThemeRelationship {
  from: string;
  to: string;
  strength: number;
  type?: string;
}

interface NodeSummary {
  keyword: string;
  totalCount: number;
  sources: { coach: number; practice: number; wins: number; checkins: number };
  recentDate: string;
  aiSummary: string;
  connectedThemes: { theme: string; relationshipType: string }[];
}

interface InnerWorldBubblesProps {
  items: UnifiedBubbleData[];
  relationships?: ThemeRelationship[];
  emptyMessage?: string;
  onBubbleClick?: (keyword: string) => Promise<any>;
  onNodeSummary?: (keyword: string) => Promise<NodeSummary | null>;
}

const sourceLabels: Record<string, string> = {
  coach: 'Coach',
  practice: 'Practice',
  wins: 'Wins',
  checkins: 'Check-ins'
};

const truncateTheme = (text: string, maxLen = 18): string =>
  text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;

const InnerWorldBubbles = ({ 
  items, 
  relationships = [],
  emptyMessage = 'Complete check-ins, practices, and coach chats to see patterns emerge.',
  onNodeSummary
}: InnerWorldBubblesProps) => {
  const navigate = useNavigate();
  const [selectedItem, setSelectedItem] = useState<UnifiedBubbleData | null>(null);
  const [nodeSummary, setNodeSummary] = useState<NodeSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [hoveredLine, setHoveredLine] = useState<string | null>(null);

  // Cap at 8 nodes, sorted by weight
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => b.weight - a.weight).slice(0, 8);
  }, [items]);

  // SVG viewBox – taller to prevent overlap
  const svgWidth = 420;
  const svgHeight = 480;

  // Layout slots spread wider with more vertical room
  const layoutSlots = useMemo(() => [
    { xFrac: 0.50, yFrac: 0.05 },
    { xFrac: 0.15, yFrac: 0.20 },
    { xFrac: 0.80, yFrac: 0.22 },
    { xFrac: 0.10, yFrac: 0.42 },
    { xFrac: 0.70, yFrac: 0.40 },
    { xFrac: 0.40, yFrac: 0.58 },
    { xFrac: 0.85, yFrac: 0.62 },
    { xFrac: 0.22, yFrac: 0.80 },
  ], []);

  // Node positioning with collision detection for labels
  const nodePositions = useMemo(() => {
    const count = sortedItems.length;
    if (count === 0) return [];

    const padX = 20;
    const padY = 25;
    const usableW = svgWidth - padX * 2;
    const usableH = svgHeight - padY * 2;
    const avgCharW = 7.5;

    // Initial positions
    const positions = sortedItems.map((item, i) => {
      const nodeR = 6 + item.weight * 10;
      const slot = layoutSlots[i] || { xFrac: 0.5, yFrac: 0.5 };
      const jX = ((i * 17) % 13) - 6;
      const jY = ((i * 11) % 9) - 4;
      const x = Math.max(padX + nodeR, Math.min(svgWidth - padX - nodeR, padX + usableW * slot.xFrac + jX));
      const y = Math.max(padY + nodeR, Math.min(svgHeight - padY - nodeR, padY + usableH * slot.yFrac + jY));
      const fontSize = Math.round(13 + item.weight * 4);
      const labelRight = x < svgWidth * 0.55;
      const labelX = labelRight ? x + nodeR + 10 : x - nodeR - 10;
      const labelW = truncateTheme(item.theme).length * avgCharW;
      const labelH = fontSize + 16; // theme + entry count line

      return { x, y, radius: nodeR, fontSize, labelRight, labelX, labelW, labelH };
    });

    // Collision detection – nudge overlapping labels vertically
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];

        // Compute label bounding boxes (approximate)
        const aLeft = a.labelRight ? a.labelX : a.labelX - a.labelW;
        const aRight = a.labelRight ? a.labelX + a.labelW : a.labelX;
        const aTop = a.y - a.fontSize;
        const aBottom = a.y + a.labelH - a.fontSize;

        const bLeft = b.labelRight ? b.labelX : b.labelX - b.labelW;
        const bRight = b.labelRight ? b.labelX + b.labelW : b.labelX;
        const bTop = b.y - b.fontSize;
        const bBottom = b.y + b.labelH - b.fontSize;

        const hOverlap = aLeft < bRight && aRight > bLeft;
        const vOverlap = aTop < bBottom && aBottom > bTop;

        if (hOverlap && vOverlap) {
          const nudge = aBottom - bTop + 8;
          positions[j] = {
            ...positions[j],
            y: Math.min(svgHeight - padY - positions[j].radius, positions[j].y + nudge)
          };
        }
      }
    }

    return positions;
  }, [sortedItems, svgWidth, svgHeight, layoutSlots]);

  // Connection paths
  const connectionPaths = useMemo(() => {
    if (relationships.length === 0 || nodePositions.length === 0) return [];

    return relationships.slice(0, 8).map((rel, index) => {
      const fromIdx = sortedItems.findIndex(n => n.theme.toLowerCase() === rel.from.toLowerCase());
      const toIdx = sortedItems.findIndex(n => n.theme.toLowerCase() === rel.to.toLowerCase());
      if (fromIdx === -1 || toIdx === -1) return null;

      const from = nodePositions[fromIdx];
      const to = nodePositions[toIdx];
      if (!from || !to) return null;

      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offset = Math.min(dist * 0.3, 60);
      const perpX = dist > 0 ? (-dy / dist) * offset : 0;
      const perpY = dist > 0 ? (dx / dist) * offset : 0;
      const cx = midX + perpX;
      const cy = midY + perpY;

      const key = `${rel.from}-${rel.to}-${index}`;
      const labelX = (from.x + 2 * cx + to.x) / 4;
      const labelY = (from.y + 2 * cy + to.y) / 4;

      return {
        path: `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`,
        strength: rel.strength,
        type: rel.type || 'often co-occur',
        key,
        labelX,
        labelY,
      };
    }).filter(Boolean) as { path: string; strength: number; type: string; key: string; labelX: number; labelY: number }[];
  }, [relationships, nodePositions, sortedItems]);

  const handleNodeClick = useCallback(async (item: UnifiedBubbleData) => {
    setSelectedItem(item);
    setNodeSummary(null);
    if (onNodeSummary) {
      setLoadingSummary(true);
      try {
        const summary = await onNodeSummary(item.theme);
        setNodeSummary(summary);
      } catch (error) {
        console.error('Failed to fetch node summary:', error);
      } finally {
        setLoadingSummary(false);
      }
    }
  }, [onNodeSummary]);

  const closeModal = () => { setSelectedItem(null); setNodeSummary(null); };

  const getSourceLine = (sources: UnifiedBubbleData['sources']): string => {
    const parts: string[] = [];
    if (sources.checkins > 0) parts.push(`${sources.checkins} check-in${sources.checkins > 1 ? 's' : ''}`);
    if (sources.coach > 0) parts.push(`${sources.coach} coach session${sources.coach > 1 ? 's' : ''}`);
    if (sources.practice > 0) parts.push(`${sources.practice} practice${sources.practice > 1 ? 's' : ''}`);
    if (sources.wins > 0) parts.push(`${sources.wins} win${sources.wins > 1 ? 's' : ''}`);
    return parts.join(' · ');
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-sm text-muted-foreground max-w-xs">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* SVG Node-and-Line Graph */}
      <svg 
        width="100%" 
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="overflow-visible mx-auto block"
      >
        {/* Connection lines */}
        {connectionPaths.map((conn) => (
          <g 
            key={conn.key}
            onMouseEnter={() => setHoveredLine(conn.key)}
            onMouseLeave={() => setHoveredLine(null)}
            className="cursor-default"
          >
            <path
              d={conn.path}
              fill="none"
              stroke="#8B7D6B"
              strokeWidth={1}
              strokeOpacity={0.18 + conn.strength * 0.22}
              strokeLinecap="round"
            />
            <path
              d={conn.path}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
            />
            {hoveredLine === conn.key && (
              <g>
                <rect
                  x={conn.labelX - 40}
                  y={conn.labelY - 10}
                  width={80}
                  height={16}
                  rx={4}
                  fill="hsl(var(--card))"
                  stroke="hsl(var(--border))"
                  strokeWidth={0.5}
                  opacity={0.95}
                />
                <text
                  x={conn.labelX}
                  y={conn.labelY + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="hsl(var(--muted-foreground))"
                  fontSize="9"
                  fontWeight="500"
                >
                  {conn.type}
                </text>
              </g>
            )}
          </g>
        ))}

        {/* Nodes */}
        {sortedItems.map((item, index) => {
          const pos = nodePositions[index];
          if (!pos) return null;
          const anchor = pos.labelRight ? 'start' : 'end';
          const displayTheme = truncateTheme(item.theme);

          return (
            <g 
              key={`${item.theme}-${index}`}
              onClick={() => handleNodeClick(item)}
              className="cursor-pointer"
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={pos.radius}
                fill="#8B7D6B"
                fillOpacity={0.35 + item.weight * 0.35}
                className="transition-all duration-300 hover:fill-opacity-80"
                style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
              />
              <text
                x={pos.labelX}
                y={pos.y - 2}
                textAnchor={anchor}
                dominantBaseline="auto"
                fill="hsl(var(--foreground))"
                fontSize={pos.fontSize}
                fontWeight="600"
                letterSpacing="-0.01em"
                className="pointer-events-none select-none"
              >
                {displayTheme}
              </text>
              <text
                x={pos.labelX}
                y={pos.y + pos.fontSize}
                textAnchor={anchor}
                dominantBaseline="auto"
                fill="hsl(var(--muted-foreground))"
                fontSize="11"
                className="pointer-events-none select-none"
              >
                {item.totalCount} {item.totalCount === 1 ? 'entry' : 'entries'}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Rich Summary Panel (Modal) */}
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
            
            <div className="space-y-5">
              <div>
                <h4 className="font-semibold text-foreground text-lg">{selectedItem.theme}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Appears in: {getSourceLine(selectedItem.sources)}
                </p>
                {nodeSummary?.recentDate && (
                  <p className="text-xs text-muted-foreground">
                    Most recent: {nodeSummary.recentDate}
                  </p>
                )}
              </div>

              {loadingSummary ? (
                <div className="space-y-3">
                  <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What this theme reveals</h5>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-4/6" />
                  </div>
                </div>
              ) : nodeSummary?.aiSummary ? (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What this theme reveals</h5>
                  <p className="text-sm text-foreground leading-relaxed">
                    {nodeSummary.aiSummary}
                  </p>
                </div>
              ) : null}

              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Where it shows up most</h5>
                <div className="flex flex-wrap gap-2">
                  {(['checkins', 'coach', 'practice', 'wins'] as const)
                    .filter(s => selectedItem.sources[s] > 0)
                    .sort((a, b) => selectedItem.sources[b] - selectedItem.sources[a])
                    .map(source => (
                      <span key={source} className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-2 py-1">
                        {sourceLabels[source]} ({selectedItem.sources[source]})
                      </span>
                    ))}
                </div>
              </div>

              {nodeSummary?.connectedThemes && nodeSummary.connectedThemes.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Connected to</h5>
                  <div className="space-y-1.5">
                    {nodeSummary.connectedThemes.map((ct, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="text-xs text-muted-foreground capitalize">{ct.relationshipType}</span>
                        <span className="text-foreground">→</span>
                        <span className="text-foreground font-medium">{ct.theme}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
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
    </div>
  );
};

export default InnerWorldBubbles;
