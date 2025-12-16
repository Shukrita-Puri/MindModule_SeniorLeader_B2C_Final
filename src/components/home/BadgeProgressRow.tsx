import { Award, Lock, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ArchetypeInfo {
  id: string;
  name: string;
  badgeColor: string;
  thresholdPoints: number;
}

interface BadgeProgressRowProps {
  progression: ArchetypeInfo[];
  currentPoints: number;
  cluster: 'self' | 'social';
}

const BadgeProgressRow = ({ progression, currentPoints, cluster }: BadgeProgressRowProps) => {
  const isSelf = cluster === 'self';
  
  // Determine which badges are earned and which is next
  const earnedBadges = progression.filter(p => currentPoints >= p.thresholdPoints);
  const nextBadge = progression.find(p => currentPoints < p.thresholdPoints);
  
  // Show earned badges + next badge (max 4 visible)
  const visibleBadges = [
    ...earnedBadges.slice(-3), // Last 3 earned
    nextBadge, // Next to unlock
  ].filter(Boolean).slice(0, 4);

  return (
    <div className="flex items-center gap-1.5">
      {visibleBadges.map((badge, index) => {
        if (!badge) return null;
        const isEarned = currentPoints >= badge.thresholdPoints;
        const isCertificate = badge.id.includes('certificate');
        
        return (
          <div
            key={badge.id}
            className={cn(
              "relative flex items-center justify-center w-7 h-7 rounded-full transition-all",
              isEarned 
                ? "shadow-sm" 
                : "opacity-50 grayscale"
            )}
            style={{ 
              backgroundColor: isEarned ? badge.badgeColor : 'transparent',
              border: !isEarned ? `2px dashed ${badge.badgeColor}` : 'none'
            }}
            title={`${badge.name} (${badge.thresholdPoints} pts)`}
          >
            {isCertificate ? (
              <Trophy size={14} className={isEarned ? "text-white" : "text-muted-foreground"} />
            ) : isEarned ? (
              <Award size={14} className="text-white" />
            ) : (
              <Lock size={10} className="text-muted-foreground" />
            )}
          </div>
        );
      })}
      
      {/* Show count if more earned badges exist */}
      {earnedBadges.length > 3 && (
        <span className="text-[10px] text-muted-foreground ml-1">
          +{earnedBadges.length - 3}
        </span>
      )}
    </div>
  );
};

export default BadgeProgressRow;
