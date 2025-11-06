import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";

interface EnergyData {
  state: string;
  count: number;
  percentage: number;
}

const EnergyDistributionChart = () => {
  const [data, setData] = useState<EnergyData[]>([]);

  useEffect(() => {
    // Load practice history from localStorage
    const practiceHistory = JSON.parse(localStorage.getItem("practiceHistory") || "[]");
    
    // Count outcomes
    const outcomeCounts: Record<string, number> = {};
    practiceHistory.forEach((entry: any) => {
      const outcome = entry.outcome || "unknown";
      outcomeCounts[outcome] = (outcomeCounts[outcome] || 0) + 1;
    });
    
    const total = practiceHistory.length || 1;
    const distribution = Object.entries(outcomeCounts).map(([state, count]) => ({
      state: state.charAt(0).toUpperCase() + state.slice(1),
      count,
      percentage: Math.round((count / total) * 100)
    }));
    
    setData(distribution);
  }, []);

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
        <CardTitle>Energy State Distribution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No practice data yet. Complete sessions to see your distribution.
          </p>
        ) : (
          <>
            {data.map((item) => (
              <div key={item.state} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{item.state}</span>
                  <span className="text-muted-foreground">{item.percentage}%</span>
                </div>
                <div className="relative h-2 bg-secondary/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getStateColor(item.state)} transition-all duration-500`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default EnergyDistributionChart;
