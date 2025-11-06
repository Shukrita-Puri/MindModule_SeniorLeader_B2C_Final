import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DecisionQuality {
  week: string;
  quality: number;
  consistency: number;
}

interface DecisionQualityChartProps {
  timeRange?: "week" | "month" | "quarter";
  comparisonMode?: boolean;
}

const DecisionQualityChart = ({ 
  timeRange = "week",
  comparisonMode = false 
}: DecisionQualityChartProps) => {
  const [data, setData] = useState<DecisionQuality[]>([]);
  const [hoveredWeek, setHoveredWeek] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const savedState = localStorage.getItem('insight-collapse-decision-quality');
    if (savedState !== null) {
      setIsOpen(savedState === 'true');
    }

    const practiceHistory = JSON.parse(localStorage.getItem("practiceHistory") || "[]");
    const now = new Date();
    const daysToFilter = timeRange === "week" ? 7 : timeRange === "month" ? 30 : 90;
    const cutoffDate = new Date(now.getTime() - daysToFilter * 24 * 60 * 60 * 1000);
    
    const filteredHistory = practiceHistory.filter((entry: any) => 
      new Date(entry.completedAt) >= cutoffDate
    );
    
    // Group by week
    const weeklyData: Record<string, { scores: number[]; days: Set<string> }> = {};
    
    filteredHistory.forEach((entry: any) => {
      const date = new Date(entry.completedAt);
      const weekKey = `Week ${Math.floor(date.getDate() / 7) + 1}`;
      
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = { scores: [], days: new Set() };
      }
      
      const qualityMap: Record<string, number> = {
        "power-up": 90,
        "ready": 85,
        "presence": 80,
        "calm": 75,
        "pause": 70
      };
      
      weeklyData[weekKey].scores.push(qualityMap[entry.outcome] || 50);
      weeklyData[weekKey].days.add(date.toDateString());
    });
    
    const chartData = Object.entries(weeklyData).map(([week, data]) => ({
      week,
      quality: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
      consistency: Math.round((data.days.size / 7) * 100)
    }));
    
    const weeksToShow = timeRange === "week" ? 4 : timeRange === "month" ? 8 : 12;
    setData(chartData.slice(-weeksToShow));
  }, [timeRange]);

  const handleToggle = (newState: boolean) => {
    setIsOpen(newState);
    localStorage.setItem('insight-collapse-decision-quality', newState.toString());
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base md:text-lg">Weekly Performance Trends</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleToggle(!isOpen)}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
          </Button>
        </div>
      </CardHeader>
      <Collapsible open={isOpen} onOpenChange={handleToggle}>
        <CollapsibleContent>
          <CardContent className="p-4 md:p-6">
            {data.length === 0 ? (
              <p className="text-xs md:text-sm text-muted-foreground text-center py-8">
                Practice for multiple weeks to see quality trends
              </p>
            ) : (
              <div className="space-y-6">
                {data.map((item) => (
                  <div 
                    key={item.week} 
                    className="space-y-2 p-3 rounded-lg transition-colors hover:bg-accent/5 cursor-pointer"
                    onMouseEnter={() => setHoveredWeek(item.week)}
                    onMouseLeave={() => setHoveredWeek(null)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs md:text-sm font-medium">{item.week}</span>
                      {hoveredWeek === item.week ? (
                        <div className="text-xs space-y-1 animate-in fade-in-0 slide-in-from-right-2">
                          <p className="text-gold text-sm md:text-base">Quality: {item.quality}/100</p>
                          <p className="text-primary text-sm md:text-base">Consistency: {item.consistency}%</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Q: {item.quality} | C: {item.consistency}%
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="h-2 bg-secondary/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gold transition-all duration-500 hover:bg-gold/80"
                            style={{ 
                              width: `${item.quality}%`,
                              transform: hoveredWeek === item.week ? 'scaleY(1.2)' : 'scaleY(1)',
                              transformOrigin: 'left'
                            }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Quality</p>
                      </div>
                      <div>
                        <div className="h-2 bg-secondary/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-500 hover:bg-primary/80"
                            style={{ 
                              width: `${item.consistency}%`,
                              transform: hoveredWeek === item.week ? 'scaleY(1.2)' : 'scaleY(1)',
                              transformOrigin: 'left'
                            }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Consistency</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default DecisionQualityChart;
