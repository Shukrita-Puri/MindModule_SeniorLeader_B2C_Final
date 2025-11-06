import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContentTypeData {
  contentType: string;
  count: number;
  percentage: number;
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number;
}

interface EnergyPatternTrend {
  pattern: string;
  current: number;
  previous: number;
  lastMonth: number;
  insight: string;
}

const ContentTypeAnalysis = () => {
  const [contentData, setContentData] = useState<ContentTypeData[]>([]);
  const [trendInsight, setTrendInsight] = useState<EnergyPatternTrend | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    // Load from localStorage on mount
    const savedState = localStorage.getItem('insight-collapse-content-type');
    if (savedState !== null) {
      setIsOpen(savedState === 'true');
    }

    const practiceHistory = JSON.parse(localStorage.getItem("practiceHistory") || "[]");
    
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const lastMonthSameTime = new Date(now.getTime() - 42 * 24 * 60 * 60 * 1000);
    
    // Current 2 weeks
    const currentPeriod = practiceHistory.filter((entry: any) => 
      new Date(entry.completedAt) >= twoWeeksAgo
    );
    
    // Previous 2 weeks
    const previousPeriod = practiceHistory.filter((entry: any) => {
      const date = new Date(entry.completedAt);
      return date >= fourWeeksAgo && date < twoWeeksAgo;
    });
    
    // Same period last month
    const lastMonthPeriod = practiceHistory.filter((entry: any) => {
      const date = new Date(entry.completedAt);
      return date >= lastMonthSameTime && date < fourWeeksAgo;
    });
    
    // Analyze content types
    const typeCount: Record<string, number> = {
      soundbath: 0,
      'guided-practice': 0,
      'micro-practice': 0
    };
    
    const prevTypeCount: Record<string, number> = {
      soundbath: 0,
      'guided-practice': 0,
      'micro-practice': 0
    };
    
    currentPeriod.forEach((entry: any) => {
      if (entry.contentType && typeCount[entry.contentType] !== undefined) {
        typeCount[entry.contentType]++;
      }
    });
    
    previousPeriod.forEach((entry: any) => {
      if (entry.contentType && prevTypeCount[entry.contentType] !== undefined) {
        prevTypeCount[entry.contentType]++;
      }
    });
    
    const total = currentPeriod.length || 1;
    const contentTypeData: ContentTypeData[] = Object.entries(typeCount).map(([type, count]) => {
      const prevCount = prevTypeCount[type] || 0;
      const percentageChange = prevCount > 0 ? ((count - prevCount) / prevCount) * 100 : 0;
      const trend: 'up' | 'down' | 'stable' = percentageChange > 5 ? 'up' : percentageChange < -5 ? 'down' : 'stable';
      
      return {
        contentType: type === 'guided-practice' ? 'Guided Practice' : type === 'micro-practice' ? 'Micro Practice' : 'Soundbath',
        count,
        percentage: Math.round((count / total) * 100),
        trend,
        trendPercentage: Math.round(Math.abs(percentageChange))
      };
    });
    
    setContentData(contentTypeData);
    
    // Analyze stress patterns (pause sessions)
    const currentPauseCount = currentPeriod.filter((e: any) => e.outcome === 'pause').length;
    const previousPauseCount = previousPeriod.filter((e: any) => e.outcome === 'pause').length;
    const lastMonthPauseCount = lastMonthPeriod.filter((e: any) => e.outcome === 'pause').length;
    
    let insight = '';
    if (currentPauseCount > 8) {
      const vsLastMonth = lastMonthPauseCount > 0 
        ? Math.round(((currentPauseCount - lastMonthPauseCount) / lastMonthPauseCount) * 100)
        : 0;
      
      if (vsLastMonth > 30) {
        insight = `You've completed ${currentPauseCount} 'Pause' sessions in the past 2 weeks, suggesting sustained stress. This is ${vsLastMonth}% higher than the same period last month.`;
      } else if (vsLastMonth < -30) {
        insight = `You've completed ${currentPauseCount} 'Pause' sessions in the past 2 weeks. This is ${Math.abs(vsLastMonth)}% lower than last month — great progress!`;
      } else {
        insight = `You've completed ${currentPauseCount} 'Pause' sessions in the past 2 weeks, suggesting sustained stress. Last month same time: ${lastMonthPauseCount} sessions.`;
      }
    } else if (currentPauseCount < 3 && previousPauseCount > 8) {
      insight = `Your stress has significantly decreased: only ${currentPauseCount} 'Pause' sessions this period vs ${previousPauseCount} last period.`;
    }
    
    if (insight) {
      setTrendInsight({
        pattern: 'pause',
        current: currentPauseCount,
        previous: previousPauseCount,
        lastMonth: lastMonthPauseCount,
        insight
      });
    }
  }, []);

  const handleToggle = (newState: boolean) => {
    setIsOpen(newState);
    localStorage.setItem('insight-collapse-content-type', newState.toString());
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base md:text-lg">Practice Type Distribution</CardTitle>
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
          <CardContent className="space-y-6 p-4 md:p-6">
            {contentData.length === 0 || contentData.every(d => d.count === 0) ? (
              <p className="text-xs md:text-sm text-muted-foreground text-center py-8">
                Complete practices to see your content type distribution
              </p>
            ) : (
              <>
                {/* Content Type Bars */}
                <div className="space-y-4">
                  {contentData.map((item) => (
                    <div key={item.contentType} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs md:text-sm font-medium">{item.contentType}</span>
                          {item.trend !== 'stable' && (
                            <span className={cn(
                              "text-xs flex items-center gap-1",
                              item.trend === 'up' ? "text-green-500" : "text-red-500"
                            )}>
                              {item.trend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {item.trendPercentage}%
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
                          <span>{item.count} sessions</span>
                          <span className="font-semibold text-foreground">{item.percentage}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-secondary/20 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all duration-500",
                            item.contentType === 'Soundbath' && "bg-primary",
                            item.contentType === 'Guided Practice' && "bg-gold",
                            item.contentType === 'Micro Practice' && "bg-accent"
                          )}
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Stress Awareness Insight */}
                {trendInsight && (
                  <div className="mt-6 p-4 bg-muted/30 rounded-lg border border-border">
                    <h4 className="text-xs md:text-sm font-semibold mb-2 flex items-center gap-2">
                      <Minus className="h-4 w-4 text-saffron" />
                      Energy Pattern Insight
                    </h4>
                    <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                      {trendInsight.insight}
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default ContentTypeAnalysis;
