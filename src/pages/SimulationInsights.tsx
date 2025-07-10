import { useState } from "react";
import { useLocation } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import SimulationHeader from "@/components/simulation/SimulationHeader";
import SessionContextCard from "@/components/simulation/SessionContextCard";
import SessionSummaryCard from "@/components/simulation/SessionSummaryCard";
import StrengthsSection from "@/components/simulation/StrengthsSection";
import BlindSpotsSection from "@/components/simulation/BlindSpotsSection";
import GameProgressSection from "@/components/simulation/GameProgressSection";
import MentalModelsSection from "@/components/simulation/MentalModelsSection";
import WisdomSection from "@/components/simulation/WisdomSection";
import PersonalReflectionSection from "@/components/simulation/PersonalReflectionSection";
import ActionsSection from "@/components/simulation/ActionsSection";

const SimulationInsights = () => {
  const location = useLocation();
  const { scenarioDomain, contextType, scenarioContext, sessionDuration, realtimeFeedback } = location.state || {};
  
  const [personalNotes, setPersonalNotes] = useState("");

  const handleDownload = () => {
    console.log("Downloading student insight deck...");
  };

  const handleScheduleFollowup = () => {
    console.log("Scheduling follow-up practice session...");
  };

  const handleSaveNotes = () => {
    console.log("Saving to learning archive...");
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-background font-editorial pb-20">
      <SimulationHeader 
        contextType={contextType}
        sessionDuration={sessionDuration}
        onDownload={handleDownload}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-6 space-y-8 max-w-none">
          <SessionContextCard 
            scenarioDomain={scenarioDomain}
            contextType={contextType}
            scenarioContext={scenarioContext}
          />
          
          <SessionSummaryCard />
          
          <StrengthsSection />
          
          <BlindSpotsSection realtimeFeedback={realtimeFeedback} />
          
          <GameProgressSection realtimeFeedback={realtimeFeedback} />
          
          <MentalModelsSection />
          
          <WisdomSection />
          
          <PersonalReflectionSection 
            personalNotes={personalNotes}
            setPersonalNotes={setPersonalNotes}
            onSaveNotes={handleSaveNotes}
          />
          
          <ActionsSection 
            onScheduleFollowup={handleScheduleFollowup}
            onDownload={handleDownload}
          />
        </div>

        <div className="text-center py-8 pb-32 text-xs text-muted-foreground opacity-50">
          Inner Architect • Student Practice • Powered by Intelligence
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default SimulationInsights;