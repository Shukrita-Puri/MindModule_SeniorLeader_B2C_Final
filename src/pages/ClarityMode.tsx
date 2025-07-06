
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import MainNavigation from "@/components/MainNavigation";
import VoiceFirstChat from "@/components/VoiceFirstChat";
import SessionFeedback from "@/components/SessionFeedback";
import vibrantGrowthIllustration from "@/assets/vibrant-growth-illustration.png";

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

const ClarityMode = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);

  const handleStartSession = () => {
    setSessionStarted(true);
  };

  const handleSendMessage = (message: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text: message,
      sender: "user",
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, newMessage]);
    
    // Simulate AI response with recommendations
    setTimeout(() => {
      const response: Message = {
        id: (Date.now() + 1).toString(),
        text: "I hear you. Let me help you untangle these thoughts and find your clarity...",
        sender: "ai",
        timestamp: new Date(),
        recommendations: [
          {
            id: "1",
            type: "article",
            title: "Managing Academic Stress Like a Pro",
            description: "Evidence-based strategies for high-achieving students.",
            author: "Student Success Journal"
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
    console.log("Session feedback:", feedback);
    setShowFeedback(false);
    navigate('/clarity-summary', { state: { messages, feedback } });
  };

  const handleFeedbackSkip = () => {
    setShowFeedback(false);
    navigate('/clarity-summary', { state: { messages } });
  };

  if (sessionStarted) {
    return (
      <div className="relative flex min-h-screen flex-col bg-background font-editorial pb-20">
        {/* Minimal Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <button
            onClick={() => navigate("/inner-architect")}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft size={18} className="text-foreground" />
          </button>
          <h1 className="text-xl font-heading font-medium text-foreground">
            Clarity Session
          </h1>
          <div className="w-10"></div>
        </div>

        {/* Voice-First Chat Interface */}
        <div className="flex-1">
          <VoiceFirstChat
            title="Clarity Session"
            subtitle="Share what's on your mind"
            participantName="Clarity Guide"
            initialMessage="What would you like to explore today?"
            onSendMessage={handleSendMessage}
            onEndSession={handleEndSession}
            messages={messages}
            isVoiceActive={false}
            onVoiceToggle={() => {}}
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
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-background font-editorial pb-20">
      {/* Minimal Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <button
          onClick={() => navigate("/inner-architect")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <h1 className="text-xl font-heading font-medium text-foreground">
          Clarity
        </h1>
        <div className="w-10"></div>
      </div>

      {/* Hero Section */}
      <div className="px-8 py-20 text-center max-w-2xl mx-auto">
        <div className="w-40 h-40 mx-auto mb-12 rounded-full overflow-hidden shadow-xl border-4 border-accent/20">
          <img 
            src={vibrantGrowthIllustration} 
            alt="Mental clarity and growth"
            className="w-full h-full object-cover"
          />
        </div>
        
        <h2 className="text-3xl font-heading font-medium text-foreground mb-8 leading-tight">
          Thought Unclutter
        </h2>
        
        <p className="text-lg text-muted-foreground leading-relaxed mb-16">
          Drag mental noise into a trash zone. Visualize space clearing.<br/>
          <span className="text-sm italic">"AP Physics test + friendship drama + debate tryouts — what's taking space?"</span>
        </p>

        <Button 
          onClick={handleStartSession}
          className="bg-primary text-primary-foreground hover:bg-primary/90 px-12 py-4 text-lg font-body rounded-full"
        >
          Begin conversation
        </Button>
      </div>

      <MainNavigation />
    </div>
  );
};

export default ClarityMode;
