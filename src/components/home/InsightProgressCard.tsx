import { Award } from 'lucide-react';
import WeeklyRitualStreak from './WeeklyRitualStreak';
import PointSystemModal from './PointSystemModal';
import BadgeProgressRow from './BadgeProgressRow';
import { useUnifiedProgress } from '@/hooks/useUnifiedProgress';
import { cn } from '@/lib/utils';

const InsightProgressCard = () => {
  const { progress, SELF_MASTERY_PROGRESSION, SOCIAL_MASTERY_PROGRESSION } = useUnifiedProgress();

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-4">
      {/* Row 1: Weekly Ritual Completion with Streak */}
      <WeeklyRitualStreak />
      
      {/* Row 2: Dual Archetype Progress - Simplified */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="grid grid-cols-2 gap-4">
          {/* Self Mastery Progress */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center badge-3d-earned relative"
                style={{ backgroundColor: progress.currentSelfArchetype?.badgeColor || '#F59E0B' }}
              >
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
                <Award size={16} className="text-white drop-shadow-sm relative z-10" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {progress.currentSelfArchetype?.name || 'Self Mastery'}
                  </span>
                  <PointSystemModal cluster="self" />
                </div>
                {progress.nextSelfArchetype && (
                  <span className="text-xs text-muted-foreground">
                    {progress.pointsToNextSelf} pts to {progress.nextSelfArchetype.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Social Mastery Progress */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center badge-3d-earned relative"
                style={{ backgroundColor: progress.currentSocialArchetype?.badgeColor || '#A78BFA' }}
              >
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
                <Award size={16} className="text-white drop-shadow-sm relative z-10" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {progress.currentSocialArchetype?.name || 'Social Mastery'}
                  </span>
                  <PointSystemModal cluster="social" />
                </div>
                {progress.nextSocialArchetype && (
                  <span className="text-xs text-muted-foreground">
                    {progress.pointsToNextSocial} pts to {progress.nextSocialArchetype.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Badges Collected - Visual Display */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="space-y-3">
          {/* Self Mastery Badges */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-12">Self</span>
            <BadgeProgressRow 
              progression={SELF_MASTERY_PROGRESSION}
              currentPoints={progress.selfMasteryPoints}
              cluster="self"
            />
          </div>
          
          {/* Social Mastery Badges */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-12">Social</span>
            <BadgeProgressRow 
              progression={SOCIAL_MASTERY_PROGRESSION}
              currentPoints={progress.socialMasteryPoints}
              cluster="social"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsightProgressCard;
