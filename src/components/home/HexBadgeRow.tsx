import { useState } from 'react';
import HexBadge from './HexBadge';
import PointSystemModal from './PointSystemModal';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import ShareableBadgeCard from '@/components/achievements/ShareableBadgeCard';
import { useAuth } from '@/hooks/useAuth';

interface ArchetypeInfo {
  id: string;
  name: string;
  badgeColor: string;
  thresholdPoints: number;
}

interface HexBadgeRowProps {
  progression: ArchetypeInfo[];
  currentPoints: number;
  cluster: 'self' | 'social';
}

const HexBadgeRow = ({ progression, currentPoints, cluster }: HexBadgeRowProps) => {
  const { user } = useAuth();
  const [selectedBadge, setSelectedBadge] = useState<ArchetypeInfo | null>(null);
  
  // Find the next badge to unlock
  const nextBadgeIndex = progression.findIndex(badge => currentPoints < badge.thresholdPoints);
  
  const handleBadgeClick = (badge: ArchetypeInfo) => {
    setSelectedBadge(badge);
  };

  const handleCloseDialog = () => {
    setSelectedBadge(null);
  };
  
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center w-full gap-1 overflow-hidden">
        <div className="flex items-end justify-between flex-1 gap-1 min-w-0">
          {progression.map((badge, index) => {
            const isEarned = currentPoints >= badge.thresholdPoints;
            const isNext = index === nextBadgeIndex;
            const pointsToNext = isNext ? badge.thresholdPoints - currentPoints : undefined;
            
            return (
              <HexBadge
                key={badge.id}
                badgeId={badge.id}
                badgeColor={badge.badgeColor}
                badgeName={badge.name}
                isEarned={isEarned}
                isNext={isNext}
                pointsToNext={pointsToNext}
                size="sm"
                cluster={cluster}
                onClick={() => handleBadgeClick(badge)}
              />
            );
          })}
        </div>
        <div className="flex-shrink-0">
          <PointSystemModal cluster={cluster} />
        </div>
      </div>

      {/* Share Dialog */}
      <Dialog open={!!selectedBadge} onOpenChange={handleCloseDialog}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          {selectedBadge && (
            <ShareableBadgeCard
              achievementName={selectedBadge.name}
              archetypeName={selectedBadge.name}
              cluster={cluster === 'self' ? 'self_mastery' : 'social_mastery'}
              badgeColor={selectedBadge.badgeColor}
              userName={user?.name || user?.email || 'User'}
              earnedDate={new Date()}
              onShare={handleCloseDialog}
            />
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default HexBadgeRow;
