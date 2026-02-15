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

  // SVG dimensions
  const svgWidth = 360;
  const svgHeight = 300;
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;

  // Deterministic node positioning — organic circular spread
  const nodePositions = useMemo(() => {
    const count = sortedItems.length;
    if (count === 0) return [];

    return sortedItems.map((item, i) => {
      const radius = item.weight > 0.6 ? 50 + (i * 15) : 70 + (i * 18);
      const angleOffset = Math.PI * 0.3;
      const angle = angleOffset + (i / count) * Math.PI * 2 + (i % 2 === 0 ? 0.15 : -0.1);
      const jitterX = ((i * 17) % 11) - 5;
      const jitterY = ((i * 13) % 9) - 4;
      
      let x = centerX + Math.cos(angle) * Math.min(radius, svgWidth * 0.35) + jitterX;
      let y = centerY + Math.sin(angle) * Math.min(radius, svgHeight * 0.32) + jitterY;
      
      // Keep first (largest) node near center
      if (i === 0) {
        x = centerX + jitterX * 0.5;
        y = centerY + jitterY * 0.5;
      }

      // Clamp to SVG bounds with padding
      const nodeR = 4 + item.weight * 8;
      x = Math.max(nodeR + 50, Math.min(svgWidth - nodeR - 50, x));
      y = Math.max(nodeR + 20, Math.min(svgHeight - nodeR - 30, y));

      return { x, y, radius: nodeR };
    });
  }, [sortedItems, centerX, centerY, svgWidth, svgHeight]);

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
      const offset = Math.min(Math.abs(dx), Math.abs(dy)) * 0.25;
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
    <div className="space-y-2">
      {/* SVG Node-and-Line Graph */}
      <svg 
        width="100%" 
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="overflow-visible"
        style={{ minHeight: '250px' }}
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
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1.5}
              strokeOpacity={0.3 + conn.strength * 0.4}
              strokeDasharray="none"
            />
            {/* Wider invisible hit area for hover */}
            <path
              d={conn.path}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
            />
            {/* Hover label */}
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
          const fontSize = 12 + (item.weight * 4);
          const labelOffset = pos.radius + 6;

          return (
            <g 
              key={`${item.theme}-${index}`}
              onClick={() => handleNodeClick(item)}
              className="cursor-pointer"
              style={{
                animation: 'nodeEntrance 0.4s ease-out forwards',
                animationDelay: `${index * 60}ms`,
                opacity: 0,
              }}
            >
              {/* Node circle */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={pos.radius}
                fill="hsl(var(--primary))"
                fillOpacity={0.7 + item.weight * 0.3}
                className="transition-all duration-200 hover:fill-opacity-100"
              />
              {/* Subtle glow on hover */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={pos.radius + 3}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={1}
                strokeOpacity={0}
                className="transition-all duration-200"
                style={{ pointerEvents: 'none' }}
              />
              {/* Theme label */}
              <text
                x={pos.x}
                y={pos.y - labelOffset}
                textAnchor="middle"
                dominantBaseline="auto"
                fill="hsl(var(--foreground))"
                fontSize={fontSize}
                fontWeight="500"
                className="pointer-events-none select-none"
              >
                {item.theme}
              </text>
              {/* Entry count */}
              <text
                x={pos.x}
                y={pos.y - labelOffset + fontSize + 2}
                textAnchor="middle"
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
              {/* Header */}
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

              {/* What this theme reveals */}
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

              {/* Where it shows up most */}
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

              {/* Connected to */}
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

      {/* CSS for node entrance animation */}
      <style>{`
        @keyframes nodeEntrance {
          from { opacity: 0; transform: scale(0.7); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default InnerWorldBubbles;
