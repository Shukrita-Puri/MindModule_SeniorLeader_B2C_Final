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
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-50 via-yellow-50/80 to-orange-50/60 border border-amber-200/50 p-6 md:p-8">
      {/* Celebratory glow effects */}
      <div className="absolute top-0 left-1/4 w-48 h-48 bg-saffron/15 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-32 h-32 bg-gold/20 rounded-full blur-2xl" />
      <div className="absolute top-1/2 right-0 w-24 h-24 bg-amber-300/15 rounded-full blur-2xl" />
      
      <div className="relative z-10 space-y-6">
        {/* Celebratory Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <Trophy className="w-7 h-7 text-amber-600" />
            <Sparkles className="w-5 h-5 text-amber-500" />
          </div>
          <h3 className="text-xl md:text-2xl font-heading font-semibold text-foreground">
            Your Achievements
          </h3>
          <p className="text-sm text-muted-foreground">
            Celebrate your growth journey
          </p>
        </div>

        {/* Current Archetypes */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Self Mastery */}
          <div className="bg-white/60 backdrop-blur-sm border border-amber-200/50 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-amber-700 font-medium">Self Mastery</span>
              {selfMasteryCertEligible && !hasCertificateRequest('self_mastery_certificate') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 text-amber-600 hover:text-amber-700 hover:bg-amber-100"
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
                    <p className="font-semibold text-foreground group-hover:text-amber-700 transition-colors truncate">
                      {selfMasteryArchetype.name}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {selfMasteryArchetype.description}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-muted-foreground group-hover:text-amber-600 transition-colors flex-shrink-0" />
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-4 opacity-60">
                <div className="w-16 h-16 rounded-xl rotate-45 bg-amber-200/50 flex items-center justify-center">
                  <span className="text-2xl -rotate-45">🔒</span>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">No archetype yet</p>
                  <p className="text-xs text-muted-foreground">Complete 5 scenarios to unlock</p>
                </div>
              </div>
            )}
          </div>

          {/* Social Mastery */}
          <div className="bg-white/60 backdrop-blur-sm border border-slate-200/50 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-slate-600 font-medium">Social Mastery</span>
              {socialMasteryCertEligible && !hasCertificateRequest('social_mastery_certificate') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 text-slate-600 hover:text-slate-700 hover:bg-slate-100"
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
                        backgroundColor: socialMasteryArchetype.badge_color || '#64748B',
                        boxShadow: `0 0 20px ${socialMasteryArchetype.badge_color || '#64748B'}40`
                      }}
                    >
                      <span className="text-2xl -rotate-45">🤝</span>
                    </div>
                    <div className="absolute inset-0 rounded-xl rotate-45 border-2 border-slate-400/30" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground group-hover:text-slate-700 transition-colors truncate">
                      {socialMasteryArchetype.name}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {socialMasteryArchetype.description}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-muted-foreground group-hover:text-slate-600 transition-colors flex-shrink-0" />
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-4 opacity-60">
                <div className="w-16 h-16 rounded-xl rotate-45 bg-slate-200/50 flex items-center justify-center">
                  <span className="text-2xl -rotate-45">🔒</span>
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
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground font-medium">All earned badges</p>
            <div className="flex flex-wrap gap-3">
              {earnedAchievements.map(achievement => (
                <button
                  key={achievement.id}
                  onClick={() => setSelectedAchievement(achievement.achievement_id)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/60 border border-amber-200/50 rounded-xl hover:bg-white/80 hover:border-amber-300 transition-all group"
                >
                  <div 
                    className="w-6 h-6 rounded-md rotate-45 flex items-center justify-center"
                    style={{ backgroundColor: achievement.definition?.badge_color || '#F59E0B' }}
                  >
                    <Trophy size={12} className="text-white -rotate-45" />
                  </div>
                  <span className="text-sm font-medium text-foreground group-hover:text-amber-700 transition-colors">
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
