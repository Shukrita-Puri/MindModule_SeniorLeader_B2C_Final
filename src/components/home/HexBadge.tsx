import { cn } from '@/lib/utils';
import { Lock, Sunrise, Compass, Settings, Crown, ScrollText, Users, Heart, Sparkles, Award } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface HexBadgeProps {
  badgeId: string;
  badgeColor: string;
  badgeName: string;
  isEarned: boolean;
  isNext?: boolean;
  pointsToNext?: number;
  size?: 'sm' | 'md' | 'lg';
  cluster: 'self' | 'social';
}

// Icon and gradient mapping for each badge
const BADGE_CONFIG: Record<string, { 
  icon: React.ElementType; 
  gradient: string;
  glowColor: string;
}> = {
  // Self Mastery (warm tones)
  'awareness-initiate': { 
    icon: Sunrise, 
    gradient: 'from-amber-400 via-orange-300 to-yellow-400',
    glowColor: 'rgba(251, 191, 36, 0.5)'
  },
  'emotional-navigator': { 
    icon: Compass, 
    gradient: 'from-orange-300 via-amber-200 to-yellow-300',
    glowColor: 'rgba(253, 186, 116, 0.5)'
  },
  'regulation-adept': { 
    icon: Settings, 
    gradient: 'from-orange-500 via-amber-400 to-orange-400',
    glowColor: 'rgba(249, 115, 22, 0.5)'
  },
  'self-mastery-badge': { 
    icon: Crown, 
    gradient: 'from-yellow-500 via-amber-500 to-orange-500',
    glowColor: 'rgba(245, 158, 11, 0.6)'
  },
  'self-mastery-certificate': { 
    icon: ScrollText, 
    gradient: 'from-yellow-600 via-amber-600 to-orange-600',
    glowColor: 'rgba(217, 119, 6, 0.6)'
  },
  // Social Mastery (cool tones)
  'connection-initiate': { 
    icon: Users, 
    gradient: 'from-violet-400 via-purple-300 to-indigo-400',
    glowColor: 'rgba(167, 139, 250, 0.5)'
  },
  'empathy-practitioner': { 
    icon: Heart, 
    gradient: 'from-pink-400 via-rose-300 to-red-300',
    glowColor: 'rgba(251, 113, 133, 0.5)'
  },
  'influence-adept': { 
    icon: Sparkles, 
    gradient: 'from-purple-500 via-violet-400 to-indigo-500',
    glowColor: 'rgba(139, 92, 246, 0.5)'
  },
  'social-mastery-badge': { 
    icon: Award, 
    gradient: 'from-indigo-500 via-purple-500 to-violet-500',
    glowColor: 'rgba(99, 102, 241, 0.6)'
  },
  'social-mastery-certificate': { 
    icon: Award, 
    gradient: 'from-purple-600 via-indigo-600 to-violet-600',
    glowColor: 'rgba(124, 58, 237, 0.6)'
  },
};

const HexBadge = ({ 
  badgeId, 
  badgeColor, 
  badgeName,
  isEarned, 
  isNext = false, 
  pointsToNext,
  size = 'md',
  cluster 
}: HexBadgeProps) => {
  const config = BADGE_CONFIG[badgeId];
  const isCertificate = badgeId.includes('certificate');
  
  const sizeClasses = {
    sm: 'w-11 h-12',
    md: 'w-13 h-14',
    lg: 'w-16 h-18',
  };

  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 24,
  };

  const IconComponent = config?.icon || Lock;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative flex flex-col items-center flex-1 cursor-pointer">
          <div
            className={cn(
              "relative flex items-center justify-center transition-all duration-300",
              sizeClasses[size]
            )}
          >
            {/* Hexagon Container */}
            <div 
              className={cn(
                "hex-badge-3d w-full h-full flex items-center justify-center relative",
                isEarned && "hex-badge-3d-earned",
                !isEarned && !isNext && "hex-badge-3d-locked",
                isNext && "hex-badge-3d-next",
                isCertificate && isEarned && "hex-badge-3d-certificate"
              )}
              style={isEarned && config ? {
                '--glow-color': config.glowColor,
              } as React.CSSProperties : undefined}
            >
              {/* Background gradient for earned badges */}
              {isEarned && config && (
                <div className={cn(
                  "absolute inset-0 hex-badge-3d bg-gradient-to-br",
                  config.gradient
                )} />
              )}
              
              {/* Locked/Next background */}
              {!isEarned && (
                <div className={cn(
                  "absolute inset-0 hex-badge-3d",
                  isNext ? "bg-muted/60" : "bg-muted/30"
                )} />
              )}

              {/* Shine overlay for earned */}
              {isEarned && (
                <div className="absolute inset-0 hex-badge-3d hex-badge-shine" />
              )}

              {/* Icon */}
              <div className={cn(
                "relative z-10 flex items-center justify-center",
                isEarned ? "text-white drop-shadow-md" : "text-muted-foreground/50"
              )}>
                {!isEarned && !isNext ? (
                  <Lock size={iconSizes[size]} className="text-muted-foreground/40" />
                ) : (
                  <IconComponent 
                    size={iconSizes[size]} 
                    className={cn(
                      isEarned && "drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]",
                      !isEarned && isNext && "text-muted-foreground/60"
                    )}
                  />
                )}
              </div>
              
              {/* Points indicator overlay for next badge */}
              {isNext && pointsToNext !== undefined && (
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-saffron bg-black/50 backdrop-blur-[2px] hex-badge-3d z-20">
                  +{pointsToNext}
                </span>
              )}
            </div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-center">
        <p className="font-semibold text-sm">{badgeName}</p>
        {!isEarned && pointsToNext && (
          <p className="text-xs text-muted-foreground">{pointsToNext} pts to unlock</p>
        )}
        {isEarned && (
          <p className="text-xs text-emerald-500">Earned!</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

export default HexBadge;
