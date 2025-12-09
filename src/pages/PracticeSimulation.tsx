import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import TopNavigation from "@/components/simulation/TopNavigation";
import MainNavigation from "@/components/MainNavigation";
import DialogueInterface from "@/components/dialogue/DialogueInterface";
import SessionFeedback from "@/components/SessionFeedback";
import PrivacyFooter from "@/components/home/PrivacyFooter";
import { Toaster } from "@/components/ui/toaster";

// Map persona types to database persona IDs - generic fallback mapping
// The LLM will intelligently infer the specific persona context from scenario + additionalContext
const PERSONA_ID_MAP: Record<string, string> = {
  // Admissions personas
  'admissions': 'oxbridge_tutor',
  'university-admissions': 'oxbridge_tutor',
  'University Admissions Officer': 'oxbridge_tutor',
  
  // Dean personas (LLM infers university vs school from context)
  'dean': 'oxbridge_tutor',
  'Dean / Head of School': 'oxbridge_tutor',
  
  // Teacher personas
  'teacher': 'academic-teacher',
  'Teacher / Professor': 'academic-teacher',
  
  // Alumni personas
  'alumnus': 'successful_alumnus',
  'alumni': 'successful_alumnus',
  'Alumni / Graduate': 'successful_alumnus',
  'Recent University Alumnus': 'successful_alumnus',
  
  // Other personas
  'debate-judge': 'debate-judge',
  'Competition Judge': 'debate-judge',
  'counselor': 'careers-advisor',
  'careers-advisor': 'careers-advisor',
  'School Counselor': 'careers-advisor',
  'peer': 'peer-student',
  'classmate': 'peer-student',
  'Classmate / Peer': 'peer-student',
  'coach': 'head-teacher',
  'head-teacher': 'head-teacher',
  'Coach / Sports Mentor': 'head-teacher',
  'student-leader': 'peer-student',
  'Club President / Student Leader': 'peer-student',
  'parent': 'head-teacher',
  'Parent / Guardian': 'head-teacher',
};

// Map scenario titles to database scenario IDs
const SCENARIO_ID_MAP: Record<string, string> = {
  'Oxbridge Interview': 'oxbridge_interview',
  'Scholarship Interview': 'oxbridge_interview', // fallback
  'Model UN Speech': 'oxbridge_interview', // fallback
  'Debate Tournament': 'oxbridge_interview', // fallback  
  'Alumni Networking': 'alumni_networking',
};

const PracticeSimulation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    scenarioDomain, 
    contextType, 
    scenarioContext,
    specificScenario,
    aiPersona,
    additionalContext,
    personaType,
    customPersona,
    personalityStyle,
    voicePreference,
    attachments
  } = location.state || {};
  
  const [showFeedback, setShowFeedback] = useState(false);

  // Map the config page values to database IDs
  const scenarioId = SCENARIO_ID_MAP[specificScenario] || 'oxbridge_interview';
  const personaId = PERSONA_ID_MAP[personaType] || 'oxbridge-interviewer';

  // Map personality style to LLM format
  const mappedPersonalityStyle = personalityStyle === 'warm' ? 'warm-supportive'
    : personalityStyle === 'analytical' ? 'analytical-direct'
    : personalityStyle === 'challenging' ? 'challenging-probing'
    : 'neutral-professional';

  // Map voice preference to LLM format
  const mappedVoiceStyle = voicePreference === 'masculine' ? 'masculine'
    : voicePreference === 'feminine' ? 'feminine'
    : undefined;

  // Map attachments to expected format
  const mappedAttachments = attachments?.map((file: File) => ({
    name: file.name,
    type: file.type,
    content: undefined // Would need FileReader to extract content
  })) || [];

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
        specificScenario,
        personaType,
        feedback,
        sessionDuration: "15 minutes",
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
        specificScenario,
        personaType,
        sessionDuration: "15 minutes",
      } 
    });
  };

  return (
    <div className="min-h-screen font-body flex flex-col">
      <TopNavigation backPath="/practice/configure" />
      
      {/* Dialogue Interface */}
      <div className="flex-1 relative pt-16">
        <DialogueInterface
          scenarioId={scenarioId}
          personaId={personaId}
          coachPersonality="supportive"
          personalityStyle={mappedPersonalityStyle}
          voiceStyle={mappedVoiceStyle}
          additionalContext={additionalContext}
          attachments={mappedAttachments}
          onEndSession={handleEndSession}
        />
      </div>

      {/* Session Feedback Modal */}
      {showFeedback && (
        <SessionFeedback
          onSubmit={handleFeedbackSubmit}
          onSkip={handleFeedbackSkip}
        />
      )}

      <PrivacyFooter />
      <MainNavigation />
      {!showFeedback && <Toaster />}
    </div>
  );
};

export default PracticeSimulation;
