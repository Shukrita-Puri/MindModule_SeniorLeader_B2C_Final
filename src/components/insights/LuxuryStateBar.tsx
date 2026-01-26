import { cn } from '@/lib/utils';

interface StateDataItem {
  state: string;
  count: number;
  fill: string;
}

interface LuxuryStateBarProps {
  data: StateDataItem[];
  maxCount: number;
  baselineScore?: number;
  checkInCount: number;
  className?: string;
}

// Lighten a color by a percentage
const lightenColor = (color: string, percent: number): string => {
  // For HSL colors, we'll just add transparency
  return color.replace(')', `, ${1 - percent / 100})`).replace('hsl(', 'hsla(');
};

const LuxuryStateBar = ({ 
  data, 
  maxCount, 
  baselineScore,
  checkInCount,
  className 
}: LuxuryStateBarProps) => {
  return (
    <div className={cn("space-y-3", className)}>
      {data.map((item) => (
        <div key={item.state} className="flex items-center gap-3">
          {/* State label */}
          <span className="text-sm text-muted-foreground w-24 text-right font-medium">
            {item.state}
          </span>
          
          {/* Luxury bar container */}
          <div className="flex-1 h-7 bg-muted/20 rounded-full overflow-hidden relative shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]">
            {/* 3D inset effect */}
            <div className="absolute inset-0 shadow-[inset_0_1px_3px_rgba(0,0,0,0.08)]" />
            
            {/* Gradient bar with glow */}
            <div
              className="h-full rounded-full relative transition-all duration-700 ease-out"
              style={{
                width: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%`,
                background: `linear-gradient(135deg, ${item.fill} 0%, ${lightenColor(item.fill, 15)} 50%, ${item.fill} 100%)`,
                boxShadow: item.count > 0 
                  ? `0 2px 8px ${item.fill}40, inset 0 1px 2px rgba(255,255,255,0.3)` 
                  : 'none',
                minWidth: item.count > 0 ? '16px' : '0'
              }}
            >
              {/* Top highlight for 3D effect */}
              <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/30 to-transparent rounded-t-full" />
            </div>
            
            {/* Baseline marker (if applicable) */}
            {baselineScore && checkInCount > 0 && (
              <div 
                className="absolute top-0 bottom-0 border-l-2 border-dashed border-saffron/40"
                style={{ left: `${baselineScore}%` }}
              >
                <span className="absolute -top-5 -translate-x-1/2 text-[9px] text-saffron/60 whitespace-nowrap">
                  Baseline
                </span>
              </div>
            )}
          </div>
          
          {/* Count */}
          <span className="text-sm font-semibold w-16 text-foreground">
            {item.count} {item.count === 1 ? 'day' : 'days'}
          </span>
        </div>
      ))}
    </div>
  );
};

export default LuxuryStateBar;
