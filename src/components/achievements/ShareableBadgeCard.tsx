import { useRef } from "react";
import ShareOptions from "./ShareOptions";
import { downloadBadgeAsImage } from "@/utils/badgeImageExport";

interface ShareableBadgeCardProps {
  achievementName: string;
  archetypeName: string;
  cluster: 'self_mastery' | 'social_mastery';
  badgeColor: string;
  userName?: string;
  earnedDate?: Date;
  onShare?: () => void;
}

const ShareableBadgeCard = ({
  achievementName,
  archetypeName,
  cluster,
  badgeColor,
  userName,
  earnedDate,
  onShare
}: ShareableBadgeCardProps) => {
  const badgeRef = useRef<HTMLDivElement>(null);
  const clusterDisplayName = cluster === 'self_mastery' ? 'Self Mastery' : 'Social Mastery';
  const clusterHashtag = cluster === 'self_mastery' ? 'SelfMastery' : 'SocialMastery';
  
  const shareText = `I've earned the "${archetypeName}" badge in ${clusterDisplayName} through Mind Module! 🧠✨ #MindModule #PersonalDevelopment #${clusterHashtag}`;
  const shareUrl = 'https://mindmodule.app';

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
        className="relative overflow-hidden rounded-2xl border border-border/50 shadow-xl bg-background"
      >
        {/* Background gradient based on cluster */}
        <div 
          className="absolute inset-0 opacity-10"
          style={{ 
            background: `linear-gradient(135deg, ${badgeColor} 0%, ${badgeColor}44 100%)` 
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
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              {clusterDisplayName}
            </span>
          </div>

          {/* Badge Icon */}
          <div className="flex justify-center py-4">
            <div 
              className="w-24 h-24 rounded-full flex items-center justify-center shadow-lg"
              style={{ 
                background: `linear-gradient(135deg, ${badgeColor} 0%, ${badgeColor}cc 100%)`,
                boxShadow: `0 8px 32px ${badgeColor}40`
              }}
            >
              <div className="text-center">
                <div className="text-white text-3xl font-bold">
                  {cluster === 'self_mastery' ? '🧘' : '🤝'}
                </div>
              </div>
            </div>
          </div>

          {/* Archetype Name */}
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-heading font-bold text-foreground">
              {archetypeName}
            </h3>
            <p className="text-sm text-muted-foreground">
              {achievementName}
            </p>
          </div>

          {/* User Info */}
          {userName && (
            <div className="text-center pt-2 border-t border-border/30">
              <p className="text-sm text-foreground font-medium">{userName}</p>
              {earnedDate && (
                <p className="text-xs text-muted-foreground">
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
        badgeColor={badgeColor}
      />
    </div>
  );
};

export default ShareableBadgeCard;
