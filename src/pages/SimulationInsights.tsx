import { useState } from "react";
import { useLocation } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import SimulationHeader from "@/components/simulation/SimulationHeader";
import SessionContextCard from "@/components/simulation/SessionContextCard";
import StrengthsSection from "@/components/simulation/StrengthsSection";
import BlindSpotsSection from "@/components/simulation/BlindSpotsSection";
import MentalModelsSection from "@/components/simulation/MentalModelsSection";
import PersonalReflectionSection from "@/components/simulation/PersonalReflectionSection";

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
    <div className="relative flex min-h-screen flex-col font-editorial pb-20">
      <SimulationHeader 
        contextType={contextType}
        sessionDuration={sessionDuration}
        onDownload={handleDownload}
        onScheduleFollowup={handleScheduleFollowup}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-8 space-y-12 max-w-5xl mx-auto pb-32">
          <SessionContextCard 
            scenarioDomain={scenarioDomain}
            contextType={contextType}
            scenarioContext={scenarioContext}
          />
          
          <StrengthsSection />
          
          <BlindSpotsSection realtimeFeedback={realtimeFeedback} />
          
          <MentalModelsSection />
          
          <PersonalReflectionSection 
            personalNotes={personalNotes}
            setPersonalNotes={setPersonalNotes}
            onSaveNotes={handleSaveNotes}
          />
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default SimulationInsights;