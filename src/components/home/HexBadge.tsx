import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';

// Import badge images
import awarenessInitiate from '@/assets/badges/awareness-initiate.png';
import emotionalNavigator from '@/assets/badges/emotional-navigator.png';
import regulationAdept from '@/assets/badges/regulation-adept.png';
import selfMasteryBadge from '@/assets/badges/self-mastery-badge.png';
import selfMasteryCertificate from '@/assets/badges/self-mastery-certificate.png';
import connectionInitiate from '@/assets/badges/connection-initiate.png';
import empathyPractitioner from '@/assets/badges/empathy-practitioner.png';
import influenceAdept from '@/assets/badges/influence-adept.png';
import socialMasteryBadge from '@/assets/badges/social-mastery-badge.png';
import socialMasteryCertificate from '@/assets/badges/social-mastery-certificate.png';

interface HexBadgeProps {
  badgeId: string;
  badgeColor: string;
  isEarned: boolean;
  isNext?: boolean;
  pointsToNext?: number;
  size?: 'sm' | 'md' | 'lg';
  cluster: 'self' | 'social';
}

const BADGE_IMAGES: Record<string, string> = {
  // Self Mastery
  'awareness-initiate': awarenessInitiate,
  'emotional-navigator': emotionalNavigator,
  'regulation-adept': regulationAdept,
  'self-mastery-badge': selfMasteryBadge,
  'self-mastery-certificate': selfMasteryCertificate,
  // Social Mastery
  'connection-initiate': connectionInitiate,
  'empathy-practitioner': empathyPractitioner,
  'influence-adept': influenceAdept,
  'social-mastery-badge': socialMasteryBadge,
  'social-mastery-certificate': socialMasteryCertificate,
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
  const badgeImage = BADGE_IMAGES[badgeId];
  const isCertificate = badgeId.includes('certificate');
  
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-14 h-14',
  };

  return (
    <div className="relative flex flex-col items-center flex-1">
      <div
        className={cn(
          "relative flex items-center justify-center transition-all duration-300",
          sizeClasses[size],
          isNext && "animate-pulse"
        )}
      >
        {badgeImage ? (
          <img 
            src={badgeImage} 
            alt={badgeId}
            className={cn(
              "w-full h-full object-contain transition-all duration-300",
              !isEarned && "grayscale opacity-40",
              isEarned && "drop-shadow-lg",
              isCertificate && isEarned && "drop-shadow-[0_0_8px_rgba(212,175,55,0.5)]"
            )}
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
      </div>
      
      {/* Points indicator for next badge */}
      {isNext && pointsToNext !== undefined && (
        <span className="text-[10px] font-semibold text-saffron mt-0.5">
          +{pointsToNext}
        </span>
      )}
    </div>
  );
};

export default HexBadge;
