import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";

interface CircadianData {
  hour: number;
  energy: number;
  practices: number;
}

const CircadianGraph = () => {
  const [data, setData] = useState<CircadianData[]>([]);
  const [peakHour, setPeakHour] = useState<number>(0);

  useEffect(() => {
    // Load practice history
    const practiceHistory = JSON.parse(localStorage.getItem("practiceHistory") || "[]");
    
    // Initialize 24-hour data
    const hourlyData: Record<number, { totalEnergy: number; count: number }> = {};
    for (let i = 0; i < 24; i++) {
      hourlyData[i] = { totalEnergy: 0, count: 0 };
    }
    
    // Aggregate by hour
    practiceHistory.forEach((entry: any) => {
      const date = new Date(entry.completedAt);
      const hour = date.getHours();
      const energyMap: Record<string, number> = {
        "power-up": 80,
        "ready": 75,
        "presence": 60,
        "calm": 50,
        "pause": 40
      };
      const energy = energyMap[entry.outcome] || 50;
      
      hourlyData[hour].totalEnergy += energy;
      hourlyData[hour].count += 1;
    });
    
    // Calculate averages
    const chartData = Object.entries(hourlyData).map(([hour, stats]) => ({
      hour: parseInt(hour),
      energy: stats.count > 0 ? Math.round(stats.totalEnergy / stats.count) : 50,
      practices: stats.count
    }));
    
    // Find peak hour
    const peak = chartData.reduce((max, curr) => 
      curr.energy > max.energy ? curr : max
    , chartData[0]);
    
    setData(chartData);
    setPeakHour(peak?.hour || 0);
  }, []);

  const formatHour = (hour: number) => {
    if (hour === 0) return "12am";
    if (hour < 12) return `${hour}am`;
    if (hour === 12) return "12pm";
    return `${hour - 12}pm`;
  };

  const maxEnergy = Math.max(...data.map(d => d.energy), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Natural Energy Curve</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">Peak Performance Time:</p>
            <p className="font-semibold text-gold">{formatHour(peakHour)}</p>
          </div>
          
          <div className="relative h-48 flex items-end justify-between gap-1">
            {data.map((item) => (
              <div
                key={item.hour}
                className="flex-1 group relative"
              >
                <div
                  className="bg-gradient-to-t from-gold/80 to-gold/40 rounded-t transition-all duration-300 hover:from-gold hover:to-gold/60"
                  style={{ height: `${(item.energy / maxEnergy) * 100}%` }}
                />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-background border border-border rounded px-2 py-1 text-xs whitespace-nowrap z-10">
                  <p className="font-semibold">{formatHour(item.hour)}</p>
                  <p className="text-muted-foreground">Energy: {item.energy}</p>
                  <p className="text-muted-foreground">Sessions: {item.practices}</p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>12am</span>
            <span>6am</span>
            <span>12pm</span>
            <span>6pm</span>
            <span>12am</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CircadianGraph;
