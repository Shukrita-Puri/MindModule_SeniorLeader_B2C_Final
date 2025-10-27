import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import CollegeAdmissionsSimulation from "@/components/CollegeAdmissionsSimulation";
import SessionFeedback from "@/components/SessionFeedback";
import SessionContextCard from "@/components/simulation/SessionContextCard";
import MetaSkillsWreath from "@/components/MetaSkillsWreath";
import { Toaster } from "@/components/ui/toaster";


const Simulation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    scenarioDomain, 
    contextType, 
    scenarioContext, 
    aiPersona,
    additionalContext,
    metaSkills
  } = location.state || {};
  
  const [showFeedback, setShowFeedback] = useState(false);

  const handleEndSession = () => {
    setShowFeedback(true);
  };

  const handleFeedbackSubmit = (feedback: any) => {
    console.log("Session feedback:", feedback);
    setShowFeedback(false);
    navigate('/practice/simulation-insights', { 
      state: { 
        scenarioDomain, 
        contextType,
        scenarioContext,
        feedback,
        sessionDuration: "15 minutes",
        realtimeFeedback: [
          { type: "coaching", message: "Great empathy! Try being more assertive with your solution.", timestamp: new Date() },
          { type: "blindspot", message: "Consider their perspective before responding.", timestamp: new Date() },
          { type: "achievement", message: "Excellent response! You've mastered this conversation style.", timestamp: new Date() }
        ]
      } 
    });
  };

  const handleFeedbackSkip = () => {
    setShowFeedback(false);
    navigate('/practice/simulation-insights', { 
      state: { 
        scenarioDomain, 
        contextType,
        scenarioContext,
        sessionDuration: "15 minutes",
        realtimeFeedback: [
          { type: "coaching", message: "Great empathy! Try being more assertive with your solution.", timestamp: new Date() },
          { type: "blindspot", message: "Consider their perspective before responding.", timestamp: new Date() },
          { type: "achievement", message: "Excellent response! You've mastered this conversation style.", timestamp: new Date() }
        ]
      } 
    });
  };

  // Build persona display from user configuration
  const displayPersona = aiPersona ? {
    name: aiPersona.type || "Conversation Partner",
    role: `${aiPersona.personality || "Professional"} - ${aiPersona.voicePreference || "Neutral"} Voice`,
    fullContext: additionalContext
  } : { 
    name: "Conversation Partner", 
    role: "Professional" 
  };

  return (
    <div className="min-h-screen font-body flex flex-col">
      {/* College Admissions Simulation - No header, direct entry */}
      <div className="flex-1 relative">
        {metaSkills && metaSkills.length > 0 && (
          <div className="absolute top-4 right-4 z-50">
            <MetaSkillsWreath metaSkills={metaSkills} />
          </div>
        )}
        <CollegeAdmissionsSimulation
          onEndSession={handleEndSession}
          sessionDuration={15}
          aiPersona={displayPersona}
        />
      </div>

      {/* Session Feedback Modal */}
      {showFeedback && (
        <SessionFeedback
          onSubmit={handleFeedbackSubmit}
          onSkip={handleFeedbackSkip}
        />
      )}

      <MainNavigation />
      <Toaster />
    </div>
  );
};

export default Simulation;