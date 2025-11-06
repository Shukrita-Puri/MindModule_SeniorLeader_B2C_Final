import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface AlignmentPoint {
  date: string;
  score: number;
  practices: number;
}

interface AlignmentTimelineProps {
  timeRange?: "week" | "month" | "quarter";
  comparisonMode?: boolean;
}

const AlignmentTimeline = ({ 
  timeRange = "week",
  comparisonMode = false
}: AlignmentTimelineProps) => {
  const [data, setData] = useState<AlignmentPoint[]>([]);
  const [comparisonData, setComparisonData] = useState<AlignmentPoint[]>([]);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const savedState = localStorage.getItem('insight-collapse-alignment');
    if (savedState !== null) {
      setIsOpen(savedState === 'true');
    }

    const processTimeline = (history: any[], daysBack: number) => {
      const dailyData: Record<string, { totalScore: number; count: number }> = {};
      
      history.forEach((entry: any) => {
        const date = new Date(entry.completedAt).toLocaleDateString();
        if (!dailyData[date]) {
          dailyData[date] = { totalScore: 0, count: 0 };
        }
        
        const outcomeScore: Record<string, number> = {
          "power-up": 85,
          "ready": 80,
          "presence": 75,
          "calm": 70,
          "pause": 65
        };
        
        dailyData[date].totalScore += outcomeScore[entry.outcome] || 50;
        dailyData[date].count += 1;
      });
      
      return Object.entries(dailyData)
        .map(([date, stats]) => ({
          date,
          score: Math.round(stats.totalScore / stats.count),
          practices: stats.count
        }))
        .slice(-daysBack);
    };

    // Load practice history
    const practiceHistory = JSON.parse(localStorage.getItem("practiceHistory") || "[]");
    const now = new Date();
    const daysToShow = timeRange === "week" ? 7 : timeRange === "month" ? 30 : 90;
    const cutoffDate = new Date(now.getTime() - daysToShow * 24 * 60 * 60 * 1000);
    
    const currentPeriod = practiceHistory.filter((entry: any) => 
      new Date(entry.completedAt) >= cutoffDate
    );
    
    setData(processTimeline(currentPeriod, daysToShow));
    
    if (comparisonMode) {
      const previousCutoffDate = new Date(cutoffDate.getTime() - daysToShow * 24 * 60 * 60 * 1000);
      const previousPeriod = practiceHistory.filter((entry: any) => {
        const date = new Date(entry.completedAt);
        return date >= previousCutoffDate && date < cutoffDate;
      });
      setComparisonData(processTimeline(previousPeriod, daysToShow));
    }
  }, [timeRange, comparisonMode]);

  const maxScore = Math.max(...data.map(d => d.score), 1);
  const avgScore = data.length > 0 
    ? Math.round(data.reduce((sum, d) => sum + d.score, 0) / data.length)
    : 0;

  const handleToggle = (newState: boolean) => {
    setIsOpen(newState);
    localStorage.setItem('insight-collapse-alignment', newState.toString());
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base md:text-lg">Alignment Timeline</CardTitle>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Avg: <span className="text-xl md:text-2xl text-gold font-bold">{avgScore}</span>
              {comparisonMode && comparisonData.length > 0 && (
                <span className="ml-2">
                  vs Previous: <span className="text-primary font-semibold">
                    {Math.round(comparisonData.reduce((sum, d) => sum + d.score, 0) / comparisonData.length)}
                  </span>
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
              disabled={zoomLevel <= 0.5}
            >
              <ZoomOut className="h-3 w-3 md:h-4 md:w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.25))}
              disabled={zoomLevel >= 2}
            >
              <ZoomIn className="h-3 w-3 md:h-4 md:w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleToggle(!isOpen)}
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <Collapsible open={isOpen} onOpenChange={handleToggle}>
        <CollapsibleContent>
          <CardContent className="p-4 md:p-6">
            {data.length === 0 ? (
              <p className="text-xs md:text-sm text-muted-foreground text-center py-8">
                Complete practices over multiple days to see your alignment timeline
              </p>
            ) : (
              <div className="relative overflow-x-auto h-32 md:h-48" style={{ height: `${(window.innerWidth < 768 ? 128 : 192) * zoomLevel}px` }}>
            <svg 
              className="w-full h-full" 
              viewBox="0 0 100 100" 
              preserveAspectRatio="none"
              style={{ minWidth: `${100 * zoomLevel}%` }}
            >
              {/* Grid lines */}
              {[0, 25, 50, 75, 100].map((y) => (
                <line
                  key={y}
                  x1="0"
                  y1={100 - y}
                  x2="100"
                  y2={100 - y}
                  stroke="currentColor"
                  strokeWidth="0.2"
                  className="text-border"
                />
              ))}
              
              {/* Line graph */}
              <polyline
                points={data.map((point, i) => {
                  const x = (i / (data.length - 1)) * 100;
                  const y = 100 - (point.score / maxScore) * 100;
                  return `${x},${y}`;
                }).join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-gold"
              />
              
              {/* Comparison line */}
              {comparisonMode && comparisonData.length > 0 && (
                <polyline
                  points={comparisonData.map((point, i) => {
                    const x = (i / (comparisonData.length - 1)) * 100;
                    const y = 100 - (point.score / maxScore) * 100;
                    return `${x},${y}`;
                  }).join(" ")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.5"
                  strokeDasharray="2,2"
                  className="text-muted-foreground"
                />
              )}
              
              {/* Points */}
              {data.map((point, i) => {
                const x = (i / (data.length - 1)) * 100;
                const y = 100 - (point.score / maxScore) * 100;
                return (
                  <g key={i}>
                    <circle
                      cx={x}
                      cy={y}
                      r={hoveredPoint === i ? "2" : "1"}
                      fill="currentColor"
                      className="text-gold cursor-pointer transition-all"
                      onMouseEnter={() => setHoveredPoint(i)}
                      onMouseLeave={() => setHoveredPoint(null)}
                    />
                    {hoveredPoint === i && (
                      <foreignObject x={x - 25} y={y - 35} width="50" height="30">
                        <div className="bg-popover border border-border rounded px-2 py-1 text-xs text-center shadow-lg">
                          <p className="font-semibold text-foreground">{point.score}</p>
                          <p className="text-muted-foreground text-[10px]">{point.practices} sessions</p>
                        </div>
                      </foreignObject>
                    )}
                  </g>
                );
              })}
            </svg>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default AlignmentTimeline;
