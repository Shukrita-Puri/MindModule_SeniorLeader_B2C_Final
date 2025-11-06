import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";

interface DecisionQuality {
  week: string;
  quality: number;
  consistency: number;
}

const DecisionQualityChart = () => {
  const [data, setData] = useState<DecisionQuality[]>([]);

  useEffect(() => {
    // Load practice history
    const practiceHistory = JSON.parse(localStorage.getItem("practiceHistory") || "[]");
    
    // Group by week
    const weeklyData: Record<string, { scores: number[]; days: Set<string> }> = {};
    
    practiceHistory.forEach((entry: any) => {
      const date = new Date(entry.completedAt);
      const weekKey = `Week ${Math.floor(date.getDate() / 7) + 1}`;
      
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = { scores: [], days: new Set() };
      }
      
      // Quality based on outcome
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
    
    // Calculate averages
    const chartData = Object.entries(weeklyData).map(([week, data]) => ({
      week,
      quality: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
      consistency: Math.round((data.days.size / 7) * 100)
    }));
    
    setData(chartData.slice(-4)); // Last 4 weeks
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Performance Trends</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Practice for multiple weeks to see quality trends
          </p>
        ) : (
          <div className="space-y-6">
            {data.map((item) => (
              <div key={item.week} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.week}</span>
                  <span className="text-xs text-muted-foreground">
                    Quality: {item.quality} | Consistency: {item.consistency}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="h-2 bg-secondary/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gold transition-all duration-500"
                        style={{ width: `${item.quality}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Quality</p>
                  </div>
                  <div>
                    <div className="h-2 bg-secondary/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${item.consistency}%` }}
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
    </Card>
  );
};

export default DecisionQualityChart;
