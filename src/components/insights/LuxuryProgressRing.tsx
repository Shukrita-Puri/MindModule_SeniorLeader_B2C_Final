import { cn } from '@/lib/utils';

interface LuxuryProgressRingProps {
  value: number;
  max?: number;
  label: string;
  sublabel?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const LuxuryProgressRing = ({ 
  value, 
  max = 7, 
  label, 
  sublabel,
  size = 'md',
  className 
}: LuxuryProgressRingProps) => {
  const percentage = Math.min((value / max) * 100, 100);
  
  const sizeConfig = {
    sm: { container: 'w-16 h-16', viewBox: 64, radius: 26, stroke: 4, text: 'text-lg', sublabel: 'text-[9px]' },
    md: { container: 'w-20 h-20', viewBox: 80, radius: 32, stroke: 5, text: 'text-xl', sublabel: 'text-[10px]' },
    lg: { container: 'w-24 h-24', viewBox: 96, radius: 38, stroke: 6, text: 'text-2xl', sublabel: 'text-xs' },
  };
  
  const config = sizeConfig[size];
  const circumference = 2 * Math.PI * config.radius;
  const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
  const center = config.viewBox / 2;

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className={cn("relative", config.container)}>
        <svg 
          className="absolute inset-0 w-full h-full drop-shadow-md" 
          viewBox={`0 0 ${config.viewBox} ${config.viewBox}`}
        >
          <defs>
            <linearGradient id={`luxuryRingGradient-${label}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(var(--saffron))" stopOpacity="1" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.7" />
            </linearGradient>
            <filter id={`ringGlow-${label}`}>
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" />
            </filter>
          </defs>
          
          {/* Background track */}
          <circle 
            cx={center} 
            cy={center} 
            r={config.radius}
            fill="none" 
            stroke="hsl(var(--muted))"
            strokeWidth={config.stroke}
            strokeOpacity="0.25"
          />
          
          {/* Progress arc with gradient and glow */}
          <circle 
            cx={center} 
            cy={center} 
            r={config.radius}
            fill="none" 
            stroke={`url(#luxuryRingGradient-${label})`}
            strokeWidth={config.stroke}
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
            filter={`url(#ringGlow-${label})`}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        
        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-bold text-saffron", config.text)}>
            {value}
          </span>
        </div>
      </div>
      
      {/* Label below */}
      <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground mt-2">
        {label}
      </span>
      {sublabel && (
        <span className={cn("text-muted-foreground/60 mt-0.5", config.sublabel)}>
          {sublabel}
        </span>
      )}
    </div>
  );
};

export default LuxuryProgressRing;
