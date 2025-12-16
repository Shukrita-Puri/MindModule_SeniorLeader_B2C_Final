import { useRef } from "react";
import { Eye, Radar, Gauge, Shield, Trophy, UserPlus, HeartHandshake, Zap, Star, Gem, Brain, Users, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import ShareOptions from "./ShareOptions";
import { downloadBadgeAsImage } from "@/utils/badgeImageExport";

// Badge config - must match HexBadge.tsx exactly
const BADGE_CONFIG: Record<string, { 
  icon: LucideIcon; 
  gradient: string;
  glowColor: string;
}> = {
  // Self Mastery (warm tones)
  'self_mastery_initiate': { 
    icon: Eye, 
    gradient: 'from-amber-400 via-orange-300 to-yellow-400',
    glowColor: 'rgba(251, 191, 36, 0.5)'
  },
  'self_mastery_practitioner': { 
    icon: Radar, 
    gradient: 'from-orange-300 via-amber-200 to-yellow-300',
    glowColor: 'rgba(253, 186, 116, 0.5)'
  },
  'self_mastery_adept': { 
    icon: Gauge, 
    gradient: 'from-orange-500 via-amber-400 to-orange-400',
    glowColor: 'rgba(249, 115, 22, 0.5)'
  },
  'self_mastery_badge': { 
    icon: Shield, 
    gradient: 'from-yellow-500 via-amber-500 to-orange-500',
    glowColor: 'rgba(245, 158, 11, 0.6)'
  },
  'self_mastery_certificate': { 
    icon: Trophy, 
    gradient: 'from-yellow-600 via-amber-600 to-orange-600',
    glowColor: 'rgba(217, 119, 6, 0.6)'
  },
  // Social Mastery (cool tones)
  'social_mastery_initiate': { 
    icon: UserPlus, 
    gradient: 'from-violet-400 via-purple-300 to-indigo-400',
    glowColor: 'rgba(167, 139, 250, 0.5)'
  },
  'social_mastery_practitioner': { 
    icon: HeartHandshake, 
    gradient: 'from-pink-400 via-rose-300 to-red-300',
    glowColor: 'rgba(251, 113, 133, 0.5)'
  },
  'social_mastery_adept': { 
    icon: Zap, 
    gradient: 'from-purple-500 via-violet-400 to-indigo-500',
    glowColor: 'rgba(139, 92, 246, 0.5)'
  },
  'social_mastery_badge': { 
    icon: Star, 
    gradient: 'from-indigo-500 via-purple-500 to-violet-500',
    glowColor: 'rgba(99, 102, 241, 0.6)'
  },
  'social_mastery_certificate': { 
    icon: Gem, 
    gradient: 'from-purple-600 via-indigo-600 to-violet-600',
    glowColor: 'rgba(124, 58, 237, 0.6)'
  },
};

// Fallback icons by cluster
const FALLBACK_ICONS: Record<string, LucideIcon> = {
  'self_mastery': Brain,
  'social_mastery': Users,
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

  // Get badge config
  const config = badgeId ? BADGE_CONFIG[badgeId] : null;
  const BadgeIcon = config?.icon || FALLBACK_ICONS[cluster] || Brain;

  const handleDownloadImage = async () => {
    if (badgeRef.current) {
      const filename = `mind-module-${archetypeName.toLowerCase().replace(/\s+/g, '-')}-badge`;
      await downloadBadgeAsImage(badgeRef.current, filename);
    }
  };

  return (
    <div className="space-y-4">
      {/* Badge card for capture */}
      <div 
        ref={badgeRef}
        className="relative overflow-hidden rounded-2xl border border-border/50 shadow-xl bg-cream"
      >
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

          {/* Hexagon Badge - matching HexBadge exactly */}
          <div className="flex justify-center py-4">
            <div className="relative w-24 h-28">
              {/* Hexagon Container */}
              <div 
                className="hex-badge-3d hex-badge-3d-earned w-full h-full flex items-center justify-center relative"
                style={config ? {
                  '--glow-color': config.glowColor,
                } as React.CSSProperties : undefined}
              >
                {/* Background gradient */}
                {config && (
                  <div className={cn(
                    "absolute inset-0 hex-badge-3d bg-gradient-to-br",
                    config.gradient
                  )} />
                )}
                
                {/* Shine overlay */}
                <div className="absolute inset-0 hex-badge-3d hex-badge-shine" />

                {/* Icon */}
                <BadgeIcon 
                  size={40} 
                  className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] relative z-10" 
                />
              </div>
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
