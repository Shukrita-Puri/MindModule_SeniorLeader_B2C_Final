import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState, useRef } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CircadianData {
  hour: number;
  energy: number;
  practices: number;
}

interface CircadianGraphProps {
  timeRange?: "week" | "month" | "quarter";
}

const CircadianGraph = ({ timeRange = "week" }: CircadianGraphProps) => {
  const [data, setData] = useState<CircadianData[]>([]);
  const [peakHour, setPeakHour] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  useEffect(() => {
    // Load practice history with time range filter
    const practiceHistory = JSON.parse(localStorage.getItem("practiceHistory") || "[]");
    const now = new Date();
    const daysToFilter = timeRange === "week" ? 7 : timeRange === "month" ? 30 : 90;
    const cutoffDate = new Date(now.getTime() - daysToFilter * 24 * 60 * 60 * 1000);
    
    const filteredHistory = practiceHistory.filter((entry: any) => 
      new Date(entry.completedAt) >= cutoffDate
    );
    
    // Initialize 24-hour data
    const hourlyData: Record<number, { totalEnergy: number; count: number }> = {};
    for (let i = 0; i < 24; i++) {
      hourlyData[i] = { totalEnergy: 0, count: 0 };
    }
    
    // Aggregate by hour
    filteredHistory.forEach((entry: any) => {
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
  }, [timeRange]);

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
        <div className="flex items-center justify-between">
          <CardTitle>Your Natural Energy Curve</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
              disabled={zoomLevel <= 0.5}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.25))}
              disabled={zoomLevel >= 2}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">Peak Performance Time:</p>
            <p className="font-semibold text-gold">{formatHour(peakHour)}</p>
          </div>
          
          <div 
            className="relative flex items-end justify-between gap-1 overflow-x-auto"
            style={{ height: `${192 * zoomLevel}px` }}
          >
            {data.map((item) => (
              <div
                key={item.hour}
                className="flex-1 group relative cursor-pointer"
                onMouseEnter={() => setHoveredBar(item.hour)}
                onMouseLeave={() => setHoveredBar(null)}
                style={{ minWidth: `${24 * zoomLevel}px` }}
              >
                <div
                  className="bg-gradient-to-t from-gold/80 to-gold/40 rounded-t transition-all duration-300 hover:from-gold hover:to-gold/60"
                  style={{ 
                    height: `${(item.energy / maxEnergy) * 100}%`,
                    transform: hoveredBar === item.hour ? 'scaleY(1.05)' : 'scaleY(1)',
                    transformOrigin: 'bottom'
                  }}
                />
                {hoveredBar === item.hour && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-popover border border-border rounded-lg px-3 py-2 text-xs whitespace-nowrap z-10 shadow-lg animate-in fade-in-0 zoom-in-95">
                    <p className="font-semibold text-foreground">{formatHour(item.hour)}</p>
                    <p className="text-muted-foreground">Energy: <span className="text-gold font-medium">{item.energy}</span></p>
                    <p className="text-muted-foreground">Sessions: <span className="text-primary font-medium">{item.practices}</span></p>
                  </div>
                )}
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
