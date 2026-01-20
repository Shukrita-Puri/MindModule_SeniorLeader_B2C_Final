import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface CheckInData {
  date: string;
  outcome: string | null;
  timestamp: string;
}

interface EnergyRhythmProps {
  checkIns: CheckInData[];
}

// Time windows with readable labels
// Time windows with readable labels (5am-11am, 12pm-5pm, 6pm-4am)
const TIME_WINDOWS = [
  { key: 'morning', label: 'Morning', hours: [5, 6, 7, 8, 9, 10, 11] },
  { key: 'afternoon', label: 'Afternoon', hours: [12, 13, 14, 15, 16, 17] },
  { key: 'evening', label: 'Evening', hours: [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4] }
];

// Day labels
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// State colors matching existing design
const stateColors: Record<string, string> = {
  focused: 'bg-green-500',
  steady: 'bg-blue-500',
  scattered: 'bg-amber-500',
  drained: 'bg-slate-400',
  overwhelmed: 'bg-red-500'
};

const EnergyRhythm = ({ checkIns }: EnergyRhythmProps) => {
  // Build heatmap data from check-ins
  const heatmapData = useMemo(() => {
    // Initialize grid: timeWindow x dayOfWeek
    const grid: Record<string, Record<string, { outcome: string | null; count: number }>> = {};
    
    TIME_WINDOWS.forEach(tw => {
      grid[tw.key] = {};
      DAYS.forEach(day => {
        grid[tw.key][day] = { outcome: null, count: 0 };
      });
    });

    // Process check-ins
    checkIns.forEach(checkIn => {
      if (!checkIn.timestamp || !checkIn.outcome) return;
      
      const date = new Date(checkIn.timestamp);
      const hour = date.getHours();
      const dayIndex = date.getDay();
      // Convert Sunday=0 to Sunday=6 for Mon-Sun ordering
      const adjustedDayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
      const dayLabel = DAYS[adjustedDayIndex];
      
      // Find time window
      const timeWindow = TIME_WINDOWS.find(tw => tw.hours.includes(hour));
      if (!timeWindow) return;
      
      // Update grid cell - if multiple check-ins, keep most recent
      const cell = grid[timeWindow.key][dayLabel];
      cell.outcome = checkIn.outcome;
      cell.count += 1;
    });

    return grid;
  }, [checkIns]);

  // Check if we have any data
  const hasData = checkIns.length > 0;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-sm text-muted-foreground">
          Complete check-ins throughout the week to see your energy rhythm.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Heatmap grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[400px]">
          {/* Header row with day labels */}
          <div className="flex items-center mb-2">
            <div className="w-20" /> {/* Spacer for time labels */}
            {DAYS.map(day => (
              <div 
                key={day} 
                className="flex-1 text-center text-xs text-muted-foreground font-medium"
              >
                {day}
              </div>
            ))}
          </div>
          
          {/* Time rows */}
          {TIME_WINDOWS.map(timeWindow => (
            <div key={timeWindow.key} className="flex items-center mb-2">
              {/* Time label */}
              <div className="w-20 text-xs text-muted-foreground pr-3 text-right">
                {timeWindow.label}
              </div>
              
              {/* Day cells */}
              {DAYS.map(day => {
                const cell = heatmapData[timeWindow.key]?.[day];
                const hasCheckIn = cell && cell.outcome;
                
                return (
                  <div key={`${timeWindow.key}-${day}`} className="flex-1 px-0.5">
                    <div 
                      className={cn(
                        "aspect-square rounded-md flex items-center justify-center transition-all",
                        hasCheckIn 
                          ? cn(stateColors[cell.outcome || ''] || 'bg-muted', "opacity-80")
                          : "bg-muted/30"
                      )}
                    >
                      {hasCheckIn && (
                        <div className="w-2 h-2 rounded-full bg-white/40" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground pt-2">
        <div className="flex items-center gap-1.5">
          <div className={cn("w-3 h-3 rounded", stateColors.focused)} />
          <span>Focused</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn("w-3 h-3 rounded", stateColors.steady)} />
          <span>Steady</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn("w-3 h-3 rounded", stateColors.scattered)} />
          <span>Scattered</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn("w-3 h-3 rounded", stateColors.drained)} />
          <span>Drained</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn("w-3 h-3 rounded", stateColors.overwhelmed)} />
          <span>Overwhelmed</span>
        </div>
      </div>
    </div>
  );
};

export default EnergyRhythm;
