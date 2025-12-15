import { useState } from "react";
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
import PrivacyFooter from "@/components/home/PrivacyFooter";
import ScheduleFollowupModal from "@/components/simulation/ScheduleFollowupModal";
import { useSessionDebrief } from "@/hooks/useSessionDebrief";
import { generateDebriefPdf } from "@/utils/generateDebriefPdf";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const PracticeSimulationInsights = () => {
  const location = useLocation();
  const { 
    sessionId,
    scenarioDomain, 
    contextType, 
    scenarioContext, 
    sessionDuration, 
    selectedPersonas, 
    customPersonas 
  } = location.state || {};
  
  const [personalNotes, setPersonalNotes] = useState("");
  const [showCalendarModal, setShowCalendarModal] = useState(false);

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

  // Use session data or fallback to location state
  const displayDomain = session?.scenario_context?.scenarioDomain || scenarioDomain;
  const displayContext = session?.scenario_context?.scenarioContext || scenarioContext;
  const displayPersonas = session?.scenario_context?.selectedPersonas || selectedPersonas;
  const displayCustomPersonas = session?.scenario_context?.customPersonas || customPersonas;
  const displayDuration = session?.duration_seconds || sessionDuration;

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

  const handleSaveNotes = () => {
    console.log("Saving to learning archive...");
    toast.success("Notes saved to your learning archive");
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
          
          <div className="border-t border-gold/40 my-8" />

          {/* Transcript Replay */}
          <TranscriptReplaySection transcript={transcript} />
          
          {transcript.length > 0 && <div className="border-t border-gold/40 my-8" />}
          
          {/* Strengths */}
          <StrengthsSection strengths={strengths} />
          
          <div className="border-t border-gold/40 my-8" />
          
          {/* Development Areas (formerly Blind Spots) */}
          <DevelopmentAreasSection developmentAreas={developmentAreas} />
          
          <div className="border-t border-gold/40 my-8" />
          
          {/* Frameworks Used (formerly Mental Models) */}
          <FrameworksUsedSection frameworks={frameworks} />

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
