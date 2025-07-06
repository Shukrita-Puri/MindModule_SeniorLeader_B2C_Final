import { useState } from "react";
import { ArrowLeft, Brain } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import VoiceFirstChat from "@/components/VoiceFirstChat";
import SessionFeedback from "@/components/SessionFeedback";
import scenarioIllustration from "@/assets/scenario-illustration.png";

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

// Floating Practice Coach Component
const FloatingPracticeCoach = ({ messages }: { messages: Message[] }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="fixed bottom-32 right-4 z-40">
      {isExpanded ? (
        <Card className="w-72 max-h-48 overflow-y-auto animate-fade-in">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <Brain size={12} className="text-primary-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground">Practice Coach</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsExpanded(false)}
                className="h-5 w-5 p-0 text-xs"
              >
                ×
              </Button>
            </div>
            
            <div className="space-y-2">
              <div className="bg-primary/5 p-2 rounded text-xs">
                <div className="font-medium text-primary mb-1">Communication Pattern</div>
                <div className="text-foreground">Empathetic but assertive</div>
              </div>
              
              <div className="bg-accent/5 p-2 rounded text-xs">
                <div className="font-medium text-accent mb-1">Blind Spot Alert</div>
                <div className="text-foreground">Consider their perspective</div>
              </div>
              
              <div className="pt-1 border-t border-border">
                <div className="text-xs text-muted-foreground">
                  {messages.length} exchanges practiced
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          onClick={() => setIsExpanded(true)}
          className="w-10 h-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
        >
          <Brain size={16} />
        </Button>
      )}
    </div>
  );
};

const Simulation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { scenarioDomain, contextType, scenarioContext } = location.state || {};
  
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
    
    // Simulate role-play response with coaching insights
    setTimeout(() => {
      const responses = [
        "I understand your perspective, but I have some concerns about the timeline. How do you think we can address the resource constraints?",
        "That's an interesting point. Let me push back a bit - what if the stakeholders aren't on board with this approach?",
        "I appreciate your enthusiasm, but I'm wondering about the potential risks. How would you handle pushback from the team?",
        "Good point. Let me challenge that assumption - what evidence do we have that this will actually work?",
        "I hear what you're saying, but I'm concerned about the implementation. What's your backup plan if this doesn't go as expected?"
      ];
      
      const response: Message = {
        id: (Date.now() + 1).toString(),
        text: responses[Math.floor(Math.random() * responses.length)],
        sender: "ai",
        timestamp: new Date(),
        recommendations: [
          {
            id: "1",
            type: "framework",
            title: "Crucial Conversations Model",
            description: "Framework for handling difficult conversations with confidence and empathy.",
            author: "Communication Strategy"
          },
          {
            id: "2",
            type: "article",
            title: "The Art of Persuasion Under Pressure",
            description: "Research on maintaining composure and clarity during challenging negotiations.",
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
    console.log("Session feedback:", feedback);
    setShowFeedback(false);
    navigate('/simulation-insights', { 
      state: { 
        scenarioDomain, 
        contextType,
        scenarioContext,
        messages,
        feedback,
        sessionDuration: "15 minutes"
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
        messages,
        sessionDuration: "15 minutes"
      } 
    });
  };

  if (sessionStarted) {
    return (
      <div className="relative flex min-h-screen flex-col bg-background font-editorial pb-20">
        {/* Minimal Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <button
            onClick={() => navigate("/social-intelligence-lab")}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft size={18} className="text-foreground" />
          </button>
          <div className="text-center">
            <h1 className="text-xl font-heading font-medium text-foreground">
              Practice Simulation
            </h1>
            <p className="text-sm text-muted-foreground">
              {contextType || "Role-play & Tough Conversations"}
            </p>
          </div>
          <div className="w-10"></div>
        </div>

        {/* Text-Based Chat Interface */}
        <div className="flex-1">
          <VoiceFirstChat
            title="Practice Simulation"
            subtitle="Role-play challenging conversations"
            participantName="Conversation Partner"
            initialMessage={`Let's practice this scenario: ${scenarioContext || "I'll play the role of someone who challenges your ideas. Try to navigate this conversation with confidence and empathy."}`}
            onSendMessage={handleSendMessage}
            onEndSession={handleEndSession}
            messages={messages}
            isVoiceActive={false}
            onVoiceToggle={() => {}}
            showRecommendations={true}
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

        <FloatingPracticeCoach messages={messages} />
        <MainNavigation />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-background font-editorial pb-20">
      {/* Minimal Header */}
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

      {/* Hero Section */}
      <div className="px-8 py-20 text-center max-w-2xl mx-auto">
        <div className="w-40 h-40 mx-auto mb-12 rounded-full overflow-hidden shadow-xl border-4 border-accent/20">
          <img 
            src={scenarioIllustration} 
            alt="Practice simulation and role-play"
            className="w-full h-full object-cover"
          />
        </div>
        
        <h2 className="text-3xl font-heading font-medium text-foreground mb-8 leading-tight">
          Practice Simulation
        </h2>
        
        <p className="text-lg text-muted-foreground leading-relaxed mb-16">
          Role-play challenging conversations and explore blind spots.<br/>
          <span className="text-sm italic">"Practice that difficult conversation with your parents, teacher, or friend before it happens."</span>
        </p>

        {scenarioContext && (
          <div className="mb-8 p-4 bg-card/50 rounded-lg border border-border">
            <h3 className="font-medium text-foreground mb-2">Your Scenario:</h3>
            <p className="text-sm text-muted-foreground">
              {scenarioContext}
            </p>
          </div>
        )}

        <Button 
          onClick={handleStartSession}
          className="bg-primary text-primary-foreground hover:bg-primary/90 px-12 py-4 text-lg font-body rounded-full"
        >
          Start Practice
        </Button>
        
        <p className="text-sm text-muted-foreground text-center max-w-lg mt-6">
          Get real-time coaching on communication patterns, blind spots, and conversation strategies
        </p>
      </div>

      <MainNavigation />
    </div>
  );
};

export default Simulation;