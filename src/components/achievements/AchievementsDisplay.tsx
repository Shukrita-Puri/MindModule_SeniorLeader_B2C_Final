import { useState } from "react";
import { Award, ChevronRight, Trophy, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAchievements } from "@/hooks/useAchievements";
import ShareableBadgeCard from "./ShareableBadgeCard";
import CertificateRequestModal from "./CertificateRequestModal";

const AchievementsDisplay = () => {
  const { 
    earnedAchievements, 
    definitions,
    isLoading,
    getCurrentArchetype,
    isEligibleForCertificate,
    hasCertificateRequest,
    markAsShared
  } = useAchievements();

  const [selectedAchievement, setSelectedAchievement] = useState<string | null>(null);
  const [showCertificateModal, setShowCertificateModal] = useState<string | null>(null);

  const selfMasteryArchetype = getCurrentArchetype('self_mastery');
  const socialMasteryArchetype = getCurrentArchetype('social_mastery');

  const selfMasteryCertEligible = isEligibleForCertificate('self_mastery');
  const socialMasteryCertEligible = isEligibleForCertificate('social_mastery');

  const selectedDef = definitions.find(d => d.id === selectedAchievement);
  const selectedEarned = earnedAchievements.find(a => a.achievement_id === selectedAchievement);

  if (isLoading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading achievements...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-heading font-medium text-foreground flex items-center gap-2">
        <Trophy size={20} className="text-amber-500" />
        Your Achievements
      </h3>

      {/* Current Archetypes */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Self Mastery */}
        <div className="bg-muted/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Self Mastery</span>
            {selfMasteryCertEligible && !hasCertificateRequest('self_mastery_certificate') && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => setShowCertificateModal('self_mastery_certificate')}
              >
                <ScrollText size={14} className="mr-1" />
                Request Certificate
              </Button>
            )}
          </div>
          
          {selfMasteryArchetype ? (
            <button
              onClick={() => setSelectedAchievement(selfMasteryArchetype.id)}
              className="w-full text-left group"
            >
              <div className="flex items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl"
                  style={{ backgroundColor: selfMasteryArchetype.badge_color || '#10B981' }}
                >
                  🧘
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground group-hover:text-forest transition-colors">
                    {selfMasteryArchetype.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selfMasteryArchetype.description}
                  </p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground group-hover:text-forest" />
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-3 opacity-50">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-xl">
                🔒
              </div>
              <div>
                <p className="font-medium text-muted-foreground">No archetype yet</p>
                <p className="text-xs text-muted-foreground">Complete 5 scenarios to unlock</p>
              </div>
            </div>
          )}
        </div>

        {/* Social Mastery */}
        <div className="bg-muted/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Social Mastery</span>
            {socialMasteryCertEligible && !hasCertificateRequest('social_mastery_certificate') && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => setShowCertificateModal('social_mastery_certificate')}
              >
                <ScrollText size={14} className="mr-1" />
                Request Certificate
              </Button>
            )}
          </div>
          
          {socialMasteryArchetype ? (
            <button
              onClick={() => setSelectedAchievement(socialMasteryArchetype.id)}
              className="w-full text-left group"
            >
              <div className="flex items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl"
                  style={{ backgroundColor: socialMasteryArchetype.badge_color || '#6366F1' }}
                >
                  🤝
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground group-hover:text-forest transition-colors">
                    {socialMasteryArchetype.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {socialMasteryArchetype.description}
                  </p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground group-hover:text-forest" />
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-3 opacity-50">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-xl">
                🔒
              </div>
              <div>
                <p className="font-medium text-muted-foreground">No archetype yet</p>
                <p className="text-xs text-muted-foreground">Complete 5 scenarios to unlock</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* All Earned Badges */}
      {earnedAchievements.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">All earned badges</p>
          <div className="flex flex-wrap gap-2">
            {earnedAchievements.map(achievement => (
              <button
                key={achievement.id}
                onClick={() => setSelectedAchievement(achievement.achievement_id)}
                className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
              >
                <Award 
                  size={16} 
                  style={{ color: achievement.definition?.badge_color || '#10B981' }} 
                />
                <span className="text-sm font-medium">{achievement.definition?.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Badge Detail Modal */}
      <Dialog open={!!selectedAchievement} onOpenChange={() => setSelectedAchievement(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Achievement Badge</DialogTitle>
          </DialogHeader>
          
          {selectedDef && selectedEarned && (
            <ShareableBadgeCard
              achievementName={selectedDef.description || ''}
              archetypeName={selectedDef.name}
              cluster={selectedDef.cluster as 'self_mastery' | 'social_mastery'}
              badgeColor={selectedDef.badge_color || '#10B981'}
              earnedDate={new Date(selectedEarned.earned_at)}
              onShare={() => markAsShared(selectedDef.id)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Certificate Request Modal */}
      {showCertificateModal && (
        <CertificateRequestModal
          achievementId={showCertificateModal}
          onClose={() => setShowCertificateModal(null)}
        />
      )}
    </div>
  );
};

export default AchievementsDisplay;
