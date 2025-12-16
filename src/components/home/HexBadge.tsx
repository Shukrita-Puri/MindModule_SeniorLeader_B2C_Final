import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';
import badgeSprite from '@/assets/badges/badge-sprite.jpeg';

interface HexBadgeProps {
  badgeId: string;
  badgeColor: string;
  isEarned: boolean;
  isNext?: boolean;
  pointsToNext?: number;
  size?: 'sm' | 'md' | 'lg';
  cluster: 'self' | 'social';
}

// Sprite positions for 3x3 grid (row, col)
const BADGE_POSITIONS: Record<string, { row: number; col: number }> = {
  // Self Mastery (Row 1: warm tones)
  'awareness-initiate': { row: 0, col: 0 },
  'emotional-navigator': { row: 0, col: 1 },
  'regulation-adept': { row: 0, col: 2 },
  // Social Mastery (Row 2: cool tones)  
  'connection-initiate': { row: 1, col: 0 },
  'empathy-practitioner': { row: 1, col: 1 },
  'self-mastery-badge': { row: 1, col: 2 },
  // Bottom row
  'social-mastery-badge': { row: 2, col: 0 },
  'influence-adept': { row: 2, col: 1 },
  'self-mastery-certificate': { row: 2, col: 2 },
  'social-mastery-certificate': { row: 2, col: 2 },
};

const HexBadge = ({ 
  badgeId, 
  badgeColor, 
  isEarned, 
  isNext = false, 
  pointsToNext,
  size = 'md',
  cluster 
}: HexBadgeProps) => {
  const position = BADGE_POSITIONS[badgeId];
  const isCertificate = badgeId.includes('certificate');
  
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-14 h-14',
  };

  // Calculate background position (each badge is 1/3 of image)
  const backgroundPosition = position 
    ? `${position.col * 50}% ${position.row * 50}%`
    : '0% 0%';

  return (
    <div className="relative flex flex-col items-center flex-1">
      <div
        className={cn(
          "relative flex items-center justify-center transition-all duration-300",
          sizeClasses[size]
        )}
      >
        {position ? (
          <div 
            className={cn(
              "w-full h-full rounded-lg transition-all duration-300",
              !isEarned && "grayscale opacity-40",
              isEarned && "drop-shadow-lg",
              isCertificate && isEarned && "drop-shadow-[0_0_8px_rgba(212,175,55,0.5)]"
            )}
            style={{
              backgroundImage: `url(${badgeSprite})`,
              backgroundSize: '300% 300%',
              backgroundPosition: backgroundPosition,
              backgroundRepeat: 'no-repeat',
            }}
          />
        ) : (
          <div className={cn(
            "w-full h-full rounded-lg bg-muted/50 flex items-center justify-center",
            !isEarned && "opacity-40"
          )}>
            <Lock size={16} className="text-muted-foreground" />
          </div>
        )}
        
      {/* Lock overlay for locked badges */}
        {!isEarned && !isNext && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Lock size={14} className="text-muted-foreground/60" />
          </div>
        )}
        
        {/* Points indicator overlay on next badge */}
        {isNext && pointsToNext !== undefined && (
          <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-saffron bg-background/90 px-1 rounded-sm">
            +{pointsToNext}
          </span>
        )}
      </div>
    </div>
  );
};

export default HexBadge;
