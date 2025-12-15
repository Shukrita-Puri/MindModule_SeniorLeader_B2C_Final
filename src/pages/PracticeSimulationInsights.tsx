import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import MainNavigation from "@/components/MainNavigation";
import TopNavigation from "@/components/simulation/TopNavigation";
import SimulationHeader from "@/components/simulation/SimulationHeader";
import StrengthsSection, { EnhancedStrength } from "@/components/simulation/StrengthsSection";
import BlindSpotsSection, { BlindSpot } from "@/components/simulation/BlindSpotsSection";
import FrameworksUsedSection from "@/components/simulation/FrameworksUsedSection";
import PersonalReflectionSection from "@/components/simulation/PersonalReflectionSection";
import MetaSkillProgressSection from "@/components/simulation/MetaSkillProgressSection";
import AchievementsDisplay from "@/components/achievements/AchievementsDisplay";
import PrivacyFooter from "@/components/home/PrivacyFooter";
import ScheduleFollowupModal from "@/components/simulation/ScheduleFollowupModal";
import { useSessionDebrief } from "@/hooks/useSessionDebrief";
import { useSavedDebriefs } from "@/hooks/useSavedDebriefs";
import { useMetaSkillProgress } from "@/hooks/useMetaSkillProgress";
import { useAchievements } from "@/hooks/useAchievements";
import { generateDebriefPdf, generateTranscriptPdf } from "@/utils/generateDebriefPdf";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const PracticeSimulationInsights = () => {
  const location = useLocation();
  const { 
    sessionId: stateSessionId,
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
  const [fallbackSessionId, setFallbackSessionId] = useState<string | null>(null);
  
  // LLM-enhanced insights state
  const [enhancedStrengths, setEnhancedStrengths] = useState<EnhancedStrength[]>([]);
  const [enhancedBlindSpots, setEnhancedBlindSpots] = useState<BlindSpot[]>([]);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  // Use state sessionId or fallback to most recent session
  const sessionId = stateSessionId || fallbackSessionId;

  // If no sessionId from navigation, try to load the most recent session
  useEffect(() => {
    const loadMostRecentSession = async () => {
      if (stateSessionId) return;
      
      try {
        const { data, error } = await supabase
          .from('dialogue_sessions')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (data && !error) {
          console.log('[PracticeSimulationInsights] Loaded fallback sessionId:', data.id);
          setFallbackSessionId(data.id);
        }
      } catch (err) {
        console.error('[PracticeSimulationInsights] Failed to load recent session:', err);
      }
    };
    
    loadMostRecentSession();
  }, [stateSessionId]);

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
  const { updateAfterSession, selfMastery, socialMastery } = useMetaSkillProgress();
  const { checkAndAwardAchievements } = useAchievements();

  // Use session data or fallback to location state
  const displayDomain = session?.scenario_context?.scenarioDomain || scenarioDomain;
  const displayContext = session?.scenario_context?.scenarioContext || scenarioContext;
  const displayPersonas = session?.scenario_context?.selectedPersonas || selectedPersonas;
  const displayCustomPersonas = session?.scenario_context?.customPersonas || customPersonas;
  const displayDuration = session?.duration_seconds || sessionDuration;

  // Track if we've already processed this session
  const [hasUpdatedProgress, setHasUpdatedProgress] = useState(false);
  const [hasGeneratedInsights, setHasGeneratedInsights] = useState(false);

  // Generate LLM-enhanced insights when session data loads
  useEffect(() => {
    const generateInsights = async () => {
      if (hasGeneratedInsights) return;
      if (strengths.length === 0 && developmentAreas.length === 0) return;
      
      setIsGeneratingInsights(true);
      
      try {
        const { data, error } = await supabase.functions.invoke('generate-debrief-insights', {
          body: {
            strengths: strengths.map(s => ({
              metaSkill: s.metaSkill,
              subSkill: s.subSkill,
              indicators: s.indicators
            })),
            developmentAreas: developmentAreas.map(d => ({
              metaSkill: d.metaSkill,
              subSkill: d.subSkill,
              observation: d.observation,
              actionSuggested: d.actionSuggested
            })),
            scenarioContext: {
              domain: displayDomain,
              context: displayContext,
              duration: displayDuration
            }
          }
        });

        if (error) throw error;

        if (data?.enhancedStrengths) {
          setEnhancedStrengths(data.enhancedStrengths);
        }
        if (data?.enhancedBlindSpots) {
          setEnhancedBlindSpots(data.enhancedBlindSpots);
        }
        
        setHasGeneratedInsights(true);
      } catch (err) {
        console.error('[PracticeSimulationInsights] Failed to generate insights:', err);
        // Fall back to original data
        setEnhancedStrengths(strengths.map(s => ({
          metaSkill: s.metaSkill,
          subSkill: s.subSkill,
          description: s.indicators?.join('. '),
          indicators: s.indicators
        })));
        setEnhancedBlindSpots(developmentAreas.map(d => ({
          metaSkill: d.metaSkill,
          subSkill: d.subSkill,
          observation: d.observation,
          actionSuggested: d.actionSuggested
        })));
        setHasGeneratedInsights(true);
      } finally {
        setIsGeneratingInsights(false);
      }
    };

    generateInsights();
  }, [strengths, developmentAreas, displayDomain, displayContext, displayDuration, hasGeneratedInsights]);

  // Meta-skill to cluster mapping
  const SKILL_CLUSTER_MAP: Record<string, 'self_mastery' | 'social_mastery'> = {
    // Self Mastery skills
    'Emotional Intelligence': 'self_mastery',
    'Self-Regulation': 'self_mastery',
    'Learning Agility': 'self_mastery',
    'Emotional Resilience': 'self_mastery',
    'emotional_regulation': 'self_mastery',
    'focus': 'self_mastery',
    'discipline': 'self_mastery',
    'self_awareness': 'self_mastery',
    // Social Mastery skills
    'Communication': 'social_mastery',
    'Empathy': 'social_mastery',
    'Perspective Taking': 'social_mastery',
    'Influence': 'social_mastery',
    'empathy': 'social_mastery',
    'perspective_taking': 'social_mastery',
    'communication': 'social_mastery',
    'influence': 'social_mastery',
  };

  // Update meta-skill progress when session data loads
  useEffect(() => {
    const updateProgress = async () => {
      if (!sessionId || hasUpdatedProgress) return;
      if (strengths.length === 0 && developmentAreas.length === 0) return;

      console.log('[MetaSkillTracking] Processing session:', sessionId);

      // Map each skill to its correct cluster
      const strengthsForUpdate = strengths.map(s => ({
        metaSkill: s.metaSkill,
        cluster: SKILL_CLUSTER_MAP[s.metaSkill] || 'self_mastery'
      }));
      
      const gapsForUpdate = developmentAreas.map(d => ({
        metaSkill: d.metaSkill,
        cluster: SKILL_CLUSTER_MAP[d.metaSkill] || 'self_mastery'
      }));

      console.log('[MetaSkillTracking] Strengths:', strengthsForUpdate);
      console.log('[MetaSkillTracking] Gaps:', gapsForUpdate);

      await updateAfterSession(sessionId, strengthsForUpdate, gapsForUpdate);
      setHasUpdatedProgress(true);
      
      console.log('[MetaSkillTracking] Progress update complete');

      // Check achievements for both clusters if applicable
      const selfStrengths = strengthsForUpdate.filter(s => s.cluster === 'self_mastery');
      const socialStrengths = strengthsForUpdate.filter(s => s.cluster === 'social_mastery');

      if (selfStrengths.length > 0 && selfMastery) {
        await checkAndAwardAchievements('self_mastery', selfMastery.scenariosPracticed + 1, selfMastery.currentScore);
      }
      if (socialStrengths.length > 0 && socialMastery) {
        await checkAndAwardAchievements('social_mastery', socialMastery.scenariosPracticed + 1, socialMastery.currentScore);
      }
    };

    updateProgress();
  }, [sessionId, strengths, developmentAreas, hasUpdatedProgress, updateAfterSession, checkAndAwardAchievements, selfMastery, socialMastery]);

  // Format meta-skill progress for display
  const formatMetaSkillProgress = (progress: typeof selfMastery) => {
    if (!progress) return null;
    return {
      currentScore: progress.currentScore,
      baselineScore: progress.baselineScore,
      change: progress.change,
      scenariosPracticed: progress.scenariosPracticed
    };
  };

  const handleDownload = () => {
    // Get session context from session data or location state
    const sessionContext = session?.scenario_context as Record<string, unknown> || {};
    const category = sessionContext?.category || sessionContext?.scenarioDomain || displayDomain || 'Dialogue Practice';
    const scenario = sessionContext?.scenario || sessionContext?.scenarioContext || contextType || displayContext || 'Practice Session';
    const duration = displayDuration || session?.duration_seconds;
    const exchangeCount = transcript.length || session?.total_messages || 0;
    const interventionCount = session?.total_interventions || 0;

    console.log('[PDF Generation] Session context:', { category, scenario, duration, exchangeCount, interventionCount });
    console.log('[PDF Generation] Meta-skill progress:', { selfMastery, socialMastery });

    const pdfStrengths = (enhancedStrengths.length > 0 ? enhancedStrengths : strengths).map(s => {
      if ('description' in s && s.description) {
        return `${s.metaSkill}${s.subSkill ? ` → ${s.subSkill}` : ''}: ${s.description}`;
      }
      const indicators = s.indicators?.join(', ') || '';
      return `${s.metaSkill}${s.subSkill ? ` → ${s.subSkill}` : ''}${indicators ? `: ${indicators}` : ''}`;
    });
    
    const pdfBlindSpots = (enhancedBlindSpots.length > 0 ? enhancedBlindSpots : developmentAreas).map(d => {
      const parts = [];
      if (d.metaSkill) parts.push(d.metaSkill);
      if (d.subSkill) parts.push(`→ ${d.subSkill}`);
      if (d.observation) parts.push(`: ${d.observation}`);
      if (d.actionSuggested) parts.push(`\nAction: ${d.actionSuggested}`);
      return parts.join(' ');
    });
    
    const pdfFrameworks = frameworks.map(f => f.name);
    
    generateDebriefPdf({
      scenarioDomain: category,
      contextType: scenario,
      scenarioContext: displayContext,
      sessionDuration: duration,
      exchangeCount,
      interventionCount,
      mentalFitnessScore: undefined,
      mentalFitnessChange: undefined,
      strengths: pdfStrengths,
      blindSpots: pdfBlindSpots,
      mentalModels: pdfFrameworks,
      personalNotes,
      date: new Date(),
      transcript,
      selfMastery: formatMetaSkillProgress(selfMastery),
      socialMastery: formatMetaSkillProgress(socialMastery),
    });
    toast.success("Debrief exported as PDF");
  };

  const handleDownloadTranscript = () => {
    if (transcript.length === 0) {
      toast.error("No transcript available to download");
      return;
    }
    generateTranscriptPdf(transcript, `${displayDomain || 'Dialogue'} - ${contextType || 'Session'}`);
    toast.success("Transcript exported as PDF");
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
        onDownloadTranscript={transcript.length > 0 ? handleDownloadTranscript : undefined}
        onDownload={handleDownload}
        onScheduleFollowup={handleScheduleFollowup}
        onSaveToArchive={handleSaveToArchive}
        isSaving={isSaving}
        isSaved={isSaved}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 md:px-8 py-8 space-y-8 max-w-5xl mx-auto pb-32">
          {/* Session Summary */}
          <div className="space-y-2">
            <h3 className="text-lg font-heading font-medium text-foreground">Session Summary</h3>
            <p className="text-sm text-muted-foreground">
              {[
                displayDomain,
                contextType,
                displayDuration ? `${typeof displayDuration === 'number' ? Math.round(displayDuration / 60) : displayDuration} min` : null,
                transcript.length > 0 ? `${transcript.length} exchanges` : null,
                session?.total_interventions ? `${session.total_interventions} coach interventions` : null
              ].filter(Boolean).join(' • ')}
            </p>
          </div>
          
          <div className="border-t border-gold/40 my-8" />

          {/* Meta-Skill Progress */}
          <MetaSkillProgressSection 
            selfMastery={formatMetaSkillProgress(selfMastery)}
            socialMastery={formatMetaSkillProgress(socialMastery)}
          />

          <div className="border-t border-gold/40 my-8" />
          
          {/* Strengths with LLM-enhanced content */}
          <StrengthsSection 
            strengths={enhancedStrengths.length > 0 ? enhancedStrengths : strengths} 
            isGenerating={isGeneratingInsights}
          />
          
          <div className="border-t border-gold/40 my-8" />
          
          {/* Blind Spots with LLM-enhanced content */}
          <BlindSpotsSection 
            blindSpots={enhancedBlindSpots.length > 0 ? enhancedBlindSpots : developmentAreas}
            isGenerating={isGeneratingInsights}
          />
          
          <div className="border-t border-gold/40 my-8" />
          
          {/* Frameworks Used */}
          <FrameworksUsedSection frameworks={frameworks} />

          <div className="border-t border-gold/40 my-8" />

          {/* Personal Reflection */}
          <PersonalReflectionSection 
            personalNotes={personalNotes}
            setPersonalNotes={setPersonalNotes}
            onSaveNotes={handleSaveNotes}
          />

          <div className="border-t border-gold/40 my-8" />

          {/* Achievements - Celebratory finale */}
          <AchievementsDisplay />
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
