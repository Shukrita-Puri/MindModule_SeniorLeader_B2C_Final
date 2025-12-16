import { Eye, Heart, Target, Medal, Trophy, Users, HeartHandshake, Sparkles, Lock, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HexBadgeProps {
  badgeId: string;
  badgeColor: string;
  isEarned: boolean;
  isNext?: boolean;
  pointsToNext?: number;
  size?: 'sm' | 'md' | 'lg';
  cluster: 'self' | 'social';
}

const BADGE_ICONS: Record<string, LucideIcon> = {
  // Self Mastery
  'awareness-initiate': Eye,
  'emotional-navigator': Heart,
  'regulation-adept': Target,
  'self-mastery-badge': Medal,
  'self-mastery-certificate': Trophy,
  // Social Mastery
  'connection-initiate': Users,
  'empathy-practitioner': HeartHandshake,
  'influence-adept': Sparkles,
  'social-mastery-badge': Medal,
  'social-mastery-certificate': Trophy,
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
  const Icon = BADGE_ICONS[badgeId] || Medal;
  const isCertificate = badgeId.includes('certificate');
  
  const sizeClasses = {
    sm: 'w-8 h-9',
    md: 'w-10 h-11',
    lg: 'w-12 h-14',
  };

  const iconSizes = {
    sm: 14,
    md: 18,
    lg: 22,
  };

  return (
    <div className="relative flex flex-col items-center">
      <div
        className={cn(
          "hex-badge relative flex items-center justify-center transition-all duration-300",
          sizeClasses[size],
          isEarned ? "hex-badge-earned" : isNext ? "hex-badge-next" : "hex-badge-locked"
        )}
        style={{ 
          '--badge-color': isEarned ? badgeColor : undefined,
          '--badge-dark': isEarned ? adjustColor(badgeColor, -20) : undefined,
        } as React.CSSProperties}
      >
        {/* Metallic shine overlay for earned badges */}
        {isEarned && (
          <div className="absolute inset-0 hex-badge-shine pointer-events-none" />
        )}
        
        {/* Icon */}
        {isEarned ? (
          <Icon 
            size={iconSizes[size]} 
            className={cn(
              "relative z-10 drop-shadow-sm",
              isCertificate ? "text-yellow-100" : "text-white"
            )} 
          />
        ) : (
          <Lock size={iconSizes[size] - 4} className="text-muted-foreground/40 relative z-10" />
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

// Helper to darken color for gradient
function adjustColor(color: string, amount: number): string {
  // Simple adjustment for hex colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const r = Math.max(0, Math.min(255, parseInt(hex.slice(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.slice(2, 4), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.slice(4, 6), 16) + amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  return color;
}

export default HexBadge;
