import WeeklyRitualStreak from './WeeklyRitualStreak';
import MasteryProgressRing from './MasteryProgressRing';
import HexBadgeRow from './HexBadgeRow';
import { useUnifiedProgress } from '@/hooks/useUnifiedProgress';

const CERTIFICATE_THRESHOLD = 500;

const InsightProgressCard = () => {
  const { progress, SELF_MASTERY_PROGRESSION, SOCIAL_MASTERY_PROGRESSION } = useUnifiedProgress();

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-4">
      {/* Row 1: Weekly Ritual Completion with Streak */}
      <WeeklyRitualStreak />
      
      {/* Row 2: Dual Semicircle Progress Rings */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex justify-center gap-12">
          <MasteryProgressRing
            currentPoints={progress.selfMasteryPoints}
            maxPoints={CERTIFICATE_THRESHOLD}
            cluster="self"
            label="Self Mastery"
          />
          <MasteryProgressRing
            currentPoints={progress.socialMasteryPoints}
            maxPoints={CERTIFICATE_THRESHOLD}
            cluster="social"
            label="Social Mastery"
          />
        </div>
      </div>

      {/* Row 3: Full-Width Badge Collections */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="space-y-4">
          {/* Self Mastery Badges */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-10 shrink-0">Self</span>
            <HexBadgeRow 
              progression={SELF_MASTERY_PROGRESSION}
              currentPoints={progress.selfMasteryPoints}
              cluster="self"
            />
          </div>
          
          {/* Social Mastery Badges */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-10 shrink-0">Social</span>
            <HexBadgeRow 
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
