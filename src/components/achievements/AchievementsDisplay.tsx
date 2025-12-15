import { useState } from "react";
import { ChevronRight, Trophy, ScrollText, Sparkles } from "lucide-react";
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
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-900 via-stone-800 to-stone-900 p-6 md:p-8">
      {/* Celebratory glow effects */}
      <div className="absolute top-0 left-1/4 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-32 h-32 bg-amber-400/10 rounded-full blur-2xl" />
      <div className="absolute top-1/2 right-0 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl" />
      
      <div className="relative z-10 space-y-6">
        {/* Celebratory Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <Trophy className="w-7 h-7 text-amber-400" />
            <Sparkles className="w-5 h-5 text-amber-400" />
          </div>
          <h3 className="text-xl md:text-2xl font-heading font-semibold text-white">
            Your Achievements
          </h3>
          <p className="text-sm text-stone-400">
            Celebrate your growth journey
          </p>
        </div>

        {/* Current Archetypes */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Self Mastery */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-amber-400/80 font-medium">Self Mastery</span>
              {selfMasteryCertEligible && !hasCertificateRequest('self_mastery_certificate') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 text-amber-400 hover:text-amber-300 hover:bg-amber-400/10"
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
                <div className="flex items-center gap-4">
                  {/* Hexagonal Badge */}
                  <div className="relative">
                    <div 
                      className="w-16 h-16 rounded-xl rotate-45 flex items-center justify-center shadow-lg"
                      style={{ 
                        backgroundColor: selfMasteryArchetype.badge_color || '#F59E0B',
                        boxShadow: `0 0 20px ${selfMasteryArchetype.badge_color || '#F59E0B'}40`
                      }}
                    >
                      <span className="text-2xl -rotate-45">🧘</span>
                    </div>
                    <div className="absolute inset-0 rounded-xl rotate-45 border-2 border-amber-400/30" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white group-hover:text-amber-300 transition-colors truncate">
                      {selfMasteryArchetype.name}
                    </p>
                    <p className="text-xs text-stone-400 line-clamp-2">
                      {selfMasteryArchetype.description}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-stone-500 group-hover:text-amber-400 transition-colors flex-shrink-0" />
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-4 opacity-60">
                <div className="w-16 h-16 rounded-xl rotate-45 bg-stone-700 flex items-center justify-center">
                  <span className="text-2xl -rotate-45">🔒</span>
                </div>
                <div>
                  <p className="font-medium text-stone-400">No archetype yet</p>
                  <p className="text-xs text-stone-500">Complete 5 scenarios to unlock</p>
                </div>
              </div>
            )}
          </div>

          {/* Social Mastery */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-violet-400/80 font-medium">Social Mastery</span>
              {socialMasteryCertEligible && !hasCertificateRequest('social_mastery_certificate') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 text-violet-400 hover:text-violet-300 hover:bg-violet-400/10"
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
                <div className="flex items-center gap-4">
                  {/* Hexagonal Badge */}
                  <div className="relative">
                    <div 
                      className="w-16 h-16 rounded-xl rotate-45 flex items-center justify-center shadow-lg"
                      style={{ 
                        backgroundColor: socialMasteryArchetype.badge_color || '#8B5CF6',
                        boxShadow: `0 0 20px ${socialMasteryArchetype.badge_color || '#8B5CF6'}40`
                      }}
                    >
                      <span className="text-2xl -rotate-45">🤝</span>
                    </div>
                    <div className="absolute inset-0 rounded-xl rotate-45 border-2 border-violet-400/30" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white group-hover:text-violet-300 transition-colors truncate">
                      {socialMasteryArchetype.name}
                    </p>
                    <p className="text-xs text-stone-400 line-clamp-2">
                      {socialMasteryArchetype.description}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-stone-500 group-hover:text-violet-400 transition-colors flex-shrink-0" />
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-4 opacity-60">
                <div className="w-16 h-16 rounded-xl rotate-45 bg-stone-700 flex items-center justify-center">
                  <span className="text-2xl -rotate-45">🔒</span>
                </div>
                <div>
                  <p className="font-medium text-stone-400">No archetype yet</p>
                  <p className="text-xs text-stone-500">Complete 5 scenarios to unlock</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* All Earned Badges */}
        {earnedAchievements.length > 0 && (
          <div className="space-y-3 pt-2">
            <p className="text-sm text-stone-400 font-medium">All earned badges</p>
            <div className="flex flex-wrap gap-3">
              {earnedAchievements.map(achievement => (
                <button
                  key={achievement.id}
                  onClick={() => setSelectedAchievement(achievement.achievement_id)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-amber-400/30 transition-all group"
                >
                  <div 
                    className="w-6 h-6 rounded-md rotate-45 flex items-center justify-center"
                    style={{ backgroundColor: achievement.definition?.badge_color || '#F59E0B' }}
                  >
                    <Trophy size={12} className="text-white -rotate-45" />
                  </div>
                  <span className="text-sm font-medium text-stone-300 group-hover:text-white transition-colors">
                    {achievement.definition?.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

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
