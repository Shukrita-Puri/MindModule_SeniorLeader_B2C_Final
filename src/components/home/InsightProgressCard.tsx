import { Award, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import WeeklyRitualStreak from './WeeklyRitualStreak';
import PointSystemModal from './PointSystemModal';
import BadgeProgressRow from './BadgeProgressRow';
import { useUnifiedProgress } from '@/hooks/useUnifiedProgress';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

const InsightProgressCard = () => {
  const { user } = useAuth();
  const { progress, isLoading, SELF_MASTERY_PROGRESSION, SOCIAL_MASTERY_PROGRESSION } = useUnifiedProgress();

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-4">
      {/* Row 1: Weekly Ritual Completion with Streak */}
      <WeeklyRitualStreak />
      
      {/* Row 2: Dual Archetype Progress */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="grid grid-cols-2 gap-3">
          {/* Self Mastery Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div 
                  className="w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: progress.currentSelfArchetype?.badgeColor || '#10B981' }}
                >
                  <Award size={12} className="text-white" />
                </div>
                <span className="text-xs font-medium text-foreground truncate">
                  {progress.currentSelfArchetype?.name || 'Self Mastery'}
                </span>
              </div>
              <PointSystemModal cluster="self" />
            </div>
            
            {/* Progress Bar */}
            <div className="space-y-1">
              <Progress 
                value={progress.nextSelfArchetype 
                  ? ((progress.selfMasteryPoints / progress.nextSelfArchetype.thresholdPoints) * 100)
                  : 100
                } 
                className="h-1.5"
              />
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">
                  {progress.selfMasteryPoints} pts
                </span>
                {progress.nextSelfArchetype && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    {progress.pointsToNextSelf} to {progress.nextSelfArchetype.name.split(' ')[0]}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Social Mastery Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div 
                  className="w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: progress.currentSocialArchetype?.badgeColor || '#6366F1' }}
                >
                  <Award size={12} className="text-white" />
                </div>
                <span className="text-xs font-medium text-foreground truncate">
                  {progress.currentSocialArchetype?.name || 'Social Mastery'}
                </span>
              </div>
              <PointSystemModal cluster="social" />
            </div>
            
            {/* Progress Bar */}
            <div className="space-y-1">
              <Progress 
                value={progress.nextSocialArchetype 
                  ? ((progress.socialMasteryPoints / progress.nextSocialArchetype.thresholdPoints) * 100)
                  : 100
                } 
                className="h-1.5"
              />
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">
                  {progress.socialMasteryPoints} pts
                </span>
                {progress.nextSocialArchetype && (
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                    {progress.pointsToNextSocial} to {progress.nextSocialArchetype.name.split(' ')[0]}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Badges Collected */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Self Mastery Badges */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Self:</span>
              <BadgeProgressRow 
                progression={SELF_MASTERY_PROGRESSION}
                currentPoints={progress.selfMasteryPoints}
                cluster="self"
              />
            </div>
            
            {/* Social Mastery Badges */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Social:</span>
              <BadgeProgressRow 
                progression={SOCIAL_MASTERY_PROGRESSION}
                currentPoints={progress.socialMasteryPoints}
                cluster="social"
              />
            </div>
          </div>
          
          {/* Link to detailed insights */}
          <Link 
            to="/insights-dashboard" 
            className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Details
            <ChevronRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default InsightProgressCard;
