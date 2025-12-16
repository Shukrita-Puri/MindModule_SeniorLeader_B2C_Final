import { cn } from '@/lib/utils';
import { Lock, Eye, Radar, Gauge, Shield, Trophy, UserPlus, HeartHandshake, Zap, Star, Gem } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface HexBadgeProps {
  badgeId: string;
  badgeColor?: string;
  badgeName: string;
  isEarned: boolean;
  isNext?: boolean;
  pointsToNext?: number;
  size?: 'sm' | 'md' | 'lg';
  cluster?: 'self' | 'social';
  onClick?: () => void;
}

// Icon and gradient mapping for each badge (synced with achievement_definitions DB IDs)
const BADGE_CONFIG: Record<string, { 
  icon: React.ElementType; 
  gradient: string;
  glowColor: string;
}> = {
  // Self Mastery (warm tones) - 250pt system
  'self_mastery_initiate': { 
    icon: Eye, 
    gradient: 'from-amber-400 via-orange-300 to-yellow-400',
    glowColor: 'rgba(251, 191, 36, 0.5)'
  },
  'self_mastery_practitioner': { 
    icon: Radar, 
    gradient: 'from-orange-300 via-amber-200 to-yellow-300',
    glowColor: 'rgba(253, 186, 116, 0.5)'
  },
  'self_mastery_adept': { 
    icon: Gauge, 
    gradient: 'from-orange-500 via-amber-400 to-orange-400',
    glowColor: 'rgba(249, 115, 22, 0.5)'
  },
  'self_mastery_badge': { 
    icon: Shield, 
    gradient: 'from-yellow-500 via-amber-500 to-orange-500',
    glowColor: 'rgba(245, 158, 11, 0.6)'
  },
  'self_mastery_certificate': { 
    icon: Trophy, 
    gradient: 'from-yellow-600 via-amber-600 to-orange-600',
    glowColor: 'rgba(217, 119, 6, 0.6)'
  },
  // Social Mastery (cool tones) - 250pt system
  'social_mastery_initiate': { 
    icon: UserPlus, 
    gradient: 'from-violet-400 via-purple-300 to-indigo-400',
    glowColor: 'rgba(167, 139, 250, 0.5)'
  },
  'social_mastery_practitioner': { 
    icon: HeartHandshake, 
    gradient: 'from-pink-400 via-rose-300 to-red-300',
    glowColor: 'rgba(251, 113, 133, 0.5)'
  },
  'social_mastery_adept': { 
    icon: Zap, 
    gradient: 'from-purple-500 via-violet-400 to-indigo-500',
    glowColor: 'rgba(139, 92, 246, 0.5)'
  },
  'social_mastery_badge': { 
    icon: Star, 
    gradient: 'from-indigo-500 via-purple-500 to-violet-500',
    glowColor: 'rgba(99, 102, 241, 0.6)'
  },
  'social_mastery_certificate': { 
    icon: Gem, 
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
  cluster,
  onClick
}: HexBadgeProps) => {
  const config = BADGE_CONFIG[badgeId];
  const isMasterBadge = badgeId.includes('certificate');
  
  const sizeClasses = {
    sm: 'w-14 h-16',
    md: 'w-16 h-18',
    lg: 'w-20 h-22',
  };

  const iconSizes = {
    sm: 20,
    md: 24,
    lg: 28,
  };

  const IconComponent = config?.icon || Lock;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div 
          className="relative flex flex-col items-center flex-1 cursor-pointer"
          onClick={isEarned && onClick ? onClick : undefined}
        >
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
                isMasterBadge && isEarned && "hex-badge-3d-certificate"
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
          <p className="text-xs text-emerald-500">Earned! Tap to share</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

export default HexBadge;
