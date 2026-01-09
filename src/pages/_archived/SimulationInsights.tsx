import { useState } from "react";
import { useLocation } from "react-router-dom";
import MainNavigation from "@/components/_archived/MainNavigation";
import TopNavigation from "@/components/simulation/TopNavigation";
import SimulationHeader from "@/components/simulation/SimulationHeader";
import SessionContextCard from "@/components/simulation/SessionContextCard";
import AchievementUnlockedSection from "@/components/simulation/AchievementUnlockedSection";
import StrengthsSection from "@/components/simulation/StrengthsSection";
import BlindSpotsSection from "@/components/simulation/BlindSpotsSection";
import MentalModelsSection from "@/components/simulation/MentalModelsSection";
import PersonalReflectionSection from "@/components/simulation/PersonalReflectionSection";
import MetaSkillProgressCard from "@/components/simulation/MetaSkillProgressCard";
import ScenariosPracticedCard from "@/components/simulation/ScenariosPracticedCard";
import FourPillarsTracker from "@/components/simulation/FourPillarsTracker";
import RealWorldWinsCard from "@/components/simulation/RealWorldWinsCard";
import PrivacyFooter from "@/components/home/PrivacyFooter";

const SimulationInsights = () => {
  const location = useLocation();
  const { scenarioDomain, contextType, scenarioContext, sessionDuration, realtimeFeedback, selectedPersonas, customPersonas } = location.state || {};
  
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
      <TopNavigation backPath="/practice/simulation" />
      
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
            selectedPersonas={selectedPersonas}
            customPersonas={customPersonas}
          />
          
          <div className="border-t border-gold/40 my-8" />

          {/* Mental Fitness Score & Meta-Skill Progress */}
          <MetaSkillProgressCard 
            mentalFitnessScore={78}
            mentalFitnessChange={6}
            thinkingClarity={{ current: 82, change: 4 }}
            socialIntelligence={{ current: 76, change: 2 }}
            adaptiveCapacity={{ current: 74, change: 3 }}
            selfRegulation={{ current: 81, change: 5 }}
            percentile={12}
          />
          
          <div className="border-t border-gold/40 my-8" />

          {/* Scenarios Practiced Dashboard */}
          <ScenariosPracticedCard 
            totalPractices={124}
            thisWeekBreakdown={{
              communication: 3,
              adaptive: 2,
              energy: 5,
              context: 4
            }}
            consistencyRating="Elite"
            percentile={8}
          />
          
          <div className="border-t border-gold/40 my-8" />
          
          <AchievementUnlockedSection />
          
          <div className="border-t border-gold/40 my-8" />
          
          <StrengthsSection />
          
          <div className="border-t border-gold/40 my-8" />
          
          <BlindSpotsSection blindSpots={[]} />
          
          <div className="border-t border-gold/40 my-8" />
          
          <MentalModelsSection />
          
          <div className="border-t border-gold/40 my-8" />

          {/* Four Pillars Progress Tracker */}
          <FourPillarsTracker 
            thinkingClarity={{
              score: 82,
              mastered: ['Context Triangulation Mastery', 'Blind Spot Recognition'],
              developing: ['Second-Order Thinking'],
              scenariosPracticed: 34,
              blindSpotsRevealed: 47
            }}
            socialIntelligence={{
              score: 76,
              mastered: ['Communication Clarity', 'Perspective-Taking'],
              developing: ['Influence Without Authority'],
              scenariosPracticed: 28,
              breakthroughs: 12
            }}
            adaptiveCapacity={{
              score: 74,
              mastered: ['Rapid Context Switching'],
              developing: ['Ambiguity Tolerance', 'Strategic Pivoting'],
              scenariosPracticed: 22,
              adaptations: 18
            }}
            selfRegulation={{
              score: 81,
              mastered: ['Pause Reflexes', 'Flow State Access', 'Energy Management'],
              developing: [],
              scenariosPracticed: 45,
              pausePractices: 45,
              flowStates: 23,
              energyTransitions: 67
            }}
          />

          <div className="border-t border-gold/40 my-8" />

          {/* Real-World Wins */}
          <RealWorldWinsCard 
            totalWins={18}
            wins={[
              { category: 'communication', text: 'Navigated difficult feedback conversation using pause' },
              { category: 'communication', text: 'Used triangulation to understand colleague\'s resistance' },
              { category: 'communication', text: 'Recognized my own blind spot in team meeting' },
              { category: 'adaptability', text: 'Pivoted strategy when initial approach wasn\'t working' },
              { category: 'adaptability', text: 'Stayed calm during unexpected project change' },
              { category: 'regulation', text: 'Caught myself before reactive email, paused, reframed' },
              { category: 'regulation', text: 'Achieved flow state during complex analysis' },
              { category: 'regulation', text: 'Managed energy through challenging day' }
            ]}
            userReflection="The meta-skills are becoming automatic"
          />

          <div className="border-t border-gold/40 my-8" />
          
          <PersonalReflectionSection 
            personalNotes={personalNotes}
            setPersonalNotes={setPersonalNotes}
            onSaveNotes={handleSaveNotes}
          />
        </div>
      </div>

      <PrivacyFooter />
      <MainNavigation />
    </div>
  );
};

export default SimulationInsights;