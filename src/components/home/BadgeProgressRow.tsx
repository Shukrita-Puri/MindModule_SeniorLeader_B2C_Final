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
  // Show all badges - earned ones are vibrant, unearned are muted
  return (
    <div className="flex items-center gap-2">
      {progression.map((badge) => {
        const isEarned = currentPoints >= badge.thresholdPoints;
        const isCertificate = badge.id.includes('certificate');
        
        return (
          <div
            key={badge.id}
            className={cn(
              "relative flex items-center justify-center w-10 h-10 rounded-full transition-all",
              isEarned ? "badge-3d-earned" : "badge-3d-locked"
            )}
            style={{ 
              backgroundColor: isEarned ? badge.badgeColor : undefined,
            }}
            title={`${badge.name} (${badge.thresholdPoints} pts)`}
          >
            {/* Shine overlay for earned badges */}
            {isEarned && (
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
            )}
            
            {isCertificate ? (
              <Trophy 
                size={18} 
                className={isEarned ? "text-white drop-shadow-sm relative z-10" : "text-muted-foreground/50"} 
              />
            ) : isEarned ? (
              <Award size={18} className="text-white drop-shadow-sm relative z-10" />
            ) : (
              <Lock size={14} className="text-muted-foreground/40" />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BadgeProgressRow;
