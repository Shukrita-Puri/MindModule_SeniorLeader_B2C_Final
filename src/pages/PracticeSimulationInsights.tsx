import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import TopNavigation from "@/components/simulation/TopNavigation";
import SimulationHeader from "@/components/simulation/SimulationHeader";
import SessionContextCard from "@/components/simulation/SessionContextCard";
import StrengthsSection from "@/components/simulation/StrengthsSection";
import DevelopmentAreasSection from "@/components/simulation/DevelopmentAreasSection";
import FrameworksUsedSection from "@/components/simulation/FrameworksUsedSection";
import TranscriptReplaySection from "@/components/simulation/TranscriptReplaySection";
import PersonalReflectionSection from "@/components/simulation/PersonalReflectionSection";
import AchievementsDisplay from "@/components/achievements/AchievementsDisplay";
import PrivacyFooter from "@/components/home/PrivacyFooter";
import ScheduleFollowupModal from "@/components/simulation/ScheduleFollowupModal";
import { useSessionDebrief } from "@/hooks/useSessionDebrief";
import { useSavedDebriefs } from "@/hooks/useSavedDebriefs";
import { useMetaSkillProgress } from "@/hooks/useMetaSkillProgress";
import { useAchievements } from "@/hooks/useAchievements";
import { generateDebriefPdf } from "@/utils/generateDebriefPdf";
import { toast } from "sonner";
import { Loader2, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const PracticeSimulationInsights = () => {
  const location = useLocation();
  const { 
    sessionId,
    scenarioDomain, 
    contextType, 
    scenarioContext, 
    sessionDuration, 
    selectedPersonas, 
    customPersonas,
    personaType
  } = location.state || {};
  
  const [personalNotes, setPersonalNotes] = useState("");
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Fetch real session data
  const { 
    session, 
    transcript, 
    strengths, 
    developmentAreas, 
    frameworks, 
    isLoading, 
    error 
  } = useSessionDebrief(sessionId);

  // Hooks for saving and tracking
  const { saveDebrief, isSaving } = useSavedDebriefs();
  const { updateAfterSession } = useMetaSkillProgress();
  const { checkAndAwardAchievements } = useAchievements();

  // Use session data or fallback to location state
  const displayDomain = session?.scenario_context?.scenarioDomain || scenarioDomain;
  const displayContext = session?.scenario_context?.scenarioContext || scenarioContext;
  const displayPersonas = session?.scenario_context?.selectedPersonas || selectedPersonas;
  const displayCustomPersonas = session?.scenario_context?.customPersonas || customPersonas;
  const displayDuration = session?.duration_seconds || sessionDuration;

  // Track if we've already processed this session
  const [hasUpdatedProgress, setHasUpdatedProgress] = useState(false);

  // Get progress data for achievement checking
  const { selfMastery, socialMastery } = useMetaSkillProgress();

  // Update meta-skill progress when session data loads
  useEffect(() => {
    const updateProgress = async () => {
      if (!sessionId || hasUpdatedProgress) return;
      if (strengths.length === 0 && developmentAreas.length === 0) return;

      // Determine cluster from scenario domain
      const cluster = displayDomain?.includes('social') ? 'social_mastery' : 'self_mastery';
      
      const strengthsForUpdate = strengths.map(s => ({
        metaSkill: s.metaSkill,
        cluster
      }));
      
      const gapsForUpdate = developmentAreas.map(d => ({
        metaSkill: d.metaSkill,
        cluster
      }));

      await updateAfterSession(sessionId, strengthsForUpdate, gapsForUpdate);
      setHasUpdatedProgress(true);

      // Check for new achievements
      const progress = cluster === 'self_mastery' ? selfMastery : socialMastery;
      if (progress) {
        await checkAndAwardAchievements(cluster, progress.scenariosPracticed + 1, progress.currentScore);
      }
    };

    updateProgress();
  }, [sessionId, strengths, developmentAreas, displayDomain, hasUpdatedProgress, updateAfterSession, checkAndAwardAchievements, selfMastery, socialMastery]);

  const handleDownload = () => {
    generateDebriefPdf({
      scenarioDomain: displayDomain,
      contextType,
      scenarioContext: displayContext,
      sessionDuration: displayDuration,
      mentalFitnessScore: undefined,
      mentalFitnessChange: undefined,
      strengths: strengths.map(s => `${s.metaSkill}${s.subSkill ? ` - ${s.subSkill}` : ''}`),
      blindSpots: developmentAreas.map(d => d.observation),
      mentalModels: frameworks.map(f => f.name),
      personalNotes,
      date: new Date(),
    });
    toast.success("Debrief exported as PDF");
  };

  const handleScheduleFollowup = () => {
    setShowCalendarModal(true);
  };

  const handleSaveToArchive = async () => {
    try {
      await saveDebrief({
        sessionId,
        title: `${displayDomain || 'Dialogue'} Session - ${new Date().toLocaleDateString()}`,
        scenarioDomain: displayDomain,
        scenarioContext: displayContext,
        personaType,
        durationSeconds: typeof displayDuration === 'number' ? displayDuration : undefined,
        strengths,
        developmentAreas,
        frameworks,
        transcript,
        personalNotes
      });
      setIsSaved(true);
      toast.success("Debrief saved to your archive");
    } catch (err) {
      toast.error("Failed to save debrief");
    }
  };

  const handleSaveNotes = () => {
    toast.success("Notes saved");
  };

  if (isLoading) {
    return (
      <div className="relative flex min-h-screen flex-col font-editorial">
        <TopNavigation backPath="/practice/simulation" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-forest" />
            <p className="text-muted-foreground">Loading session insights...</p>
          </div>
        </div>
        <MainNavigation />
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative flex min-h-screen flex-col font-editorial">
        <TopNavigation backPath="/practice/simulation" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 px-6">
            <p className="text-destructive">Failed to load session data</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
        <MainNavigation />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col font-editorial pb-20">
      <TopNavigation backPath="/practice/simulation" />
      
      <SimulationHeader 
        contextType={contextType}
        sessionDuration={displayDuration}
        onDownload={handleDownload}
        onScheduleFollowup={handleScheduleFollowup}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 md:px-8 py-8 space-y-8 max-w-5xl mx-auto pb-32">
          {/* Compact Session Context */}
          <SessionContextCard 
            scenarioDomain={displayDomain}
            contextType={contextType}
            scenarioContext={displayContext}
            selectedPersonas={displayPersonas}
            customPersonas={displayCustomPersonas}
            sessionDuration={displayDuration}
          />

          {/* Save to Archive Button */}
          <Button
            onClick={handleSaveToArchive}
            disabled={isSaving || isSaved}
            variant="outline"
            className="w-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : isSaved ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Saved to Archive
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save to My Archive
              </>
            )}
          </Button>
          
          <div className="border-t border-gold/40 my-8" />

          {/* Transcript Replay */}
          <TranscriptReplaySection transcript={transcript} />
          
          {transcript.length > 0 && <div className="border-t border-gold/40 my-8" />}
          
          {/* Strengths */}
          <StrengthsSection strengths={strengths} />
          
          <div className="border-t border-gold/40 my-8" />
          
          {/* Development Areas */}
          <DevelopmentAreasSection developmentAreas={developmentAreas} />
          
          <div className="border-t border-gold/40 my-8" />
          
          {/* Frameworks Used */}
          <FrameworksUsedSection frameworks={frameworks} />

          <div className="border-t border-gold/40 my-8" />

          {/* Achievements */}
          <AchievementsDisplay />

          <div className="border-t border-gold/40 my-8" />
          
          {/* Personal Reflection */}
          <PersonalReflectionSection 
            personalNotes={personalNotes}
            setPersonalNotes={setPersonalNotes}
            onSaveNotes={handleSaveNotes}
          />
        </div>
      </div>

      {/* Schedule Followup Modal */}
      <ScheduleFollowupModal
        isOpen={showCalendarModal}
        onClose={() => setShowCalendarModal(false)}
        scenarioTitle={contextType}
      />

      <PrivacyFooter />
      <MainNavigation />
    </div>
  );
};

export default PracticeSimulationInsights;
