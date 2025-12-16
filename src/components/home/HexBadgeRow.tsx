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
    <div className="flex items-end gap-1.5">
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
            size="sm"
            cluster={cluster}
          />
        );
      })}
      <PointSystemModal cluster={cluster} />
    </div>
  );
};

export default HexBadgeRow;
