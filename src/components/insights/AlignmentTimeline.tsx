import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";

interface AlignmentPoint {
  date: string;
  score: number;
  practices: number;
}

const AlignmentTimeline = () => {
  const [data, setData] = useState<AlignmentPoint[]>([]);

  useEffect(() => {
    // Load practice history
    const practiceHistory = JSON.parse(localStorage.getItem("practiceHistory") || "[]");
    
    // Group by date and calculate alignment score
    const dailyData: Record<string, { totalScore: number; count: number }> = {};
    
    practiceHistory.forEach((entry: any) => {
      const date = new Date(entry.completedAt).toLocaleDateString();
      if (!dailyData[date]) {
        dailyData[date] = { totalScore: 0, count: 0 };
      }
      
      // Calculate alignment based on outcome and time
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
    
    // Convert to timeline format (last 14 days)
    const timeline = Object.entries(dailyData)
      .map(([date, stats]) => ({
        date,
        score: Math.round(stats.totalScore / stats.count),
        practices: stats.count
      }))
      .slice(-14);
    
    setData(timeline);
  }, []);

  const maxScore = Math.max(...data.map(d => d.score), 1);
  const avgScore = data.length > 0 
    ? Math.round(data.reduce((sum, d) => sum + d.score, 0) / data.length)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>14-Day Alignment</span>
          <span className="text-sm font-normal text-muted-foreground">
            Avg: <span className="text-gold font-semibold">{avgScore}</span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Complete practices over multiple days to see your alignment timeline
          </p>
        ) : (
          <div className="relative h-48">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
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
              
              {/* Points */}
              {data.map((point, i) => {
                const x = (i / (data.length - 1)) * 100;
                const y = 100 - (point.score / maxScore) * 100;
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r="1"
                    fill="currentColor"
                    className="text-gold"
                  />
                );
              })}
            </svg>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AlignmentTimeline;
