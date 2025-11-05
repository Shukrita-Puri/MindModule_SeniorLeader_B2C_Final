import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import TopNavigation from "@/components/simulation/TopNavigation";
import MainNavigation from "@/components/MainNavigation";
import CollegeAdmissionsSimulation from "@/components/CollegeAdmissionsSimulation";
import SessionFeedback from "@/components/SessionFeedback";
import SessionContextCard from "@/components/simulation/SessionContextCard";
import ObservatoryModal from "@/components/ObservatoryModal";
import PrivacyFooter from "@/components/home/PrivacyFooter";
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
    personaType,
    customPersona
  } = location.state || {};
  
  const [showFeedback, setShowFeedback] = useState(false);
  const [showObservatory, setShowObservatory] = useState(false);

  // Demo: Show observatory after 5 seconds (you can adjust trigger logic)
  useState(() => {
    const timer = setTimeout(() => {
      setShowObservatory(true);
    }, 5000);
    return () => clearTimeout(timer);
  });

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
        selectedPersonas: personaType && personaType !== 'custom' ? [personaType] : [],
        customPersonas: personaType === 'custom' ? customPersona : '',
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
        selectedPersonas: personaType && personaType !== 'custom' ? [personaType] : [],
        customPersonas: personaType === 'custom' ? customPersona : '',
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
      <TopNavigation backPath="/practice/configure" />
      
      {/* College Admissions Simulation */}
      <div className="flex-1 relative pt-16">
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

      {/* Mind Module: The Observatory Modal */}
      <ObservatoryModal
        isOpen={showObservatory}
        onClose={() => setShowObservatory(false)}
        variant="mirror"
        signal="You're perceiving links between logic, emotion, and timing."
        lens="From this altitude, patterns reveal themselves."
        application="What principle connects these insights — trust, timing, or truth?"
        ctaText="Synthesize"
      />

      <PrivacyFooter />
      <MainNavigation />
      {/* Only show toaster during active conversation, not when feedback modal is open */}
      {!showFeedback && <Toaster />}
    </div>
  );
};

export default Simulation;