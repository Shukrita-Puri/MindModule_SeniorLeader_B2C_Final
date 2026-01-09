
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import MainNavigation from "@/components/_archived/MainNavigation";
import VoiceFirstChat from "@/components/VoiceFirstChat";
import SessionFeedback from "@/components/SessionFeedback";

interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
  recommendations?: Array<{
    id: string;
    type: "article" | "podcast" | "video" | "framework";
    title: string;
    description: string;
    thumbnail?: string;
    duration?: string;
    author?: string;
  }>;
}

const MentorChat = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { scenarioDescription, selectedStakeholder, customPersona } = location.state || {};
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const stakeholderName = customPersona ? "Custom Persona" : selectedStakeholder;

  const handleSendMessage = (message: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text: message,
      sender: "user",
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, newMessage]);
    
    // Simulate mentor response with recommendations
    setTimeout(() => {
      const response: Message = {
        id: (Date.now() + 1).toString(),
        text: "That's an interesting perspective. Let me challenge that assumption and provide some frameworks that might help...",
        sender: "ai",
        timestamp: new Date(),
        recommendations: [
          {
            id: "1",
            type: "framework",
            title: "Crucial Conversations Framework",
            description: "A structured approach to handling difficult discussions.",
            author: "Kerry Patterson"
          },
          {
            id: "2",
            type: "article",
            title: "Leading Through Influence",
            description: "How to persuade without authority in complex situations.",
            author: "Harvard Business Review"
          }
        ]
      };
      setMessages(prev => [...prev, response]);
    }, 1500);
  };

  const handleEndSession = () => {
    setShowFeedback(true);
  };

  const handleFeedbackSubmit = (feedback: any) => {
    console.log("Mentor session feedback:", feedback);
    setShowFeedback(false);
    navigate("/mentor-insights", { 
      state: { 
        messages, 
        stakeholderName,
        sessionFeedback: feedback 
      } 
    });
  };

  const handleFeedbackSkip = () => {
    setShowFeedback(false);
    navigate("/mentor-insights", { 
      state: { 
        messages, 
        stakeholderName 
      } 
    });
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-gray-50 font-sans pb-20">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <button
          onClick={() => navigate("/mentor")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-lg font-bold text-black">MENTOR CHAT</h1>
        <div className="w-10"></div>
      </div>

      {/* Voice-First Chat Interface */}
      <div className="flex-1">
        <VoiceFirstChat
          title="Mentor Session"
          subtitle="Get guidance and challenge your thinking"
          participantName={stakeholderName}
          initialMessage={`I understand we need to discuss this scenario: "${scenarioDescription}". How would you like to approach this challenge?`}
          onSendMessage={handleSendMessage}
          onEndSession={handleEndSession}
          messages={messages}
          isVoiceActive={isVoiceActive}
          onVoiceToggle={() => setIsVoiceActive(!isVoiceActive)}
          showRecommendations={true}
          showOrb={true}
          hideContextInfo={false}
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

export default MentorChat;
