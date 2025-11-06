import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";

interface EnergyData {
  state: string;
  count: number;
  percentage: number;
}

interface EnergyDistributionChartProps {
  timeRange?: "week" | "month" | "quarter";
  comparisonMode?: boolean;
}

const EnergyDistributionChart = ({ 
  timeRange = "week", 
  comparisonMode = false 
}: EnergyDistributionChartProps) => {
  const [data, setData] = useState<EnergyData[]>([]);
  const [comparisonData, setComparisonData] = useState<EnergyData[]>([]);

  useEffect(() => {
    const calculateDistribution = (history: any[]) => {
      const outcomeCounts: Record<string, number> = {};
      history.forEach((entry: any) => {
        const outcome = entry.outcome || "unknown";
        outcomeCounts[outcome] = (outcomeCounts[outcome] || 0) + 1;
      });
      
      const total = history.length || 1;
      return Object.entries(outcomeCounts).map(([state, count]) => ({
        state: state.charAt(0).toUpperCase() + state.slice(1),
        count,
        percentage: Math.round((count / total) * 100)
      }));
    };

    // Load practice history from localStorage
    const practiceHistory = JSON.parse(localStorage.getItem("practiceHistory") || "[]");
    const now = new Date();
    const daysToFilter = timeRange === "week" ? 7 : timeRange === "month" ? 30 : 90;
    const cutoffDate = new Date(now.getTime() - daysToFilter * 24 * 60 * 60 * 1000);
    
    const currentPeriod = practiceHistory.filter((entry: any) => 
      new Date(entry.completedAt) >= cutoffDate
    );
    
    setData(calculateDistribution(currentPeriod));
    
    if (comparisonMode) {
      const previousCutoffDate = new Date(cutoffDate.getTime() - daysToFilter * 24 * 60 * 60 * 1000);
      const previousPeriod = practiceHistory.filter((entry: any) => {
        const date = new Date(entry.completedAt);
        return date >= previousCutoffDate && date < cutoffDate;
      });
      setComparisonData(calculateDistribution(previousPeriod));
    }
  }, [timeRange, comparisonMode]);

  const getStateColor = (state: string) => {
    const lower = state.toLowerCase();
    if (lower.includes("power")) return "bg-accent";
    if (lower.includes("pause")) return "bg-primary";
    if (lower.includes("presence")) return "bg-forest";
    if (lower.includes("calm")) return "bg-blue-500";
    return "bg-gold";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Energy State Distribution
          {comparisonMode && <span className="text-sm font-normal text-muted-foreground ml-2">(Current vs Previous)</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No practice data yet. Complete sessions to see your distribution.
          </p>
        ) : (
          <>
            {data.map((item) => {
              const prevItem = comparisonData.find(d => d.state === item.state);
              const change = prevItem ? item.percentage - prevItem.percentage : 0;
              
              return (
                <div key={item.state} className="space-y-2 group">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.state}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{item.percentage}%</span>
                      {comparisonMode && change !== 0 && (
                        <span className={`text-xs ${change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {change > 0 ? '+' : ''}{change}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="relative h-2 bg-secondary/20 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getStateColor(item.state)} transition-all duration-500`}
                      style={{ width: `${item.percentage}%` }}
                    />
                    {comparisonMode && prevItem && (
                      <div
                        className="absolute top-0 h-full border-r-2 border-muted-foreground/30"
                        style={{ left: `${prevItem.percentage}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default EnergyDistributionChart;
