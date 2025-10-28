import { useState } from "react";
import { useLocation } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import TopNavigation from "@/components/simulation/TopNavigation";
import SimulationHeader from "@/components/simulation/SimulationHeader";
import SessionContextCard from "@/components/simulation/SessionContextCard";
import AchievementUnlockedSection from "@/components/simulation/AchievementUnlockedSection";
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
      <TopNavigation />
      
      <SimulationHeader 
        contextType={contextType}
        sessionDuration={sessionDuration}
        onDownload={handleDownload}
        onScheduleFollowup={handleScheduleFollowup}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 md:px-8 py-8 space-y-8 max-w-5xl mx-auto pb-32">
          <SessionContextCard 
            scenarioDomain={scenarioDomain}
            contextType={contextType}
            scenarioContext={scenarioContext}
          />
          
          <div className="border-t border-gold/40 my-8" />
          
          <AchievementUnlockedSection />
          
          <div className="border-t border-gold/40 my-8" />
          
          <StrengthsSection />
          
          <div className="border-t border-gold/40 my-8" />
          
          <BlindSpotsSection realtimeFeedback={realtimeFeedback} />
          
          <div className="border-t border-gold/40 my-8" />
          
          <MentalModelsSection />
          
          <div className="border-t border-gold/40 my-8" />
          
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