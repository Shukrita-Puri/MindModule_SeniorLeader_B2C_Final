
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
  const [isJournalMode, setIsJournalMode] = useState(false);

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
    
    // In journal mode, don't respond - just save the thought
    if (isJournalMode) {
      return;
    }

    // Simulate AI response with recommendations and educational content
    setTimeout(() => {
      const response: Message = {
        id: (Date.now() + 1).toString(),
        text: "I hear you. Let me share some frameworks that might help you gain clarity on this...",
        sender: "ai",
        timestamp: new Date(),
        recommendations: [
          {
            id: "1",
            type: "framework",
            title: "The Eisenhower Matrix",
            description: "Separate urgent vs important to prioritize effectively. Used by presidents and CEOs.",
            author: "Decision-Making Framework"
          },
          {
            id: "2", 
            type: "article",
            title: "Cognitive Load Theory for Students",
            description: "Neuroscience research on managing mental bandwidth for academic performance.",
            author: "Harvard Educational Review"
          },
          {
            id: "3",
            type: "podcast",
            title: "Ancient Wisdom: Stoic Practices for Modern Students",
            description: "How Marcus Aurelius and Seneca dealt with overwhelming responsibilities.",
            duration: "12 min",
            author: "Philosophy for Students"
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
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-heading font-medium text-foreground">
              {isJournalMode ? "Journal" : "Clarity Session"}
            </h1>
            <button
              onClick={() => setIsJournalMode(!isJournalMode)}
              className={`px-3 py-1 rounded-full text-xs transition-all ${
                isJournalMode 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {isJournalMode ? "Journal" : "Guide"}
            </button>
          </div>
          <div className="w-10"></div>
        </div>

        {/* Text-First Chat Interface */}
        <div className="flex-1">
          <VoiceFirstChat
            title={isJournalMode ? "Journal Mode" : "Clarity Session"}
            subtitle={isJournalMode ? "Private reflection space" : "Share what's on your mind for guidance"}
            participantName={isJournalMode ? "Personal Journal" : "Clarity Guide"}
            initialMessage={isJournalMode ? "What's on your mind? (This is just for you - no responses)" : "What would you like to explore today? I'll share relevant frameworks, research, and wisdom to help you think it through."}
            onSendMessage={handleSendMessage}
            onEndSession={handleEndSession}
            messages={messages}
            isVoiceActive={false}
            onVoiceToggle={() => {}}
            showRecommendations={!isJournalMode}
            showOrb={false}
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

        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setIsJournalMode(false)}
              className={`px-4 py-2 rounded-full text-sm transition-all ${
                !isJournalMode 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              Guided Session
            </button>
            <button
              onClick={() => setIsJournalMode(true)}
              className={`px-4 py-2 rounded-full text-sm transition-all ${
                isJournalMode 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              Journal Mode
            </button>
          </div>
          
          <Button 
            onClick={handleStartSession}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-12 py-4 text-lg font-body rounded-full"
          >
            {isJournalMode ? "Start journaling" : "Begin conversation"}
          </Button>
          
          <p className="text-sm text-muted-foreground text-center max-w-lg">
            {isJournalMode 
              ? "Private space for your thoughts - no AI responses, just your reflection"
              : "Get frameworks, research insights, and ancient wisdom to help clarify your thinking"
            }
          </p>
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default ClarityMode;
