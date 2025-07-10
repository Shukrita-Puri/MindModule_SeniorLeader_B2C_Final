import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import VoiceFirstSimulation from "@/components/VoiceFirstSimulation";
import SessionFeedback from "@/components/SessionFeedback";
import SessionContextCard from "@/components/simulation/SessionContextCard";


const Simulation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { scenarioDomain, contextType, scenarioContext, selectedPersonas, customPersonas } = location.state || {};
  
  const [showFeedback, setShowFeedback] = useState(false);

  const handleEndSession = () => {
    setShowFeedback(true);
  };

  const handleFeedbackSubmit = (feedback: any) => {
    console.log("Session feedback:", feedback);
    setShowFeedback(false);
    navigate('/simulation-insights', { 
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
    navigate('/simulation-insights', { 
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

  return (
    <div className="min-h-screen bg-background font-editorial flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <button
          onClick={() => navigate("/social-intelligence-lab")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <h1 className="text-xl font-heading font-medium text-foreground">
          Practice Simulation
        </h1>
        <div className="w-10"></div>
      </div>

      {/* Scenario Context Summary */}
      <div className="p-6 flex-shrink-0">
        <SessionContextCard 
          scenarioDomain={scenarioDomain}
          contextType={contextType}
          scenarioContext={scenarioContext}
          selectedPersonas={selectedPersonas}
          customPersonas={customPersonas}
        />
      </div>

      {/* Voice-First Simulation */}
      <div className="flex-1 relative">
        <VoiceFirstSimulation
          onEndSession={handleEndSession}
          scenarioContext={scenarioContext || "I'll play the role of someone who challenges your ideas. Try to navigate this conversation with confidence and empathy."}
          sessionDuration={15}
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
    </div>
  );
};

export default Simulation;