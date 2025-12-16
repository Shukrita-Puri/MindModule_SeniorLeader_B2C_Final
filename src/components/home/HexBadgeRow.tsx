import HexBadge from './HexBadge';
import PointSystemModal from './PointSystemModal';

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
  // Find the next badge to unlock
  const nextBadgeIndex = progression.findIndex(badge => currentPoints < badge.thresholdPoints);
  
  return (
    <div className="flex items-center w-full gap-1">
      <div className="flex items-end justify-between flex-1 gap-2">
        {progression.map((badge, index) => {
          const isEarned = currentPoints >= badge.thresholdPoints;
          const isNext = index === nextBadgeIndex;
          const pointsToNext = isNext ? badge.thresholdPoints - currentPoints : undefined;
          
          return (
            <HexBadge
              key={badge.id}
              badgeId={badge.id}
              badgeColor={badge.badgeColor}
              isEarned={isEarned}
              isNext={isNext}
              pointsToNext={pointsToNext}
              size="md"
              cluster={cluster}
            />
          );
        })}
      </div>
      <PointSystemModal cluster={cluster} />
    </div>
  );
};

export default HexBadgeRow;
