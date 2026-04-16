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

// Time windows with readable labels (5am-11am, 12pm-5pm, 6pm-4am)
const TIME_WINDOWS = [
  { key: 'morning', label: 'Morning', hours: [5, 6, 7, 8, 9, 10, 11] },
  { key: 'afternoon', label: 'Afternoon', hours: [12, 13, 14, 15, 16, 17] },
  { key: 'evening', label: 'Evening', hours: [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4] }
];

// Day labels
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// State colors aligned with Mental Energy State semiotics
const stateColors: Record<string, { bg: string; gradient: string; glow: string; label: string }> = {
  overwhelmed: {
    bg: 'bg-red-800',
    gradient: 'from-red-900 to-red-700',
    glow: 'rgba(127, 29, 29, 0.35)',
    label: 'Overloaded',
  },
  drained: {
    bg: 'bg-amber-700',
    gradient: 'from-amber-800 to-amber-600',
    glow: 'rgba(146, 64, 14, 0.35)',
    label: 'Drained',
  },
  scattered: {
    bg: 'bg-slate-600',
    gradient: 'from-slate-700 to-slate-500',
    glow: 'rgba(51, 65, 85, 0.35)',
    label: 'Scattered',
  },
  steady: {
    bg: 'bg-blue-800',
    gradient: 'from-blue-900 to-blue-700',
    glow: 'rgba(30, 58, 138, 0.35)',
    label: 'Steady',
  },
  focused: {
    bg: 'bg-emerald-700',
    gradient: 'from-emerald-800 to-emerald-600',
    glow: 'rgba(6, 95, 70, 0.35)',
    label: 'Focused',
  },
};

const EnergyRhythm = ({ checkIns }: EnergyRhythmProps) => {
  const checkInCount = checkIns.length;

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

  // Get progressive message based on check-in count
  const getProgressiveMessage = () => {
    if (checkInCount === 0) return 'Complete your first check-in to start mapping your rhythm';
    if (checkInCount === 1) return 'First data point recorded. Check in at different times to see patterns.';
    if (checkInCount < 5) return `${checkInCount} check-ins logged. Your rhythm becomes clearer with each one.`;
    return null;
  };

  const progressiveMessage = getProgressiveMessage();
  const hasData = checkInCount > 0;

  return (
    <div className="space-y-4">
      {/* Progressive message for early users */}
      {progressiveMessage && (
        <p className="text-xs text-saffron/80 text-center">{progressiveMessage}</p>
      )}

      {/* Heatmap grid - always show structure, even with no data */}
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
              <div className="w-20 text-xs text-muted-foreground pr-3 text-right font-medium">
                {timeWindow.label}
              </div>
              
              {/* Day cells - Luxury 3D styling */}
              {DAYS.map(day => {
                const cell = heatmapData[timeWindow.key]?.[day];
                const hasCheckIn = cell && cell.outcome;
                const stateStyle = hasCheckIn ? stateColors[cell.outcome || ''] : null;
                
                return (
                  <div key={`${timeWindow.key}-${day}`} className="flex-1 px-0.5">
                    <div 
                      className={cn(
                        "aspect-square rounded-lg flex items-center justify-center transition-all duration-300 relative overflow-hidden",
                        hasCheckIn 
                          ? "shadow-lg"
                          : "bg-gradient-to-br from-muted/40 to-muted/20 border border-white/5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.08)]"
                      )}
                      style={hasCheckIn && stateStyle ? {
                        boxShadow: `0 4px 12px ${stateStyle.glow}, inset 0 1px 2px rgba(255,255,255,0.2)`
                      } : undefined}
                    >
                      {hasCheckIn && stateStyle && (
                        <>
                          {/* Gradient background */}
                          <div className={cn(
                            "absolute inset-0 bg-gradient-to-br",
                            stateStyle.gradient
                          )} />
                          {/* Top highlight for 3D effect */}
                          <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/30 to-transparent" />
                          {/* Center dot */}
                          <div className="w-2.5 h-2.5 rounded-full bg-white/50 shadow-sm relative z-10" />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      
      {/* Legend - always visible */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground pt-2">
        {Object.entries(stateColors).map(([state, style]) => (
          <div key={state} className="flex items-center gap-1.5">
            <div 
              className={cn(
                "w-3 h-3 rounded shadow-sm bg-gradient-to-br",
                style.gradient
              )} 
            />
            <span>{style.label}</span>
          </div>
        ))}
      </div>

      {/* Data source note */}
      {hasData && (
        <p className="text-xs text-muted-foreground/60 text-center">
          Based on {checkInCount} check-in{checkInCount !== 1 ? 's' : ''} this week
        </p>
      )}
    </div>
  );
};

export default EnergyRhythm;
