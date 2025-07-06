
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

    // Simulate AI response with diverse educational content
    setTimeout(() => {
      const responses = [
        {
          text: "I hear you. Let me share some frameworks and insights that might help you gain clarity on this situation...",
          recommendations: [
            {
              id: "1",
              type: "framework" as const,
              title: "The Eisenhower Matrix",
              description: "Separate urgent vs important to prioritize effectively. Used by presidents and CEOs worldwide.",
              author: "Decision-Making Framework"
            },
            {
              id: "2", 
              type: "article" as const,
              title: "Cognitive Load Theory for Students",
              description: "Neuroscience research on managing mental bandwidth for peak academic performance.",
              author: "Harvard Educational Review"
            },
            {
              id: "3",
              type: "podcast" as const,
              title: "Ancient Stoic Practices for Modern Students",
              description: "How Marcus Aurelius and Seneca dealt with overwhelming responsibilities and mental clarity.",
              duration: "12 min",
              author: "Philosophy for Students"
            }
          ]
        },
        {
          text: "That sounds challenging. Here are some mental models and neuroscience insights that might help you process this...",
          recommendations: [
            {
              id: "4",
              type: "framework" as const, 
              title: "The OODA Loop",
              description: "Observe, Orient, Decide, Act - a decision-making framework used by fighter pilots and executives.",
              author: "Strategic Thinking"
            },
            {
              id: "5",
              type: "article" as const,
              title: "The Neuroscience of Stress and Focus",
              description: "How your brain processes stress and practical techniques to maintain clarity under pressure.",
              author: "Journal of Applied Psychology"
            },
            {
              id: "6",
              type: "video" as const,
              title: "Buddhist Mindfulness for Academic Pressure",
              description: "Ancient mindfulness techniques adapted for modern student challenges.",
              duration: "8 min",
              author: "Mindfulness Research"
            }
          ]
        },
        {
          text: "I understand the complexity you're facing. Let me share some research-backed approaches and wisdom traditions that address this...",
          recommendations: [
            {
              id: "7",
              type: "framework" as const,
              title: "Systems Thinking Model",
              description: "See the interconnections in your life rather than isolated problems. Used in therapy and coaching.",
              author: "Cognitive Behavioral Framework"
            },
            {
              id: "8",
              type: "article" as const, 
              title: "Flow State Research for Students",
              description: "Mihaly Csikszentmihalyi's research on optimal experience and how to achieve it during study.",
              author: "Positive Psychology Review"
            },
            {
              id: "9",
              type: "framework" as const,
              title: "Inner Calibration Breathing Technique",
              description: "Quick reset technique from our Inner Calibration section - try it when overwhelmed.",
              author: "Access Inner Calibration →"
            }
          ]
        }
      ];

      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      const response: Message = {
        id: (Date.now() + 1).toString(),
        text: randomResponse.text,
        sender: "ai",
        timestamp: new Date(),
        recommendations: randomResponse.recommendations
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
      <div className="fixed inset-0 bg-background font-body overflow-hidden">
        {/* Full Screen Text-Based Conversation */}
        <div className="h-full flex flex-col">
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
            hideContextInfo={true}
          />
        </div>

        {/* Session Feedback Modal */}
        {showFeedback && (
          <SessionFeedback
            onSubmit={handleFeedbackSubmit}
            onSkip={handleFeedbackSkip}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-background font-editorial pb-32">
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
      <div className="px-8 py-16 text-center max-w-2xl mx-auto">
        <div className="w-32 h-32 mx-auto mb-8 rounded-full overflow-hidden shadow-xl border-4 border-accent/20">
          <img 
            src={vibrantGrowthIllustration} 
            alt="Mental clarity and growth"
            className="w-full h-full object-cover"
          />
        </div>
        
        <h2 className="text-2xl font-heading font-medium text-foreground mb-6 leading-tight">
          Mental Clarity
        </h2>
        
        <p className="text-base text-muted-foreground leading-relaxed mb-12">
          Clear mental clutter through conversation or private journaling.
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
              Conversation
            </button>
            <button
              onClick={() => setIsJournalMode(true)}
              className={`px-4 py-2 rounded-full text-sm transition-all ${
                isJournalMode 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              Journal
            </button>
          </div>
          
          <Button 
            onClick={handleStartSession}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-12 py-4 text-lg font-body rounded-full"
          >
            {isJournalMode ? "Start journaling" : "Start conversation"}
          </Button>
          
          <p className="text-sm text-muted-foreground text-center max-w-lg">
            {isJournalMode 
              ? "Private space for your thoughts"
              : "Get research insights and frameworks during our conversation"
            }
          </p>
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default ClarityMode;
