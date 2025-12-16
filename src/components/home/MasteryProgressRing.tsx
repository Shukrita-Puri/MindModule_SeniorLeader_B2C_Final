import { cn } from '@/lib/utils';

interface MasteryProgressRingProps {
  currentPoints: number;
  maxPoints?: number; // Defaults to 250 (certificate threshold)
  cluster: 'self' | 'social';
  label: string;
}

const MasteryProgressRing = ({ currentPoints, maxPoints = 250, cluster, label }: MasteryProgressRingProps) => {
  const percentage = Math.min((currentPoints / maxPoints) * 100, 100);
  
  // Traffic light color system
  const getTrafficLightColor = (pct: number) => {
    if (pct <= 33) return '#EF4444'; // Red
    if (pct <= 66) return '#F59E0B'; // Amber
    return '#22C55E'; // Green
  };
  
  const progressColor = getTrafficLightColor(percentage);
  const bgColor = 'hsl(var(--muted) / 0.3)';
  
  // Semicircle arc calculations
  const radius = 40;
  const strokeWidth = 8;
  const centerX = 50;
  const centerY = 50;
  
  // Arc path for semicircle (180 degrees, open at bottom)
  const startAngle = 180;
  const endAngle = 0;
  const progressAngle = 180 - (percentage / 100) * 180;
  
  const polarToCartesian = (cx: number, cy: number, r: number, angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy - r * Math.sin(rad),
    };
  };
  
  const createArc = (startAng: number, endAng: number) => {
    const start = polarToCartesian(centerX, centerY, radius, startAng);
    const end = polarToCartesian(centerX, centerY, radius, endAng);
    const largeArcFlag = startAng - endAng <= 180 ? 0 : 1;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-16">
        <svg className="w-full h-full" viewBox="0 0 100 60">
          {/* Background arc */}
          <path
            d={createArc(180, 0)}
            fill="none"
            stroke={bgColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Progress arc */}
          {percentage > 0 && (
            <path
              d={createArc(180, progressAngle)}
              fill="none"
              stroke={progressColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              className="transition-all duration-500 ease-out"
            />
          )}
        </svg>
        
        {/* Center content - positioned below the arc */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="text-2xl font-bold text-foreground">
            {currentPoints}
          </span>
          <span className="text-[10px] text-muted-foreground">
            /{maxPoints}
          </span>
        </div>
      </div>
      
      {/* Label */}
      <span className="text-xs font-medium text-muted-foreground mt-1">
        {label}
      </span>
    </div>
  );
};

export default MasteryProgressRing;
