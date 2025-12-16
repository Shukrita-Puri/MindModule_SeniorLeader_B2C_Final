import { useRef } from "react";
import { Eye, Radar, Gauge, Crown, Brain, Users, HeartHandshake, Network, Sparkles, LucideIcon } from "lucide-react";
import ShareOptions from "./ShareOptions";
import { downloadBadgeAsImage } from "@/utils/badgeImageExport";

// Badge icon mapping matching HexBadge
const BADGE_ICONS: Record<string, LucideIcon> = {
  // Self Mastery badges
  'self_awareness_initiate': Eye,
  'self_emotional_navigator': Radar,
  'self_regulation_specialist': Gauge,
  'self_mastery_practitioner': Brain,
  'self_mastery_master': Crown,
  // Social Mastery badges
  'social_apprentice': Users,
  'social_empathy_builder': HeartHandshake,
  'social_influence_architect': Network,
  'social_intelligence_practitioner': Sparkles,
  'social_mastery_master': Crown,
};

interface ShareableBadgeCardProps {
  achievementName: string;
  archetypeName: string;
  cluster: 'self_mastery' | 'social_mastery';
  badgeColor: string;
  badgeId?: string;
  userName?: string;
  earnedDate?: Date;
  onShare?: () => void;
}

const ShareableBadgeCard = ({
  achievementName,
  archetypeName,
  cluster,
  badgeColor,
  badgeId,
  userName,
  earnedDate,
  onShare
}: ShareableBadgeCardProps) => {
  const badgeRef = useRef<HTMLDivElement>(null);
  const clusterDisplayName = cluster === 'self_mastery' ? 'Self Mastery' : 'Social Mastery';
  const clusterHashtag = cluster === 'self_mastery' ? 'SelfMastery' : 'SocialMastery';
  
  const shareText = `I've earned the "${archetypeName}" badge in ${clusterDisplayName} through Mind Module! 🧠✨ #MindModule #PersonalDevelopment #${clusterHashtag}`;
  const shareUrl = 'https://mindmodule.app';

  // Get the appropriate icon for this badge
  const IconComponent = badgeId ? BADGE_ICONS[badgeId] : null;
  const FallbackIcon = cluster === 'self_mastery' ? Brain : Users;
  const BadgeIcon = IconComponent || FallbackIcon;

  const handleDownloadImage = async () => {
    if (badgeRef.current) {
      const filename = `mind-module-${archetypeName.toLowerCase().replace(/\s+/g, '-')}-badge`;
      await downloadBadgeAsImage(badgeRef.current, filename);
    }
  };

  // Create darker shade for 3D effect
  const darkerShade = badgeColor.replace(/hsl\(([^,]+),\s*([^,]+),\s*([^)]+)\)/, (_, h, s, l) => {
    const lightness = parseFloat(l);
    return `hsl(${h}, ${s}, ${Math.max(lightness - 15, 10)}%)`;
  });

  return (
    <div className="space-y-4">
      {/* Badge card for capture */}
      <div 
        ref={badgeRef}
        className="relative overflow-hidden rounded-2xl border border-border/50 shadow-xl bg-cream"
      >
        {/* Subtle background pattern */}
        <div 
          className="absolute inset-0 opacity-5"
          style={{ 
            background: `radial-gradient(circle at 30% 20%, ${badgeColor} 0%, transparent 50%),
                         radial-gradient(circle at 70% 80%, hsl(var(--taupe)) 0%, transparent 50%)` 
          }}
        />
        
        {/* Card content */}
        <div className="relative p-6 space-y-6">
          {/* Mind Module Branding */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-forest to-forest/70 flex items-center justify-center">
                <span className="text-white font-bold text-sm">M</span>
              </div>
              <span className="font-heading font-semibold text-foreground">Mind Module</span>
            </div>
            <span className="text-xs text-taupe uppercase tracking-wider font-medium">
              {clusterDisplayName}
            </span>
          </div>

          {/* 3D Badge Icon */}
          <div className="flex justify-center py-4">
            <div 
              className="w-28 h-28 rounded-full flex items-center justify-center relative"
              style={{ 
                background: `linear-gradient(145deg, ${badgeColor} 0%, ${darkerShade} 100%)`,
                boxShadow: `0 8px 24px ${badgeColor}40, 0 4px 12px ${badgeColor}30, inset 0 2px 4px rgba(255,255,255,0.25), inset 0 -2px 4px rgba(0,0,0,0.1)`
              }}
            >
              {/* Inner highlight for 3D effect */}
              <div 
                className="absolute inset-2 rounded-full opacity-20"
                style={{
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.4) 0%, transparent 50%)'
                }}
              />
              <BadgeIcon size={48} className="text-white drop-shadow-lg relative z-10" />
            </div>
          </div>

          {/* Archetype Name */}
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-heading font-bold text-foreground">
              {archetypeName}
            </h3>
            <p className="text-sm text-taupe">
              {achievementName}
            </p>
          </div>

          {/* User Info */}
          {userName && (
            <div className="text-center pt-2 border-t border-taupe/20">
              <p className="text-sm text-foreground font-medium">{userName}</p>
              {earnedDate && (
                <p className="text-xs text-taupe">
                  Earned {earnedDate.toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Share Options (outside the captured area) */}
      <ShareOptions
        shareText={shareText}
        shareUrl={shareUrl}
        onDownloadImage={handleDownloadImage}
        onShare={onShare}
      />
    </div>
  );
};

export default ShareableBadgeCard;
