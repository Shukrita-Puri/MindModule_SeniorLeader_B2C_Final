import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import TopNavigation from "@/components/simulation/TopNavigation";
import MainNavigation from "@/components/MainNavigation";
import TextFirstDialogue from "@/components/dialogue/TextFirstDialogue";
import SessionFeedback from "@/components/SessionFeedback";
import PrivacyFooter from "@/components/home/PrivacyFooter";
import { Toaster } from "@/components/ui/toaster";

// Map persona types to database persona IDs
const PERSONA_ID_MAP: Record<string, string> = {
  'admissions': 'oxbridge_tutor',
  'university-admissions': 'oxbridge_tutor',
  'University Admissions Officer': 'oxbridge_tutor',
  'dean': 'oxbridge_tutor',
  'Dean / Head of School': 'oxbridge_tutor',
  'teacher': 'academic-teacher',
  'Teacher / Professor': 'academic-teacher',
  'alumnus': 'successful_alumnus',
  'alumni': 'successful_alumnus',
  'Alumni / Graduate': 'successful_alumnus',
  'Recent University Alumnus': 'successful_alumnus',
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
  'Scholarship Interview': 'oxbridge_interview',
  'Model UN Speech': 'oxbridge_interview',
  'Debate Tournament': 'oxbridge_interview',
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
    attachments,
    practiceDuration,
    coachingStyle
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
    content: undefined
  })) || [];

  // Build persona display from user configuration with proper formatting
  const formatPersonaName = (type: string) => {
    // Map dropdown values to display names
    const nameMap: Record<string, string> = {
      // Dropdown values (from configure page)
      'admissions': 'Admissions Officer',
      'classmate': 'Classmate',
      'teacher': 'Teacher',
      'dean': 'Dean',
      'student-leader': 'Student Leader',
      'parent': 'Parent',
      'coach': 'Coach',
      'counselor': 'School Counselor',
      'alumni': 'Alumni',
      // Fallback display labels
      'university-admissions': 'Admissions Officer',
      'University Admissions Officer': 'Admissions Officer',
      'Dean / Head of School': 'Dean',
      'Teacher / Professor': 'Teacher',
      'Alumni / Graduate': 'Alumni',
      'Recent University Alumnus': 'Alumni',
      'debate-judge': 'Competition Judge',
      'Competition Judge': 'Competition Judge',
      'careers-advisor': 'Careers Advisor',
      'School Counselor': 'School Counselor',
      'Classmate / Peer': 'Classmate',
      'head-teacher': 'Head Teacher',
      'Coach / Sports Mentor': 'Coach',
      'Club President / Student Leader': 'Student Leader',
      'Parent / Guardian': 'Parent',
    };
    return nameMap[type] || type || "Conversation Partner";
  };

  const formatPersonalityStyle = (style: string) => {
    const styleMap: Record<string, string> = {
      // Exact dropdown values from configure page
      'warm-supportive': 'Warm & Supportive',
      'analytical-direct': 'Analytical & Direct',
      'challenging-probing': 'Challenging & Probing',
      'neutral-professional': 'Neutral & Professional',
      // Legacy/fallback values
      'warm': 'Warm & Supportive',
      'analytical': 'Analytical & Direct',
      'challenging': 'Challenging & Probing',
      'neutral': 'Neutral & Professional',
      'Challenging & Probing': 'Challenging & Probing',
    };
    return styleMap[style] || style || "Professional";
  };

  const displayPersona = {
    name: formatPersonaName(personaType),
    role: formatPersonalityStyle(personalityStyle)
  };

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
        sessionDuration: `${practiceDuration || 15} minutes`,
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
        sessionDuration: `${practiceDuration || 15} minutes`,
      } 
    });
  };

  return (
    <div className="min-h-screen font-body flex flex-col">
      <TopNavigation backPath="/practice/configure" />
      
      {/* Text-First Dialogue Interface with Voice Toggle */}
      <div className="flex-1 relative pt-16">
        <TextFirstDialogue
          scenarioId={scenarioId}
          personaId={personaId}
          coachPersonality={coachingStyle || 'supportive'}
          personalityStyle={mappedPersonalityStyle}
          voiceStyle={mappedVoiceStyle}
          additionalContext={additionalContext}
          attachments={mappedAttachments}
          practiceDuration={practiceDuration || 15}
          coachingStyle={coachingStyle || 'supportive'}
          onEndSession={handleEndSession}
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

      <PrivacyFooter />
      <MainNavigation />
      {!showFeedback && <Toaster />}
    </div>
  );
};

export default PracticeSimulation;
