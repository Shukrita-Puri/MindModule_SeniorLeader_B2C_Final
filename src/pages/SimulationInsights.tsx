import { useState } from "react";
import { useLocation } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import SimulationHeader from "@/components/simulation/SimulationHeader";
import SessionContextCard from "@/components/simulation/SessionContextCard";
import SessionSummaryCard from "@/components/simulation/SessionSummaryCard";
import StrengthsAndDevelopmentSection from "@/components/simulation/StrengthsAndDevelopmentSection";
import MentalModelsSection from "@/components/simulation/MentalModelsSection";
import WisdomSection from "@/components/simulation/WisdomSection";
import PersonalReflectionSection from "@/components/simulation/PersonalReflectionSection";
import ActionsSection from "@/components/simulation/ActionsSection";

const SimulationInsights = () => {
  const location = useLocation();
  const { scenarioDomain, contextType, scenarioContext, sessionDuration } = location.state || {};
  
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
        <div className="max-w-4xl mx-auto p-8 space-y-12">
          <SessionContextCard 
            scenarioDomain={scenarioDomain}
            contextType={contextType}
            scenarioContext={scenarioContext}
          />
          
          <SessionSummaryCard />
          
          <StrengthsAndDevelopmentSection />
          
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