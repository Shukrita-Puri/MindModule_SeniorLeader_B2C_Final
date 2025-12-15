import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const clusterDisplayName = cluster === 'self_mastery' ? 'Self Mastery' : 'Social Mastery';
  
  const generateLinkedInShareUrl = () => {
    const text = `I've earned the "${archetypeName}" achievement in ${clusterDisplayName} through Mind Module's dialogue practice platform. 🧠✨ #MindModule #PersonalDevelopment #${clusterDisplayName.replace(' ', '')}`;
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://mindmodule.app')}&summary=${encodeURIComponent(text)}`;
  };

  const handleShare = () => {
    window.open(generateLinkedInShareUrl(), '_blank', 'width=600,height=400');
    onShare?.();
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/50 shadow-xl">
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

        {/* Share Button */}
        <Button 
          onClick={handleShare}
          className="w-full"
          style={{ 
            backgroundColor: badgeColor,
            color: 'white'
          }}
        >
          <Share2 size={16} className="mr-2" />
          Share on LinkedIn
        </Button>
      </div>
    </div>
  );
};

export default ShareableBadgeCard;
