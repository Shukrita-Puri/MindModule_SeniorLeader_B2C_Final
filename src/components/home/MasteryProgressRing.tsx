import { cn } from '@/lib/utils';

interface MasteryProgressRingProps {
  currentPoints: number;
  maxPoints: number;
  cluster: 'self' | 'social';
  label: string;
}

const MasteryProgressRing = ({ currentPoints, maxPoints, cluster, label }: MasteryProgressRingProps) => {
  const percentage = Math.min((currentPoints / maxPoints) * 100, 100);
  const radius = 36;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const clusterColors = {
    self: {
      primary: 'hsl(var(--saffron))',
      bg: 'hsl(var(--saffron) / 0.15)',
      text: 'text-saffron',
    },
    social: {
      primary: '#A78BFA',
      bg: 'rgba(167, 139, 250, 0.15)',
      text: 'text-purple-400',
    },
  };

  const colors = clusterColors[cluster];

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-20 h-20">
        {/* Background circle */}
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke={colors.bg}
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke={colors.primary}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500 ease-out"
          />
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-xl font-bold", colors.text)}>
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
